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
 * The ONE exception is the landing seam: `onComplete` shows the landing copy
 * under the still-visible visual, exactly superimposed, until the commit hides
 * the flight — two aligned copies read as one; a commit-only swap paints a frame
 * with neither.
 *
 * Two things the panel does NOT do, because only the orchestrator knows when a
 * flight has landed: return focus, and move the object. While the clone flies the
 * origin button is `visibility: hidden`, and a hidden element does not accept
 * focus — so focus goes back in a layout effect of the commit that closes the
 * panel, the same commit that un-hides the button.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gsap } from 'gsap';

import type {
  VitrinaApi,
  VitrinaDetailContext,
  VitrinaDismiss,
  VitrinaOpenCollision,
  VitrinaProps,
  VitrinaView,
} from './types';
import {
  DEFAULT_ZOOM_INDEX,
  DEFAULT_ZOOM_STEPS,
  DETAIL_LINE_EASE,
  DETAIL_LINE_EXIT_EASE,
  DETAIL_LINE_SHIFT,
  DETAIL_PANEL_EASE,
  resolveLayout,
} from './defaults';
import { VitrinaContext } from './context';
import { useIsomorphicLayoutEffect } from './gsap';
import { FALLBACK_MOTION, readMotionTokens } from './motion';
import type { MotionTokens } from './motion';
import { usePrefersReducedMotion } from './reducedMotion';
import { createSession } from './session';
import { Plane } from './plane/Plane';
import { Grid } from './grid/Grid';
import { Detail } from './detail/Detail';
import type { PanelAnim } from './detail/Detail';
import { activeCopy, hiddenInstancesOf, initialDetail, panelPresent, transition } from './detail/machine';
import { isProduction } from './env';
import type { DetailState, PanelPhase } from './detail/machine';

const clampIndex = (index: number, count: number): number =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(index)));

/** Stable default so an omitted `dismissOn` never churns the effects. */
const DEFAULT_DISMISS: readonly VitrinaDismiss[] = ['escape'];

/** A click waiting for the controlled `activeId` prop to follow it. */
interface PendingOrigin {
  entityId: string;
  instanceId: string | null;
  animate: boolean;
}

export function Vitrina({
  entities,
  instances,
  layout,
  renderObject,
  renderCard,
  renderGridHeader,
  renderAbove,
  renderBeside,
  renderDetail,
  renderBelow,
  renderClose,
  panelSide = 'right',
  besidePlacement = 'start',
  dismissOn = DEFAULT_DISMISS as VitrinaDismiss[],
  modal = false,
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
  /*
   * INHERITED text style does not cross the portal: the wrapper's
   * `data-vitrina-root` stamp resolves the tokens and the theme's `color` (both
   * ride the attribute), but the typography the consumer set on THEIR tree —
   * body's reaches the portal instead. Two identical boxes then paint the same
   * glyph at different heights (font metrics drive SVG text baselines and line
   * boxes), and every copy hand-off reads as a constant vertical jump: up on
   * lift-off, down on landing, both visuals at once in a crossfade. So the
   * inheritable text properties are read off the root ONCE at mount (same
   * discipline as the motion tokens) and replayed inline on the wrapper.
   * `color` deliberately not copied — the themes set it on [data-vitrina-root]
   * and an inline copy would pin a hot theme switch to the mount-time value.
   */
  const portalTextStyleRef = useRef<CSSProperties | undefined>(undefined);
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (root) {
      const cs = getComputedStyle(root);
      portalTextStyleRef.current = {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        letterSpacing: cs.letterSpacing,
        wordSpacing: cs.wordSpacing,
        textTransform: cs.textTransform as CSSProperties['textTransform'],
        direction: cs.direction as CSSProperties['direction'],
      };
    }
    setPortalReady(true);
  }, []);

  /*
   * The motion tokens, read ONCE at mount — one getComputedStyle on the root,
   * never a read per interaction and never per frame (§7). Everything animated
   * from JS goes through `motion()`; the fallback answers on the server, under
   * jsdom, and in the sliver before the mount effect (nothing animates there —
   * every consumer runs on a user action or a later commit). Retuning a token
   * therefore applies on the next MOUNT, not live.
   */
  const motionRef = useRef<MotionTokens | null>(null);
  useIsomorphicLayoutEffect(() => {
    motionRef.current = readMotionTokens(rootRef.current);
  }, []);
  const motion = useCallback((): MotionTokens => motionRef.current ?? FALLBACK_MOTION, []);
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

  /*
   * `objectSettled` is what lets a consumer render its own copy of the object
   * (renderBeside, a hero image) and hide it while the clone travels: false
   * from the click until the flight lands in the slot, false again the moment
   * a close or relay lifts the object off. Derived from the machine, not
   * tracked — the same commit that shows the slot flips it.
   */
  const objectSettled = detail.panel === 'open' && detail.flight === 'shown';
  const ctxActiveId = detail.active?.entityId ?? null;
  const detailContext = useMemo<VitrinaDetailContext>(
    () => ({
      close: closeDetail,
      step: stepDetail,
      activeId: ctxActiveId,
      view,
      objectSettled,
    }),
    [closeDetail, stepDetail, ctxActiveId, view, objectSettled],
  );

  /*
   * FLIP by hand on a fixed visual: two rects (origin, destination), the box set
   * ONCE to the destination's, one tween on x/y/scaleX/scaleY — no layout per
   * frame. Not `Flip.fit`: for two axis-aligned boxes in viewport coordinates its
   * global-matrix machinery buys nothing, and it does not run under jsdom.
   * Landing is a React commit, and the hand-off OVERLAPS: `onComplete` shows the
   * landing copy first (the commit that hides the visual and reverts this
   * context arrives a frame later — swapping there alone leaves one frame with
   * NO copy visible, the landing blink), then dispatches.
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
      // GSAP rounds a positioned element's left/top/width/height to whole px;
      // the destination is a fractional rect, and a box snapped to integers
      // lands up to half a pixel off the copy it hands over to.
      autoRound: false,
      // Promoted for the flight only; the context revert in the landing commit
      // strips it — never permanent (§7).
      willChange: 'transform',
    });
    gsap.to(visual, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      autoRound: false,
      duration: seconds,
      ease: motion().easeFlight,
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
   * a same-phase re-render does not. `panelSide` is in the key too: moving the
   * panel moves the slot, so a park over it re-parks and a flight retargets —
   * resuming from wherever the visual is (`resumeFromRef`, captured in the
   * cleanup before the revert), never teleporting back to its start.
   */
  const resumeFromRef = useRef<DOMRect | null>(null);
  const activeFlightKey = `${portalReady ? 'p' : '-'}:${detail.flight}:${detail.relaying === null ? 'own' : 'relay'}:${detail.active?.instanceId ?? ''}:${panelSide}`;
  useIsomorphicLayoutEffect(() => {
    // Consumed (or discarded) on EVERY run: a rect captured by a landing's or
    // unmount's cleanup must never seed a later, unrelated flight.
    const resume = resumeFromRef.current;
    resumeFromRef.current = null;
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
          // Same as the flight: a box rounded to whole px sits visibly off the
          // fractional rect of the copy it replaces.
          autoRound: false,
        });
      }, root);
      return () => ctx.revert();
    }

    // A retarget mid-flight (the previous run was flying too — a hot panelSide
    // change, a reversed close) resumes from the visual's captured position.
    const from = resume ?? (flight === 'in' ? origin : slot).getBoundingClientRect();
    const to = (flight === 'in' ? slot : origin).getBoundingClientRect();
    if (from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) {
      settle();
      return;
    }
    const ctx = gsap.context(() => {
      flyVisual(visual, from, to, motion().durFlight, () => {
        // Overlap the hand-off: the LANDING copy becomes visible here, in the
        // same frame the tween ends, while the flying visual is still up — the
        // commit that `settle` triggers arrives a frame later and hides the
        // flight. A frame with both copies superimposed is invisible; a frame
        // with neither (swap left to the commit alone) is a visible blink.
        // Plain DOM writes of the exact values that commit renders, so React's
        // inline style and the DOM never disagree.
        if (flight === 'in') slot.style.visibility = 'visible';
        else origin.style.visibility = '';
        settle();
      });
    }, root);
    return () => {
      // Before the revert snaps the visual back: remember where the flight was,
      // in case the next run is the same flight aimed at a moved destination.
      resumeFromRef.current = visual.getBoundingClientRect();
      ctx.revert();
    };
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
    const ctx = gsap.context(() => {
      flyVisual(visual, from, to, motion().durFlight, () => {
        // Same overlap as the active flight's landing: un-hide the plane copy
        // under the visual before the commit hides the visual.
        origin.style.visibility = '';
        done();
      });
    }, root);
    return () => ctx.revert();
  }, [relayInstanceId]);

  /*
   * The panel container's own lifecycle, independent of the object. It wipes
   * OPEN once (closed → open), covers CLOSED once (→ covering), and holds still
   * across every active-object change in between. `revealed` releases a waiting
   * first-open object so it flies into a card that has stopped growing;
   * `coverDone` unmounts the panel. Both fire from the animations' own durations
   * (the CSS variables), so the object choreography stays glued to the panel's
   * without a number in the component. Reduced motion settles both at once.
   *
   * The same lifecycle plays the CONTENT'S entrance — the panel descendants the
   * consumer marked `data-vitrina-line` (querySelectorAll on the panel, document
   * order; none marked → no content animation and nothing else changes). This is
   * the FIRST of two GSAP contexts: everything here depends only on open/close,
   * so a relay never replays the panel's own arrival — the content's re-arm on a
   * swap is the second context below, keyed on the active id.
   *
   * Choreography on open: the card is uncovered FIRST, then the lines enter
   * staggered — starting when the wipe ends, the same signal that releases the
   * flight, so the stagger runs WITH the flight, never after it (text waiting
   * for the object to land makes the opening feel twice as long). `lazy: false`
   * on the fromTo: without it GSAP defers the initial state to the end of the
   * tick and the content paints one frame at full opacity before entering.
   *
   * On close the exit mirrors it — same properties, same durations, the mirror
   * curve, the stagger inverted (`from: 'end'`) and tighter — and `coverDone`
   * fires at the REAL exit total (last start + its duration, against the wipe),
   * never a second constant that must agree by hand: two such numbers
   * desynchronise the moment someone retunes a token, and the symptom is a
   * close cut off mid-animation with no console error.
   *
   * `prevPanelRef` starts at the MOUNT phase, not 'closed': a panel mounted
   * already open (`defaultActiveId`, a controlled id on an SSR hydrate) is
   * settled markup — playing the entrance there would flash the server-rendered
   * content out and back in.
   */
  const panelPhase = detail.panel;
  const prevPanelRef = useRef<PanelPhase>(detail.panel);
  useIsomorphicLayoutEffect(() => {
    const prev = prevPanelRef.current;
    prevPanelRef.current = panelPhase;
    const root = rootRef.current;
    const reduced = reducedRef.current;
    const seconds = reduced ? 0 : motion().durPanel;
    const lines = reduced ? [] : Array.from(panelRef.current?.querySelectorAll('[data-vitrina-line]') ?? []);

    if (panelPhase === 'open' && prev !== 'open') {
      // Uncovered: let the reveal wipe finish, then release the waiting object.
      const release = () => dispatch({ type: 'revealed' });
      let ctx: gsap.Context | undefined;
      if (lines.length > 0) {
        const step = motion().staggerLine;
        // Starts at multiples of the step, all behind the wipe (an open without
        // one — no origin to fly from — has nothing to wait for).
        const delay = panelAnimRef.current === 'reveal' ? seconds : 0;
        ctx = gsap.context(() => {
          gsap.fromTo(
            lines,
            { opacity: 0, y: DETAIL_LINE_SHIFT },
            {
              opacity: 1,
              y: 0,
              duration: seconds,
              ease: DETAIL_LINE_EASE,
              delay,
              stagger: step,
              lazy: false,
            },
          );
        }, root ?? undefined);
      }
      if (seconds === 0) {
        release();
        return () => ctx?.revert();
      }
      const t = gsap.delayedCall(seconds, release);
      return () => {
        t.kill();
        ctx?.revert();
      };
    }
    if (panelPhase === 'covering') {
      const done = () => dispatch({ type: 'coverDone' });
      let ctx: gsap.Context | undefined;
      let total = seconds;
      if (lines.length > 0) {
        const step = motion().staggerLineExit;
        total = Math.max(total, (lines.length - 1) * step + seconds);
        ctx = gsap.context(() => {
          gsap.fromTo(
            lines,
            { opacity: 1, y: 0 },
            {
              opacity: 0,
              y: DETAIL_LINE_SHIFT,
              duration: seconds,
              ease: DETAIL_LINE_EXIT_EASE,
              stagger: { each: step, from: 'end' },
              // The lines are already at their start state; forcing it would
              // stomp anything the consumer set inline.
              immediateRender: false,
              lazy: false,
            },
          );
        }, root ?? undefined);
      }
      if (total === 0) {
        done();
        return () => ctx?.revert();
      }
      const t = gsap.delayedCall(total, done);
      return () => {
        t.kill();
        ctx?.revert();
      };
    }
  }, [panelPhase]);

  /*
   * The content's re-entrance on a relay — the SECOND GSAP context, deliberately
   * split from the panel lifecycle's: the panel's arrival (and any chrome lines
   * that entered with it) depends only on open/close, while the content also
   * depends on the active id, because it re-arms when the panel jumps from A to
   * B without closing. With one dependency list, switching objects would replay
   * the panel's own entrance with the panel already open. Scoped to the content
   * COLUMN — every hole that receives the entity (above, beside, detail, below)
   * re-arms; a line outside it (the fixed close region, which is entity-blind)
   * enters once with the panel and never again.
   *
   * The re-arm derives from the id during render-to-render comparison — the
   * content is NEVER remounted with a key (a remount kills any crossfade the
   * consumer runs; the old would vanish in the same commit the new arrives).
   * React reuses the nodes, and the fromTo (`lazy: false` again) holds the
   * incoming lines at opacity 0 in the very commit the text flips: the old
   * content leaves with the commit, the new staggers in — no frame of the new
   * text settled at full opacity. `overwrite: 'auto'` kills a first-open
   * entrance still mid-stagger on these same nodes rather than letting two
   * tweens write opacity in the same tick.
   */
  const contentEntityId = detail.panel === 'open' ? (detail.active?.entityId ?? null) : null;
  const prevContentEntityRef = useRef(contentEntityId);
  useIsomorphicLayoutEffect(() => {
    const prev = prevContentEntityRef.current;
    prevContentEntityRef.current = contentEntityId;
    // Only a swap inside an open panel re-arms — never the first open (the panel
    // lifecycle owns that entrance), never the close, never under reduced motion.
    if (contentEntityId === null || prev === null || prev === contentEntityId) return;
    if (reducedRef.current) return;
    const root = rootRef.current;
    const content = panelRef.current?.querySelector('[data-vitrina-panel-content]');
    const lines = content ? Array.from(content.querySelectorAll('[data-vitrina-line]')) : [];
    if (lines.length === 0) return;
    const step = motion().staggerLine;
    const seconds = motion().durPanel;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        lines,
        { opacity: 0, y: DETAIL_LINE_SHIFT },
        {
          opacity: 1,
          y: 0,
          duration: seconds,
          ease: DETAIL_LINE_EASE,
          stagger: step,
          lazy: false,
          overwrite: 'auto',
        },
      );
    }, root ?? undefined);
    return () => ctx.revert();
  }, [contentEntityId]);

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
    const seconds = motion().durPanel;
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

  /*
   * What dismisses the panel — each trigger its own opt-in, read as booleans so
   * a fresh array literal never churns the effects. 'escape' listens on the
   * document (the plane stays interactive beside the panel, so focus may well
   * be out there). 'outside' closes on a click that is neither in the panel nor
   * on an object — a click on another object is a switch, not a dismissal, and
   * the listener lands after the opening click's dispatch, so a panel never
   * closes itself on the click that opened it. 'planeDrag' rides the plane's
   * own drag start (below), never the wheel.
   */
  const panelOpen = detail.panel === 'open';
  const dismissEscape = dismissOn.includes('escape');
  const dismissOutside = dismissOn.includes('outside');
  const dismissPlaneDrag = dismissOn.includes('planeDrag');
  useEffect(() => {
    if (!panelOpen || !dismissEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeDetail();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, dismissEscape, closeDetail]);

  useEffect(() => {
    if (!panelOpen || !dismissOutside) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      // Another object switches the panel; closing too would race the open.
      if (target.closest('[data-vitrina-object]')) return;
      closeDetail();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [panelOpen, dismissOutside, closeDetail]);

  const dismissPlaneDragRef = useRef(dismissPlaneDrag);
  useIsomorphicLayoutEffect(() => {
    dismissPlaneDragRef.current = dismissPlaneDrag;
  }, [dismissPlaneDrag]);
  /** Handed to the plane; fires when a real drag starts (past the click threshold). */
  const onPlaneDragStart = useCallback(() => {
    if (dismissPlaneDragRef.current) closeDetail();
  }, [closeDetail]);

  /*
   * `modal`: trap focus in the panel. It exists for the panel that covers
   * everything — free focus there sends Tab into a plane nobody sees. A keydown
   * cycle over the panel's focusables (no inert, no overlay: with modal false
   * the plane must stay fully alive, and this effect does not run at all).
   */
  useEffect(() => {
    if (!panelOpen || !modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]',
        ),
      ).filter(
        (el) =>
          !(el as HTMLButtonElement).disabled && el.getAttribute('tabindex') !== '-1',
      );
      const active = document.activeElement;
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      // Not on a focusable of the panel — outside it, or on the panel container
      // itself (where open puts it): Tab enters the cycle instead of leaving.
      const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1;
      if (index === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, modal]);

  /*
   * Development-only, once: a panel covering ≥95% of the root with modal={false}
   * leaves Tab wandering a plane nobody can see. The library has no breakpoints
   * and will not decide for the consumer — a console warning is the one way to
   * flag the inaccessible combination without deciding.
   */
  const warnedCoverageRef = useRef(false);
  useEffect(() => {
    if (!panelOpen || modal || warnedCoverageRef.current) return;
    if (isProduction()) return;
    const rootRect = rootRef.current?.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!rootRect || !panelRect || rootRect.width === 0 || rootRect.height === 0) return;
    const coverage = (panelRect.width * panelRect.height) / (rootRect.width * rootRect.height);
    if (coverage >= 0.95) {
      warnedCoverageRef.current = true;
      console.warn(
        '[vitrina] The detail panel covers ≥95% of the plane with modal={false}: ' +
          'Tab reaches a plane nobody can see. Pass modal={true} at the same ' +
          'breakpoint where --vitrina-panel-size makes the panel cover everything.',
      );
    }
  }, [panelOpen, modal]);

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
      labels,
    }),
    [zoomSteps, index, zoom, stepCount, view, setView, viewLocked, activeId, detail.panel, openDetail, closeDetail, labels],
  );

  const copy = activeCopy(detail);
  /*
   * Memoised on the machine state, not recomputed per render: `hiddenIds` is a
   * prop every object in the view reads, and the reducer already returns the
   * SAME state reference for a no-op transition — so a render this component
   * did for any other reason (a zoom click, the consumer re-rendering above it)
   * hands the views the identity they already had, and the memoised objects
   * bail out. The empty answer is shared by the machine itself, so the
   * overwhelmingly common "no panel" case is stable across states too.
   */
  const hiddenIds = useMemo(() => hiddenInstancesOf(detail), [detail]);
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
      // EFFECTIVE reduced motion, for the stylesheet: base.css keys its
      // reduced-motion rules on this attribute, never on the media query — the
      // prop arbitrates ('ignore' animates with the preference on), and only
      // this component knows the outcome.
      data-vitrina-reduced={reduced ? '' : undefined}
      className={className}
      // Focusable (programmatically only) as the fallback focus target when a
      // detail closes with no origin to return to. A container: no ring
      // (base.css); its position and everything structural are base.css's too.
      tabIndex={-1}
      style={style}
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
            onDragStart={onPlaneDragStart}
            motion={motion}
          />
        ) : (
          <Grid
            entities={entities}
            instances={instances}
            layout={resolvedLayout}
            renderObject={renderObject}
            renderCard={renderCard}
            renderGridHeader={renderGridHeader}
            labels={labels}
            reduced={reduced}
            session={session}
            hiddenIds={hiddenIds}
            activeEntityId={activeCtxEntityId}
            onOpen={openDetail}
            onNode={registerNode}
            motion={motion}
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
            side={panelSide}
            besidePlacement={besidePlacement}
            modal={modal}
            relayEntity={relayEntity}
            relayInstanceId={detail.relaying?.instanceId ?? null}
            relayFlying={relayFlying}
            portalReady={portalReady}
            portalTextStyle={portalTextStyleRef.current}
            renderObject={renderObject}
            renderAbove={renderAbove}
            renderBeside={renderBeside}
            renderDetail={renderDetail}
            renderBelow={renderBelow}
            renderClose={renderClose}
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
