/*
 * Root component and orchestrator: resolves configuration, owns the state (zoom,
 * view, and the detail machine), the session the plane keeps across view
 * toggles, and the things no child can do alone — the detail flights, which need
 * the origin (in the view), the destination (in the panel) and the visuals (in
 * the flight layers) at once.
 *
 * TWO decoupled lifecycles (`detail/machine.ts`): the PANEL is the container for
 * "there is something active" — uncovered once, covered once, unmoved while the
 * active object changes; the machine governs the OBJECT — where it sits relative
 * to the slot, and how one object is relayed out for the next. Exactly one copy
 * of the active object is visible at any moment (plane, flight, or panel), and no
 * frame ever shows two copies of one object — every painter reads the same
 * `activeCopy(state)` / `hiddenInstancesOf(state)`, changed in one React commit.
 *
 * Two things the panel does NOT do, because only the orchestrator knows when a
 * flight has landed: return focus, and move the object. While the clone flies the
 * origin button is `visibility: hidden`, and a hidden element does not accept
 * focus — so focus goes back in a layout effect of the commit that closes the
 * panel, the same commit that un-hides the button.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { gsap } from 'gsap';

import type {
  VitrinaApi,
  VitrinaDetailContext,
  VitrinaOpenCollision,
  VitrinaProps,
  VitrinaView,
} from './types';
import {
  DEFAULT_ZOOM_INDEX,
  DEFAULT_ZOOM_STEPS,
  DETAIL_FLIGHT_DURATION_VAR,
  DETAIL_FLIGHT_EASE,
  DETAIL_FLIGHT_SECONDS,
  DETAIL_PANEL_DURATION_VAR,
  DETAIL_PANEL_EASE,
  DETAIL_PANEL_SECONDS,
  resolveLayout,
} from './defaults';
import { VitrinaContext } from './context';
import { useIsomorphicLayoutEffect } from './gsap';
import { usePrefersReducedMotion } from './reducedMotion';
import { createSession } from './session';
import { Plane } from './plane/Plane';
import { Grid } from './grid/Grid';
import { Detail } from './detail/Detail';
import type { PanelAnim } from './detail/Detail';
import { activeCopy, hiddenInstancesOf, initialDetail, panelPresent, transition } from './detail/machine';
import type { DetailState, PanelPhase } from './detail/machine';

const clampIndex = (index: number, count: number): number =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(index)));

/** A click waiting for the controlled `activeId` prop to follow it. */
interface PendingOrigin {
  entityId: string;
  instanceId: string | null;
  animate: boolean;
}

/**
 * A duration custom property in seconds, read live so the CSS variables stay the
 * single source of truth for the choreography. `fallback` covers SSR/jsdom, where
 * the stylesheet is absent and `getComputedStyle` returns nothing.
 */
function readSeconds(root: Element | null, name: string, fallback: number): number {
  if (!root || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(root).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return fallback;
  return raw.endsWith('ms') ? value / 1000 : value;
}

export function Vitrina({
  entities,
  instances,
  layout,
  renderObject,
  renderDetail,
  activeId: activeIdProp,
  defaultActiveId = null,
  onActiveChange,
  openCollision = 'serialize',
  view: viewProp,
  defaultView = 'plane',
  onViewChange,
  zoomSteps = DEFAULT_ZOOM_STEPS,
  defaultZoomIndex = DEFAULT_ZOOM_INDEX,
  reducedMotion = 'respect',
  labels,
  className,
  style,
  children,
}: VitrinaProps) {
  const resolvedLayout = useMemo(() => resolveLayout(layout), [layout]);
  const stepCount = zoomSteps.length;
  const [zoomIndex, setZoomIndex] = useState(() => clampIndex(defaultZoomIndex, stepCount));
  const [session] = useState(createSession);

  /*
   * 'respect' (default): no intro, no pops, no inertia, no Flip, no flight —
   * drag, wheel, zoom, the toggle and the panel still work. 'grid':
   * additionally lock the view to the grid, with no toggle and no zoom.
   * 'ignore': animate regardless — the consumer taking the accessibility
   * decision on themselves.
   */
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion === 'ignore' ? false : prefersReduced;
  const viewLocked = reducedMotion === 'grid' && prefersReduced;
  const reducedRef = useRef(reduced);
  useIsomorphicLayoutEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // View: controlled when `view` is given, uncontrolled otherwise — same shape
  // as `activeId`. The lock overrides both.
  const [internalView, setInternalView] = useState<VitrinaView>(defaultView);
  const controlledView = viewProp !== undefined;
  const view: VitrinaView = viewLocked ? 'grid' : controlledView ? viewProp : internalView;

  const setView = useCallback(
    (next: VitrinaView) => {
      if (viewLocked || next === view) return;
      onViewChange?.(next);
      if (!controlledView) setInternalView(next);
    },
    [viewLocked, view, controlledView, onViewChange],
  );

  const index = clampIndex(zoomIndex, stepCount);
  const zoom = zoomSteps[index] ?? 1;

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  // --- The detail: panel container + object machine -----------------------

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const relayRef = useRef<HTMLDivElement>(null);
  const collisionRef = useRef<VitrinaOpenCollision>(openCollision);
  useIsomorphicLayoutEffect(() => {
    collisionRef.current = openCollision;
  }, [openCollision]);

  /*
   * The body portal for the flight layers exists once we are on the client, past
   * the first commit — and it is owned HERE, not in `Detail`, because the
   * orchestrator never unmounts: it flips to true once and stays, so every panel
   * open (Detail mounts and unmounts with the active item) already has its portal
   * in the SAME commit as the click. Held in `Detail` it would reset to false on
   * each open and the flight layer would arrive a frame late — the object would
   * appear behind the panel until the next tick. False on the server and the very
   * first client render keeps SSR/hydration in step.
   */
  const [portalReady, setPortalReady] = useState(false);
  useIsomorphicLayoutEffect(() => {
    setPortalReady(true);
  }, []);
  /**
   * Instance id → its button, in whichever view is mounted (grid cards register
   * under the instance they stand for). The flight measures its origin here and
   * focus returns here; nothing is ever queried from the DOM by id — with a
   * dozen copies per entity, only an exact instance id names the right one.
   */
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const registerNode = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
  }, []);

  const controlledActive = activeIdProp !== undefined;
  const [detail, dispatch] = useReducer(
    transition,
    controlledActive ? activeIdProp : defaultActiveId,
    initialDetail,
  );
  /** Mirror for the callbacks, so they read the committed state without recreating on every transition. */
  const detailRef = useRef<DetailState>(detail);
  useIsomorphicLayoutEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  /*
   * Controlled: the `activeId` prop drives the machine, and a click only
   * reports. The click leaves its origin here so that when the prop follows,
   * the flight starts from the instance that was clicked. Read during render,
   * NEVER cleared there: StrictMode renders twice, and the second pass would
   * find it empty and open without a flight. Cleared in the layout effect of
   * the transition it served.
   */
  const pendingOriginRef = useRef<PendingOrigin | null>(null);
  const [syncedActive, setSyncedActive] = useState(activeIdProp);
  if (controlledActive && activeIdProp !== syncedActive) {
    setSyncedActive(activeIdProp);
    if (activeIdProp === null) {
      dispatch({ type: 'close', animate: !reduced });
    } else {
      const pending = pendingOriginRef.current;
      const matches = pending !== null && pending.entityId === activeIdProp;
      dispatch({
        type: 'open',
        entityId: activeIdProp,
        instanceId: matches ? pending.instanceId : null,
        animate: matches ? pending.animate : false,
        collision: openCollision,
      });
    }
  }
  useIsomorphicLayoutEffect(() => {
    pendingOriginRef.current = null;
  }, [detail]);

  /*
   * The view changed: the origin's node is leaving with it. The panel stays,
   * the flight does not. Derived during render, not in an effect, so the
   * arriving view never mounts with an instance hidden — not even for a frame.
   */
  const [syncedView, setSyncedView] = useState(view);
  if (view !== syncedView) {
    setSyncedView(view);
    if (panelPresent(detail)) dispatch({ type: 'detach' });
  }

  // The active entity left the list: there is nothing to show, or to fly back to.
  const activeEntityId = detail.active?.entityId ?? null;
  const activeEntity = activeEntityId !== null ? (entityById.get(activeEntityId) ?? null) : null;
  if (activeEntityId !== null && activeEntity === null) dispatch({ type: 'abandon' });

  /**
   * The instance that stands for an entity the panel switches to without a
   * click (next/prev): the showing one closest to the centre of the root. A
   * handful of rect reads on a user action — never per frame. On the plane
   * "showing" means revealed; every grid card shows.
   */
  const pickOrigin = useCallback((entityId: string): string | null => {
    const root = rootRef.current;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, el] of nodesRef.current) {
      if (el.getAttribute('data-vitrina-entity') !== entityId) continue;
      if (!el.hasAttribute('data-vitrina-revealed') && !el.hasAttribute('data-vitrina-card')) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }, []);

  const activate = useCallback(
    (entityId: string, instanceId: string | null, animate: boolean) => {
      const shouldAnimate = animate && !reducedRef.current;
      const collision = collisionRef.current;
      if (controlledActive) {
        pendingOriginRef.current = { entityId, instanceId, animate: shouldAnimate };
        if (activeIdProp === entityId) {
          // The prop will not change for a click on another copy of the entity
          // already open: the new origin applies directly.
          dispatch({ type: 'open', entityId, instanceId, animate: shouldAnimate, collision });
        } else {
          onActiveChange?.(entityId);
        }
        return;
      }
      const current = detailRef.current;
      const changes = current.active?.entityId !== entityId || current.panel !== 'open';
      if (changes) onActiveChange?.(entityId);
      dispatch({ type: 'open', entityId, instanceId, animate: shouldAnimate, collision });
    },
    [controlledActive, activeIdProp, onActiveChange],
  );

  const openDetail = useCallback(
    (entityId: string, instanceId: string | null = null) => {
      if (!entityById.has(entityId)) return;
      activate(entityId, instanceId, true);
    },
    [entityById, activate],
  );

  const closeDetail = useCallback(() => {
    const current = detailRef.current;
    if (current.panel !== 'open') return;
    onActiveChange?.(null);
    // Controlled: the prop coming back null is what closes.
    if (!controlledActive) dispatch({ type: 'close', animate: !reducedRef.current });
  }, [controlledActive, onActiveChange]);

  /** Next/prev entity, in `entities` order, circular. Relayed, not re-opened. */
  const stepDetail = useCallback(
    (delta: number) => {
      const current = detailRef.current;
      const currentId = current.active?.entityId;
      if (currentId == null || current.panel !== 'open') return;
      const at = entities.findIndex((e) => e.id === currentId);
      if (at < 0) return;
      const next = entities[(at + delta + entities.length) % entities.length];
      if (!next) return;
      // The relay flies from the new object's showing copy nearest the centre.
      activate(next.id, pickOrigin(next.id), true);
    },
    [entities, activate, pickOrigin],
  );

  const detailContext = useMemo<VitrinaDetailContext>(
    () => ({
      close: closeDetail,
      next: () => stepDetail(1),
      prev: () => stepDetail(-1),
      view,
    }),
    [closeDetail, stepDetail, view],
  );

  /*
   * FLIP by hand on a fixed visual: two rects (origin, destination), the box set
   * ONCE to the destination's, one tween on x/y/scaleX/scaleY — no layout per
   * frame. Not `Flip.fit`: for two axis-aligned boxes in viewport coordinates its
   * global-matrix machinery buys nothing, and it does not run under jsdom.
   * Landing is a React commit (`onComplete` only dispatches), so the copy the
   * visual carried is shown by the very commit that reverts this context — never
   * a blank frame.
   */
  const flyVisual = (
    visual: Element,
    from: DOMRect,
    to: DOMRect,
    seconds: number,
    onComplete: () => void,
  ) => {
    gsap.set(visual, {
      left: to.left,
      top: to.top,
      width: to.width,
      height: to.height,
      transformOrigin: '0 0',
      x: from.left - to.left,
      y: from.top - to.top,
      scaleX: to.width === 0 ? 1 : from.width / to.width,
      scaleY: to.height === 0 ? 1 : from.height / to.height,
    });
    gsap.to(visual, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      duration: seconds,
      ease: DETAIL_FLIGHT_EASE,
      onComplete,
    });
  };

  /*
   * The ACTIVE object's flight — symmetric at both ends, always on the flight
   * layer (above the panel):
   *
   *  · PARK, no tween. `waiting` (first open) parks over the ORIGIN while the
   *    panel reveals; `leaving` parks over the SLOT while the panel COVERS. Either
   *    way the object floats above the panel, keeping its z, until its signal
   *    (`revealed` / `coverDone`) flips it to a flight. (A serialize relay's
   *    `waiting` keeps the object on the plane, so it is not parked here.)
   *  · FLY. `in` = origin → slot (after the reveal); `out` = slot → origin (after
   *    the cover). `landed` ends it.
   *
   * Keyed on the phase and the instance, so each park→fly and relay swap re-runs;
   * a same-phase re-render does not.
   */
  const activeFlightKey = `${portalReady ? 'p' : '-'}:${detail.flight}:${detail.relaying === null ? 'own' : 'relay'}:${detail.active?.instanceId ?? ''}`;
  useIsomorphicLayoutEffect(() => {
    const { flight, active, relaying } = detail;
    const hasOrigin = active?.instanceId != null;
    const parkingAtOrigin = flight === 'waiting' && relaying === null && hasOrigin;
    const parkingAtSlot = flight === 'leaving' && hasOrigin;
    const parking = parkingAtOrigin || parkingAtSlot;
    const flying = flight === 'in' || flight === 'out';
    if (!parking && !flying) return;
    const settle = () => dispatch({ type: 'landed' });
    const instanceId = active?.instanceId ?? null;
    const origin = instanceId !== null ? nodesRef.current.get(instanceId) : undefined;
    const slot = slotRef.current;
    const visual = flightRef.current;
    const root = rootRef.current;
    if (!origin || !slot || !visual || !root) {
      // Parking has nothing to settle: it is a placement, not a flight.
      if (flying) settle();
      return;
    }

    if (parking) {
      // Sit the visual exactly over its parking node (origin while opening, slot
      // while closing), above the panel, until it flies.
      const box = (parkingAtSlot ? slot : origin).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const ctx = gsap.context(() => {
        gsap.set(visual, {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transformOrigin: '0 0',
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
        });
      }, root);
      return () => ctx.revert();
    }

    const from = (flight === 'in' ? origin : slot).getBoundingClientRect();
    const to = (flight === 'in' ? slot : origin).getBoundingClientRect();
    if (from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) {
      settle();
      return;
    }
    const seconds = readSeconds(root, DETAIL_FLIGHT_DURATION_VAR, DETAIL_FLIGHT_SECONDS);
    const ctx = gsap.context(() => {
      flyVisual(visual, from, to, seconds, settle);
    }, root);
    return () => ctx.revert();
  }, [activeFlightKey]);

  /*
   * The RELAY: the previous object flying slot → plane while the next takes its
   * place. Same FLIP; a different entity, so the two flights never show two
   * copies of one object. When it lands, `relayLanded` clears it (and, serialize,
   * releases the waiting active object; or drains a parked request).
   */
  const relayInstanceId = detail.relaying?.instanceId ?? null;
  useIsomorphicLayoutEffect(() => {
    if (relayInstanceId === null) return;
    const done = () => dispatch({ type: 'relayLanded' });
    const origin = nodesRef.current.get(relayInstanceId);
    const slot = slotRef.current;
    const visual = relayRef.current;
    const root = rootRef.current;
    if (!origin || !slot || !visual || !root) {
      done();
      return;
    }
    const from = slot.getBoundingClientRect();
    const to = origin.getBoundingClientRect();
    if (from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) {
      done();
      return;
    }
    const seconds = readSeconds(root, DETAIL_FLIGHT_DURATION_VAR, DETAIL_FLIGHT_SECONDS);
    const ctx = gsap.context(() => {
      flyVisual(visual, from, to, seconds, done);
    }, root);
    return () => ctx.revert();
  }, [relayInstanceId]);

  /*
   * The panel container's own lifecycle, independent of the object. It wipes
   * OPEN once (closed → open), covers CLOSED once (→ covering), and holds still
   * across every active-object change in between. `revealed` releases a waiting
   * first-open object so it flies into a card that has stopped growing;
   * `coverDone` unmounts the panel. Both fire from the wipe's own duration (the
   * CSS variable), so the object choreography stays glued to the panel's without
   * a number in the component. Reduced motion (no wipe) settles both at once.
   */
  const panelPhase = detail.panel;
  const prevPanelRef = useRef<PanelPhase>('closed');
  useIsomorphicLayoutEffect(() => {
    const prev = prevPanelRef.current;
    prevPanelRef.current = panelPhase;
    const root = rootRef.current;
    const seconds = reducedRef.current ? 0 : readSeconds(root, DETAIL_PANEL_DURATION_VAR, DETAIL_PANEL_SECONDS);

    if (panelPhase === 'open' && prev !== 'open') {
      // Uncovered: let the reveal wipe finish, then release the waiting object.
      const release = () => dispatch({ type: 'revealed' });
      if (seconds === 0) {
        release();
        return;
      }
      const t = gsap.delayedCall(seconds, release);
      return () => {
        t.kill();
      };
    }
    if (panelPhase === 'covering') {
      const done = () => dispatch({ type: 'coverDone' });
      if (seconds === 0) {
        done();
        return;
      }
      const t = gsap.delayedCall(seconds, done);
      return () => {
        t.kill();
      };
    }
  }, [panelPhase]);

  /*
   * The panel does not JUMP between objects of different height: when the active
   * content changes while the panel stays open, tween the card's height from what
   * it was to what it now is. Measured after the content commit (the card is
   * `height: auto`), read from a ref that survives across commits. Skipped on the
   * first open and while covering (the wipe owns those), and under reduced motion.
   */
  const cardHeightRef = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const card = cardRef.current;
    const root = rootRef.current;
    if (!card || !root || detail.panel !== 'open') {
      cardHeightRef.current = card && detail.panel === 'open' ? card.offsetHeight : null;
      return;
    }
    const next = card.scrollHeight;
    const prev = cardHeightRef.current;
    cardHeightRef.current = next;
    if (prev === null || prev === next || reducedRef.current) return;
    const seconds = readSeconds(root, DETAIL_PANEL_DURATION_VAR, DETAIL_PANEL_SECONDS);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        card,
        { height: prev },
        {
          height: next,
          duration: seconds,
          ease: DETAIL_PANEL_EASE,
          // Back to auto: a fixed height would clip content that later grows (a scroll).
          onComplete: () => gsap.set(card, { height: 'auto' }),
          clearProps: 'height',
        },
      );
    }, root);
    return () => ctx.revert();
  }, [detail.active?.entityId, detail.panel]);

  /*
   * Focus, in the commit of each phase change (§6.6, reference traps group 5):
   *
   *  · into the panel when the detail opens from idle — the origin button has
   *    just gone `visibility: hidden`, and focus on a hidden element falls to
   *    <body>. Not on mount: a `defaultActiveId` must not steal the page's focus.
   *  · back to the origin button when the detail reaches idle — THIS commit is
   *    the one that un-hides it, and a layout effect runs after the DOM update,
   *    so no frame has to pass. Exact instance, from the registry: a selector
   *    by entity prefix resolves to the first copy in the DOM. `preventScroll`
   *    is not cosmetic: the button lives inside the plane's `overflow: hidden`
   *    viewport, and the native scroll-into-view would give it a real
   *    `scrollLeft`, outside GSAP's transform.
   *  · to the root when there is no origin to return to (opened
   *    programmatically, or the view changed underneath): focus must land
   *    somewhere inside, not on <body>.
   */
  const prevPresentRef = useRef(panelPresent(detail));
  const returnToRef = useRef<string | null>(detail.active?.instanceId ?? null);
  useIsomorphicLayoutEffect(() => {
    const present = panelPresent(detail);
    const was = prevPresentRef.current;
    prevPresentRef.current = present;
    if (present) {
      // Track the current active origin so a close returns focus to whatever the
      // panel ended on, not what it opened with.
      if (detail.active?.instanceId != null) returnToRef.current = detail.active.instanceId;
      // Into the panel only on the uncovered transition — not on a relay, not on
      // mount (a defaultActiveId must not steal the page's focus).
      if (!was) panelRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!was) return;
    const id = returnToRef.current;
    returnToRef.current = null;
    const target = (id !== null ? nodesRef.current.get(id) : undefined) ?? rootRef.current;
    target?.focus({ preventScroll: true });
  }, [detail]);

  // Escape closes, from wherever focus is — the plane stays interactive beside
  // the panel, so focus may well be out there.
  const panelOpen = detail.panel === 'open';
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeDetail();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, closeDetail]);

  // --- API -----------------------------------------------------------------

  // What chrome sees as active: the prop when controlled; otherwise the entity
  // the panel is about, which a covering (closing) panel no longer is.
  const activeId = controlledActive
    ? activeIdProp
    : detail.panel === 'open'
      ? (detail.active?.entityId ?? null)
      : null;

  const api = useMemo<VitrinaApi>(
    () => ({
      zoomSteps,
      zoomIndex: index,
      zoom,
      zoomIn: () => {
        if (!viewLocked) setZoomIndex((i) => clampIndex(i + 1, stepCount));
      },
      zoomOut: () => {
        if (!viewLocked) setZoomIndex((i) => clampIndex(i - 1, stepCount));
      },
      setZoomIndex: (next) => {
        if (!viewLocked) setZoomIndex(clampIndex(next, stepCount));
      },
      view,
      setView,
      toggleView: () => setView(view === 'plane' ? 'grid' : 'plane'),
      viewLocked,
      activeId,
      detailPhase: detail.panel === 'open' ? 'open' : detail.panel === 'covering' ? 'closing' : 'idle',
      openDetail,
      closeDetail,
    }),
    [zoomSteps, index, zoom, stepCount, view, setView, viewLocked, activeId, detail.panel, openDetail, closeDetail],
  );

  const copy = activeCopy(detail);
  const hiddenIds = hiddenInstancesOf(detail);
  /** Every copy of the active entity is "active" for `renderObject` while the panel is about it. */
  const activeCtxEntityId = detail.panel === 'closed' ? null : (detail.active?.entityId ?? null);
  const relayEntity = detail.relaying ? (entityById.get(detail.relaying.entityId) ?? null) : null;

  /*
   * Which wipe the panel plays — keyed on the PANEL phase, not the object's:
   * 'reveal' only for the closed → open uncover, held until the reveal signal
   * fires; 'cover' while covering; 'none' otherwise, including every relay (the
   * panel is already open and must not re-wipe). Refs so a same-phase re-render
   * never cuts a wipe short, and the reveal clears itself once released.
   */
  const panelAnimPhaseRef = useRef<PanelPhase>('closed');
  const panelAnimRef = useRef<PanelAnim>('none');
  if (panelAnimPhaseRef.current !== detail.panel) {
    const prev = panelAnimPhaseRef.current;
    panelAnimPhaseRef.current = detail.panel;
    if (detail.panel === 'covering') panelAnimRef.current = 'cover';
    else if (detail.panel === 'open' && prev !== 'open') panelAnimRef.current = 'reveal';
    else if (detail.panel === 'closed') panelAnimRef.current = 'none';
  }
  // The reveal is over once the object has left 'waiting' (the reveal signal
  // released it, or there was nothing to wait for): stop advertising the wipe so a
  // relay is unambiguously 'none'.
  if (panelAnimRef.current === 'reveal' && detail.panel === 'open' && detail.flight !== 'waiting') {
    panelAnimRef.current = 'none';
  }
  const panelAnim = panelAnimRef.current;
  const relayFlying = relayInstanceId !== null;

  return (
    <div
      ref={rootRef}
      data-vitrina-root=""
      data-vitrina-view={view}
      data-vitrina-panel-phase={detail.panel}
      className={className}
      // Focusable (programmatically only) as the fallback focus target when a
      // detail closes with no origin to return to. A container: no ring.
      tabIndex={-1}
      style={{ position: 'relative', outline: 'none', ...style }}
    >
      <VitrinaContext.Provider value={api}>
        {view === 'plane' ? (
          <Plane
            entities={entities}
            instances={instances}
            layout={resolvedLayout}
            renderObject={renderObject}
            labels={labels}
            zoom={zoom}
            reduced={reduced}
            session={session}
            hiddenIds={hiddenIds}
            activeEntityId={activeCtxEntityId}
            onOpen={openDetail}
            onNode={registerNode}
          />
        ) : (
          <Grid
            entities={entities}
            instances={instances}
            layout={resolvedLayout}
            renderObject={renderObject}
            labels={labels}
            reduced={reduced}
            session={session}
            hiddenIds={hiddenIds}
            activeEntityId={activeCtxEntityId}
            onOpen={openDetail}
            onNode={registerNode}
          />
        )}
        {activeEntity && (
          <Detail
            entity={activeEntity}
            instanceId={detail.active?.instanceId ?? null}
            panel={detail.panel}
            copy={copy}
            panelAnim={panelAnim}
            view={view}
            relayEntity={relayEntity}
            relayInstanceId={detail.relaying?.instanceId ?? null}
            relayFlying={relayFlying}
            portalReady={portalReady}
            renderObject={renderObject}
            renderDetail={renderDetail}
            labels={labels}
            detailContext={detailContext}
            panelRef={panelRef}
            cardRef={cardRef}
            slotRef={slotRef}
            flightRef={flightRef}
            relayRef={relayRef}
          />
        )}
        {children}
      </VitrinaContext.Provider>
    </div>
  );
}
