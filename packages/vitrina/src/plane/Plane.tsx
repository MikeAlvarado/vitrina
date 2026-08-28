/*
 * The explorable plane: a finite world panned by drag and wheel, zoomed in
 * discrete steps, revealed as it is explored. Internal — consumers mount `<Vitrina>`.
 *
 * Two nested transform layers (§6.1), and why not one: moving and scaling the
 * SAME layer means every zoom change must recompute pan so the world point under
 * the viewport centre stays put. Instead:
 *
 *  · zoom layer — exactly viewport-sized, `transform-origin` at its centre,
 *    `scale` only.
 *  · pan layer — inside it, exactly world-sized, `translate` only. Pan is
 *    expressed in world units.
 *
 * With the origin at the viewport centre, the world point seen at the centre does
 * not depend on zoom: changing zoom is a single scale tween with NO pan
 * compensation, and dragging never fights it because it lives on the other layer.
 * A world point `w` paints on screen at `(w + pan − view/2) · zoom + view/2`;
 * bounds and visibility derive from that analytically — zero
 * `getBoundingClientRect()` per frame.
 *
 * Visibility is ONE analytic pass per frame of movement (§6.4), `runPass` below,
 * fed by pan and zoom and answering two questions at once: which objects may be
 * in the tab order, and which unrevealed objects just entered the inset frame
 * and get popped.
 *
 * Pan, the revealed sets and the intro flag live in the session the root owns:
 * the view toggle unmounts this component, and coming back from the grid must
 * land where the visitor was.
 *
 * The detail flight is the root's: this component only reports clicks
 * (`onOpen`), registers its buttons (`onNode`) so the root can measure the
 * origin and return focus to it, and hides the ONE instance whose copy is
 * showing elsewhere (`hiddenId`, `visibility: hidden` — a hidden element takes
 * no focus and no clicks, and keeps its box for the flight to measure).
 */

import { memo, useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { Draggable } from 'gsap/Draggable';
import type { Observer } from 'gsap/Observer';

import type {
  VitrinaEntity,
  VitrinaInstance,
  VitrinaLabels,
  VitrinaLayout,
  VitrinaProps,
} from '../types';
import {
  DRAG_THRESHOLD_PX,
  EDGE_RESISTANCE,
  INTRO_POP_SECONDS,
  INTRO_SCALE,
  REVEAL_GAP_MS,
  REVEAL_INSET,
  REVEAL_POP_EASE,
  REVEAL_POP_SECONDS,
  REVEAL_SCALE,
  VIEW_FLIP_SECONDS,
  WHEEL_SPEED,
  ZOOM_TWEEN_EASE,
} from '../defaults';
import { isProduction } from '../env';
import { generateInstances } from '../layout/generate';
import { createRng } from '../layout/rng';
import {
  getInteractionPlugins,
  loadInteractionPlugins,
  useGsapContext,
  useIsomorphicLayoutEffect,
} from '../gsap';
import type { GetMotion } from '../motion';
import type { Session } from '../session';
import { centerPan, clampPan, outOfWorld, panBounds, selectWorld } from './geometry';
import type { Size } from './geometry';
import { framePass, staggerDelays } from './reveal';

/** Viewport and world measurements, cached — never re-measured per frame. */
interface PlaneGeometry {
  viewW: number;
  viewH: number;
  worldW: number;
  worldH: number;
  /** The compact world is in use: generation must place into it. Always false
      when the consumer supplied the instances — see `selectWorld`. */
  compact: boolean;
}

export interface PlaneProps {
  entities: VitrinaEntity[];
  /** Consumer-provided instances; when present, generation is skipped entirely. */
  instances?: VitrinaInstance[];
  layout: Required<VitrinaLayout>;
  renderObject: VitrinaProps['renderObject'];
  labels: VitrinaLabels;
  /** Target scale (a zoom step). The live, animated scale is tracked internally. */
  zoom: number;
  /** Effective reduced motion: no intro, no pops, no inertia, no wheel smoothing, no zoom tween, no Flip. */
  reduced: boolean;
  /** Owned by the root; outlives this component across view toggles. */
  session: Session;
  /** Instances whose copies are in flight, in the panel, or dissolving — hidden here. */
  hiddenIds: ReadonlySet<string>;
  /** The entity the panel shows: every copy of it reports `isActive`. */
  activeEntityId: string | null;
  onOpen: (entityId: string, instanceId: string) => void;
  /** Registers each object button with the root, by exact instance id. */
  onNode: (instanceId: string, el: HTMLElement | null) => void;
  /** A real drag started (past the click threshold) — the root's `dismissOn: 'planeDrag'` hook. */
  onDragStart?: () => void;
  /** The motion tokens, read once at the root's mount. */
  motion: GetMotion;
}

/*
 * All structure — the viewport's clipping, touch capture and stacking rung, the
 * two transform layers' positioning and the zoom origin at the viewport centre,
 * the object buttons' reset and focus geometry — lives in base.css, keyed on
 * the data attributes. Inline here is only what is computed at runtime: the
 * world's size, each instance's position, and visibility. NO permanent
 * will-change anywhere: the layers are promoted when a gesture or tween starts
 * and demoted when it settles (a forever-promoted layer squats on GPU memory).
 */

/*
 * Unrevealed = opacity 0 AND pointer-events none (§6.5): invisible but clickable
 * would open a panel from empty plane. Both are GSAP-owned inline styles, so the
 * reveal context's revert() restores the plain, server-rendered object.
 * `lazy: false`: gsap.set defers its write to the end of the tick just like
 * from/fromTo defer initial state, and a deferred baseline would land AFTER the
 * pops created in that same tick render their first frame.
 *
 * TWO NODES per object: opacity/scale ride the CONTENT node, never the button.
 * The button keeps the instance's exact box at constant scale, and the themes
 * hang `--vitrina-object-shadow` on IT — a filter on a node that changes scale
 * re-rasterizes across raster-scale thresholds and jumps on its own. The button
 * also declares no overflow/contain (pinned in tests/styles.test.ts), so the
 * pop's overshoot may paint past the box. pointer-events stays on the BUTTON:
 * it is the hit target, and a child's `none` would not stop its clicks.
 */
/** The content node inside an object button — library-owned structure, its only child. */
const contentOf = (el: Element): Element => el.firstElementChild ?? el;
const hide = (targets: Element[], scale: number) => {
  gsap.set(targets, { pointerEvents: 'none', lazy: false });
  gsap.set(targets.map(contentOf), { opacity: 0, scale, lazy: false });
};
const show = (targets: Element[]) => {
  gsap.set(targets, { pointerEvents: 'auto', lazy: false });
  gsap.set(targets.map(contentOf), { opacity: 1, scale: 1, lazy: false });
};

interface PlaneObjectProps {
  entity: VitrinaEntity;
  instanceId: string;
  x: number;
  y: number;
  size: number;
  /** Its copy is elsewhere (in flight, in the panel): keep the box, take the paint. */
  hidden: boolean;
  isActive: boolean;
  isRevealed: boolean;
  /** `labels.objectLabel` — the function, not the labels object, so a fresh
      labels literal with a stable labeller still bails out. */
  objectLabel: VitrinaLabels['objectLabel'];
  renderObject: VitrinaProps['renderObject'];
  /** Stable per instance id, created once by the plane. */
  nodeRef: (el: HTMLButtonElement | null) => void;
  /** Stable for the life of the plane (ref-backed): a consumer's inline
      `onActiveChange` must not re-render every object on every render. */
  onOpen: (entityId: string, instanceId: string) => void;
}

/*
 * ONE object, memoised — and the memo is the point, not an incidental
 * optimisation. Every render of the root recomputes props for all of them (the
 * default plane is 114), and the whole subtree is the consumer's
 * `renderObject`: opening a panel, clicking zoom, or a batch of reveal pops
 * landing mid-drag would otherwise re-run all 114 of them, several times a
 * second, in the frames the drag most needs.
 *
 * Everything here is a primitive or a reference the plane keeps stable, so the
 * bail-out is real: only the objects whose OWN answer changed re-render — the
 * one being hidden for a flight, and the copies of the entity the panel is
 * about. The two identities the plane cannot own are `renderObject` and
 * `objectLabel`: they are the consumer's, and they SHOULD re-render everything
 * when they genuinely change (swapping the dataset changes both). A consumer
 * who re-creates them inline every render pays the old cost — the README says
 * so, and tests/perf.test.tsx pins the counts so a regression here is loud.
 */
const PlaneObject = memo(function PlaneObject({
  entity,
  instanceId,
  x,
  y,
  size,
  hidden,
  isActive,
  isRevealed,
  objectLabel,
  renderObject,
  nodeRef,
  onOpen,
}: PlaneObjectProps) {
  return (
    <button
      ref={nodeRef}
      type="button"
      data-vitrina-object=""
      data-vitrina-instance={instanceId}
      data-vitrina-entity={entity.id}
      // Exact per-instance id for Flip — never a per-entity prefix.
      data-flip-id={instanceId}
      aria-label={objectLabel(entity)}
      // Nothing is tabbable until the pass says so: the server and the
      // un-measured client agree, and the pass writes tabindex directly —
      // this prop never changes, so React never fights it.
      tabIndex={-1}
      onClick={() => onOpen(entity.id, instanceId)}
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        // React owns `visibility`; GSAP owns opacity/scale/pointer-events.
        // Neither ever writes the other's. Everything else is base.css's.
        visibility: hidden ? 'hidden' : undefined,
      }}
    >
      {/* The content node: what the pop animates (a span — a button holds
          phrasing content only). The button above is the box. */}
      <span data-vitrina-object-content="">
        {renderObject(entity, { instanceId, isActive, isRevealed, view: 'plane' })}
      </span>
    </button>
  );
});

export function Plane({
  entities,
  instances,
  layout,
  renderObject,
  labels,
  zoom,
  reduced,
  session,
  hiddenIds,
  activeEntityId,
  onOpen,
  onNode,
  onDragStart,
  motion,
}: PlaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const panLayerRef = useRef<HTMLDivElement>(null);

  /** Live scale — tweens move it; the `zoom` prop is only the target. */
  const zoomRef = useRef(zoom);
  /** Last target already applied — how the zoom effect knows the prop actually changed. */
  const zoomAppliedRef = useRef(zoom);
  const draggableRef = useRef<Draggable | null>(null);
  /**
   * Geometry in a ref AS WELL as state: effects that must not recreate on resize
   * (the zoom effect and the reveal context below) read it here instead of
   * closing over the state.
   */
  const geometryRef = useRef<PlaneGeometry | null>(null);
  /** The placement effect has run with real geometry: the layers are where the session says. */
  const placedOnceRef = useRef(false);

  /*
   * Reveal and tab-order state lives in the session and in refs, not React
   * state: it changes on movement frames, and the DOM is written directly —
   * only on change, never every frame. React never renders any of it, so a
   * re-render can never clobber it either.
   */
  /** Instance id → its button. Filled by stable callback refs; the pass never queries the DOM. */
  const nodesRef = useRef(new Map<string, HTMLButtonElement>());
  /** One stable ref callback per instance id, so React only calls them on attach/detach. */
  const nodeRefsRef = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());
  /** Ids in frame per the last pass, revealed or not yet shown — consulted when a pop starts. */
  const inFrameRef = useRef(new Set<string>());
  /** Ids currently carrying tabindex=0 — the attribute is written only when this set changes. */
  const tabbableRef = useRef(new Set<string>());
  /** The reveal context: pops fired from movement frames are added to it so its revert() kills them. */
  const revealCtxRef = useRef<gsap.Context | null>(null);
  /** Seeded gap generator for pop staggers — the only randomness on this side of the library. */
  const revealRngRef = useRef<(() => number) | null>(null);
  const placedRef = useRef<readonly VitrinaInstance[]>([]);
  const reducedRef = useRef(reduced);
  /** The node callbacks below are created once per id; they read the current registrar here. */
  const onNodeRef = useRef(onNode);
  /** Read by the Draggable (created once per geometry) so a prop change needs no rebuild. */
  const onDragStartRef = useRef(onDragStart);
  /**
   * Same treatment for the click: the objects are memoised, and `onOpen` reaches
   * this component through the root's `openDetail`, whose identity ultimately
   * depends on the consumer's `onActiveChange`. An inline one there would give
   * every object a new prop on every render and defeat the memo — so the
   * objects get a wrapper that never changes, and it reads the current handler.
   */
  const onOpenRef = useRef(onOpen);
  /** Re-renders once per finished reveal batch so `renderObject` sees `isRevealed` flip. */
  const [, bumpRevealed] = useReducer((n: number) => n + 1, 0);

  const [geometry, setGeometry] = useState<PlaneGeometry | null>(null);
  /** The consumer placed the objects: the compact world is off (see `selectWorld`). */
  const explicitInstances = instances !== undefined;

  /*
   * View hand-off, capture side. Declared FIRST so its cleanup runs before any
   * other effect's: the rects must be read while the pan and zoom transforms
   * are still applied (the placement effect's revert strips them) and while a
   * Flip still in flight is where it is. Only the objects that have shown can
   * fly — the rest were invisible. Nothing is captured unless this mount
   * actually placed the plane: StrictMode's simulated unmount happens before
   * that, and must not overwrite the grid's own hand-off with garbage.
   */
  useIsomorphicLayoutEffect(() => {
    return () => {
      const viewport = viewportRef.current;
      const plugins = getInteractionPlugins();
      if (!viewport || !plugins || !placedOnceRef.current || reducedRef.current) return;
      const { shown } = session.read();
      const targets: Element[] = [];
      for (const [id, el] of nodesRef.current) if (shown.has(id)) targets.push(el);
      if (targets.length === 0) return;
      const state = plugins.Flip.getState(targets);
      const rects = new Map<string, DOMRect>();
      for (const es of state.elementStates) {
        const id = es.element.getAttribute('data-vitrina-instance');
        if (id) rects.set(id, es.bounds);
      }
      session.storeFlip({
        from: 'plane',
        state,
        rects,
        viewport: viewport.getBoundingClientRect(),
      });
    };
  }, []);

  /*
   * Measuring lives in its OWN layout effect, before and outside any GSAP
   * context. Geometry lands in state (the re-render is what hands it to the drag
   * effect below via its deps) and in the ref (for effects that must not recreate
   * when the ResizeObserver fires again). Unchanged measurements return early so a
   * settling observer never churns the contexts.
   */
  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const { width, height } = viewport.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      // ONE decision, `selectWorld`'s: which world, and whether it is the compact
      // one (which the generation below has to place into). Explicit instances
      // opt out of compact entirely — their coordinates are the world.
      const { world, compact } = selectWorld(layout, width, explicitInstances);
      const next: PlaneGeometry = {
        viewW: width,
        viewH: height,
        worldW: world.w,
        worldH: world.h,
        compact,
      };
      const current = geometryRef.current;
      if (
        current &&
        current.viewW === next.viewW &&
        current.viewH === next.viewH &&
        current.worldW === next.worldW &&
        current.worldH === next.worldH &&
        // Compared too: a theme whose compactWorld equals its world still
        // changes the object SIZES across the breakpoint.
        current.compact === next.compact
      ) {
        return;
      }
      geometryRef.current = next;
      setGeometry(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [layout, explicitInstances]);

  /*
   * Until the first measurement this generates for the regular world — the same
   * plane the server rendered, so hydration matches. A compact viewport
   * regenerates right after, in the re-render the measurement triggers.
   * `compact` is `selectWorld`'s answer, so it is false whenever the consumer
   * supplied the instances and this memo returns them untouched.
   */
  const compact = geometry?.compact ?? false;
  const placed = useMemo(() => {
    if (instances) return instances;
    if (!compact) return generateInstances(entities, layout);
    // Compact shrinks world and objects together: the generator's grid step
    // derives from world width and sizes from baseSize, so scale both — explicit
    // per-entity sizes included.
    const factor = layout.compactSizeFactor;
    const scaledEntities = entities.map((e) =>
      e.size == null ? e : { ...e, size: e.size * factor },
    );
    return generateInstances(scaledEntities, {
      ...layout,
      world: layout.compactWorld,
      baseSize: layout.baseSize * factor,
    });
  }, [instances, entities, layout, compact]);

  // Before the first measurement (and on the server) the pan layer takes the
  // regular world's dimensions — the compact decision needs a viewport width.
  const world: Size = geometry ? { w: geometry.worldW, h: geometry.worldH } : layout.world;

  /*
   * Development-only: an instance whose box falls outside the world in use can
   * never be brought into view. Pan is clamped to keep the world covering the
   * viewport, so the visible window never leaves the world box — there is no
   * gesture, at any zoom, that reaches an object outside it, and the failure is
   * silent: the plane looks fine, it is simply missing objects.
   *
   * It fires whatever the cause, but the cause is almost always one thing: a
   * hand-built `instances` list computed against a bigger world than
   * `layout.world`. (`compactWorld` is no longer able to cause it — explicit
   * instances opt out of it, see `selectWorld` — and generated instances are
   * clamped into whichever world they are generated for.)
   */
  const warnedWorldRef = useRef('');
  useIsomorphicLayoutEffect(() => {
    if (isProduction()) return;
    const stranded = outOfWorld(placed, world);
    if (stranded.length === 0) return;
    // Keyed on the OFFENDERS, not on the run: StrictMode's double mount (and
    // any re-render that changes neither) says it once; a new set says it again.
    const key = `${world.w}x${world.h}:${stranded.join(',')}`;
    if (warnedWorldRef.current === key) return;
    warnedWorldRef.current = key;
    const sample = stranded.slice(0, 5).join(', ');
    console.warn(
      `[vitrina] ${stranded.length} of ${placed.length} instances fall outside the ` +
        `${world.w}×${world.h} world in use and can never be panned to: ${sample}` +
        `${stranded.length > 5 ? `, +${stranded.length - 5} more` : ''}. ` +
        'Instance coordinates are absolute world px — grow `layout.world` to hold ' +
        'them, or place them inside it.',
    );
  }, [placed, world.w, world.h]);

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  // Mirrors for the frame-driven code, which must read the CURRENT values without
  // being recreated when they change. Declared before the effects that read them.
  useIsomorphicLayoutEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  useIsomorphicLayoutEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useIsomorphicLayoutEffect(() => {
    onNodeRef.current = onNode;
  }, [onNode]);
  useIsomorphicLayoutEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);
  useIsomorphicLayoutEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const handleOpen = useCallback(
    (entityId: string, instanceId: string) => onOpenRef.current(entityId, instanceId),
    [],
  );

  const nodeRef = (id: string) => {
    let ref = nodeRefsRef.current.get(id);
    if (!ref) {
      ref = (el) => {
        onNodeRef.current(id, el);
        if (el) {
          nodesRef.current.set(id, el);
          // An object that appears after the reveal context exists (consumer changed
          // the instances) is born hidden like every other unrevealed one.
          const ctx = revealCtxRef.current;
          if (ctx && !session.read().shown.has(id)) ctx.add(() => hide([el], REVEAL_SCALE));
        } else {
          nodesRef.current.delete(id);
        }
      };
      nodeRefsRef.current.set(id, ref);
    }
    return ref;
  };

  /** A pop has started (or landed): the object is visible, clickable, and — if in frame — tabbable. */
  const markShown = (id: string, el: HTMLButtonElement) => {
    session.markShown(id);
    el.style.pointerEvents = 'auto';
    el.setAttribute('data-vitrina-revealed', '');
    if (inFrameRef.current.has(id) && !tabbableRef.current.has(id)) {
      tabbableRef.current.add(id);
      el.tabIndex = 0;
    }
  };

  /**
   * Pops one batch of newly entered objects. Runs inside the reveal context so
   * the tweens belong to it. The first batch is the intro (slower, from
   * INTRO_SCALE); every later one is a reveal (from REVEAL_SCALE). Gaps between
   * pops are seeded random — a fixed step reads as a mechanical wave. Under
   * reduced motion objects simply appear, in the same order, at once.
   */
  const reveal = (ids: string[]) => {
    const ctx = revealCtxRef.current;
    const rng = revealRngRef.current;
    // Before the reveal context exists nothing is hidden yet; leave these
    // unrevealed and let the context's own first pass claim them.
    if (!ctx || !rng) return;
    session.claim(ids);
    const intro = !session.read().introDone;
    session.markIntroDone();

    const batch: Array<[string, HTMLButtonElement]> = [];
    for (const id of ids) {
      const el = nodesRef.current.get(id);
      if (el) batch.push([id, el]);
    }
    if (batch.length === 0) return;

    ctx.add(() => {
      if (reducedRef.current) {
        show(batch.map(([, el]) => el));
        for (const [id, el] of batch) markShown(id, el);
        bumpRevealed();
        return;
      }
      const delays = staggerDelays(batch.length, rng, REVEAL_GAP_MS);
      const from = intro ? INTRO_SCALE : REVEAL_SCALE;
      const duration = intro ? INTRO_POP_SECONDS : REVEAL_POP_SECONDS;
      batch.forEach(([id, el], i) => {
        // The pop animates the CONTENT node, never the button (see hide/show).
        gsap.fromTo(
          contentOf(el),
          { opacity: 0, scale: from },
          {
            opacity: 1,
            scale: 1,
            duration,
            ease: REVEAL_POP_EASE,
            delay: (delays[i] ?? 0) / 1000,
            // from/fromTo defer their initial state to the end of the tick by
            // default; the object must never paint a frame un-hidden before its pop.
            lazy: false,
            onStart: () => markShown(id, el),
            onComplete: i === batch.length - 1 ? bumpRevealed : undefined,
          },
        );
      });
    });
  };

  /**
   * THE pass (§6.4): one analytic evaluation of every instance against the
   * current pan and zoom, answering tab order and reveal together. Called on
   * every frame of movement and at every (re)placement. No DOM reads; DOM writes
   * only where the answer changed. Lives outside any reduced-motion branch —
   * focus is not decoration and behaves identically under reduced motion.
   */
  const runPass = () => {
    const geo = geometryRef.current;
    const { pan, claimed, shown } = session.read();
    if (!geo || !pan) return;
    const nodes = nodesRef.current;
    const { focusable, entering } = framePass(
      placedRef.current,
      { w: geo.viewW, h: geo.viewH },
      pan,
      zoomRef.current,
      REVEAL_INSET,
      claimed,
    );

    // Tab order: revealed ∩ in frame, minus those whose pop has not started yet
    // (still at opacity 0 — a focus ring over empty plane). Entering objects are
    // in frame by construction (centre inside the inset frame), so they are
    // recorded here and become tabbable the moment their pop starts. Diff against
    // the previous set and touch only the buttons that changed.
    const inFrame = new Set(focusable);
    for (const id of entering) inFrame.add(id);
    inFrameRef.current = inFrame;
    const next = new Set<string>();
    for (const id of focusable) if (shown.has(id)) next.add(id);
    const prev = tabbableRef.current;
    for (const id of prev) {
      if (!next.has(id)) {
        const el = nodes.get(id);
        if (el) el.tabIndex = -1;
      }
    }
    for (const id of next) {
      if (!prev.has(id)) {
        const el = nodes.get(id);
        if (el) el.tabIndex = 0;
      }
    }
    tabbableRef.current = next;

    if (entering.length > 0) reveal(entering);
  };

  // Every mover mirrors the pan layer's transform into the session from its own
  // onUpdate, then runs the pass on that fresh pan.
  const syncPan = () => {
    const panLayer = panLayerRef.current;
    if (!panLayer) return;
    session.savePan({
      x: gsap.getProperty(panLayer, 'x') as number,
      y: gsap.getProperty(panLayer, 'y') as number,
    });
    runPass();
  };

  /*
   * Placement + drag + wheel. This effect DOES depend on the measured geometry —
   * world bounds and centering come from it — and recreates on every real
   * resize, which is cheap: nothing here animates, it only places the plane and
   * rebuilds the Draggable/Observer. `zoom` is deliberately NOT a dep: a zoom
   * click must not destroy the Draggable mid-inertia (bounds are re-applied by
   * the zoom effect below).
   *
   * Placement is synchronous and plugin-free, so the plane is centred — or back
   * where the session left it — and the first pass has a pan to work with,
   * before the first paint, without waiting for the import. The interaction
   * plugins arrive via dynamic import (SSR + bundle size, see gsap.ts), so
   * Draggable and Observer are created AFTER an await. That changes the cleanup
   * contract: a resize or reduced-motion flip before the plugins land (or
   * StrictMode's double mount — same shape) runs the cleanup while the import
   * is still pending — there is no instance to kill yet, and a context reverted
   * then cannot revert what has not been created. Hence the `cancelled` flag
   * checked after the await, and the instances held in closure variables the
   * cleanup kills explicitly.
   */
  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    const zoomLayer = zoomLayerRef.current;
    const panLayer = panLayerRef.current;
    if (!viewport || !zoomLayer || !panLayer || !geometry) return;

    const view: Size = { w: geometry.viewW, h: geometry.viewH };
    const world: Size = { w: geometry.worldW, h: geometry.worldH };

    let cancelled = false;
    let drag: Draggable | null = null;
    let wheel: Observer | null = null;

    const ctx = gsap.context(() => {
      // The LIVE scale, not the prop: recreating this effect mid-zoom-tween must
      // not snap the scale to the target.
      gsap.set(zoomLayer, { scale: zoomRef.current });

      // First placement centres the world — with the zoom origin at the viewport
      // centre that pan is zoom-invariant. Later runs (resize, return from the
      // grid) keep the travelled pan, re-clamped against the (possibly new) world.
      const start = clampPan(
        session.read().pan ?? centerPan(world, view),
        panBounds(world, view, zoom),
      );
      session.savePan(start);
      gsap.set(panLayer, { x: start.x, y: start.y });
    }, viewport);
    placedOnceRef.current = true;
    // A new viewport size means new objects in frame.
    runPass();

    void loadInteractionPlugins().then(({ Draggable, Observer }) => {
      // Cleanup already ran: this mount is gone, create nothing for it.
      if (cancelled) return;

      ctx.add(() => {
        // The target this render's zoom effect has applied by now — the closure's
        // `zoom` could be a step behind if a click landed before the import did.
        const bounds = panBounds(world, view, zoomAppliedRef.current);

        /*
         * will-change, put on and taken off (§7): the pan layer is promoted while
         * a gesture is actually moving it — pointer down, inertia throw, or the
         * wheel chase — and demoted the moment everything is at rest. Never
         * permanent: a forever-promoted layer squats on GPU memory for the life
         * of the page. Skipped under reduced motion (every movement is an
         * instant set; there is nothing to promote for).
         */
        let promoted = false;
        const promote = () => {
          if (reduced || promoted) return;
          promoted = true;
          gsap.set(panLayer, { willChange: 'transform' });
        };
        const demote = () => {
          if (!promoted) return;
          if (drag && (drag.isDragging || drag.isThrowing)) return;
          if (panToX.tween?.isActive() || panToY.tween?.isActive()) return;
          promoted = false;
          gsap.set(panLayer, { willChange: 'auto' });
        };

        /*
         * Wheel feeds a TARGET that quickTo chases — continuous pursuit, never raw
         * deltas per event. Each axis syncs pan from its OWN onUpdate: a purely
         * horizontal gesture never ticks the y tween, and if only one axis synced,
         * the other axis's movement would go unrecorded.
         */
        const { durMicro, easeMicro } = motion();
        const chase = reduced ? 0 : durMicro;
        const panToX = gsap.quickTo(panLayer, 'x', {
          duration: chase,
          ease: easeMicro,
          onUpdate: syncPan,
          onComplete: demote,
        });
        const panToY = gsap.quickTo(panLayer, 'y', {
          duration: chase,
          ease: easeMicro,
          onUpdate: syncPan,
          onComplete: demote,
        });

        /*
         * Safety net: one Draggable per node, ever. A survivor here means a
         * cleanup was skipped — it must not accumulate. (GSAP itself kills the
         * previous Draggable on a target, but that is its policy, this is ours.)
         */
        Draggable.get(panLayer)?.kill();

        /*
         * `trigger` (the viewport, which never moves) ≠ `target` (the pan layer):
         * with a single node the layer eventually translates out from under the
         * pointer and stops receiving pointerdown — a dead zone.
         */
        const [instance] = Draggable.create(panLayer, {
          trigger: viewport,
          type: 'x,y',
          inertia: !reduced,
          zIndexBoost: false,
          edgeResistance: EDGE_RESISTANCE,
          // Below this the gesture is a click, not a drag: panning can start on
          // top of an object without activating it.
          minimumMovement: DRAG_THRESHOLD_PX,
          bounds,
          // The stylesheet's `cursor: grab` on the viewport would otherwise be
          // beaten by the inline `move` Draggable writes on its trigger.
          cursor: 'grab',
          activeCursor: 'grabbing',
          onPress: promote,
          // Fires once per gesture, only past minimumMovement — a click never
          // does. The root closes the panel here under dismissOn: 'planeDrag'.
          onDragStart: () => onDragStartRef.current?.(),
          onDrag: syncPan,
          onRelease: demote,
          onThrowUpdate: syncPan,
          onThrowComplete: demote,
        });
        drag = instance ?? null;
        draggableRef.current = drag;

        wheel = Observer.create({
          target: viewport,
          type: 'wheel',
          preventDefault: true,
          wheelSpeed: WHEEL_SPEED,
          onChange(self) {
            const { pan } = session.read();
            if (!pan) return;
            promote();
            // Deltas arrive in SCREEN px and pan lives in world units: divide by
            // the live zoom (at half scale, 100 px of wheel is 200 px of world).
            const z = zoomRef.current;
            const target = clampPan(
              { x: pan.x - self.deltaX / z, y: pan.y - self.deltaY / z },
              panBounds(world, view, z),
            );
            panToX(target.x);
            panToY(target.y);
          },
        });
      });
    });

    return () => {
      cancelled = true;
      // Explicit kills, not just the context: these were created after the await,
      // and a context reverted before they existed cannot know about them.
      drag?.kill();
      drag = null;
      draggableRef.current = null;
      wheel?.kill();
      wheel = null;
      ctx.revert();
    };
  }, [geometry, reduced]);

  /*
   * Zoom, in its own context: with `zoom` in the drag effect's deps every click
   * would destroy and recreate the Draggable and Observer mid-inertia. Geometry is
   * read from the REF, not the deps — a resize mid-tween would recreate this
   * context and its revert() would snap the scale back.
   *
   * Recreation still reverts the previous run's tweens, so setup starts by
   * restoring the live values from the refs. Revert and restore happen in the same
   * layout pass, so the reverted state never paints.
   *
   * Written out (not via useGsapContext) because the pass must run AFTER the
   * context is built: `reveal()` adds pops to the reveal context, and GSAP's
   * `Context.add()` called while another context is under construction nests the
   * called context INTO the one being built — the next zoom's revert would then
   * take every pop with it. Tween callbacks (the motion branch) run outside any
   * construction, so they are safe; the instant branch is the one that must wait.
   */
  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    const zoomLayer = zoomLayerRef.current;
    const panLayer = panLayerRef.current;
    if (!viewport || !zoomLayer || !panLayer) return;

    let passAfter = false;
    const ctx = gsap.context(() => {
      gsap.set(zoomLayer, { scale: zoomRef.current });
      const { pan } = session.read();
      if (pan) gsap.set(panLayer, { x: pan.x, y: pan.y });

      if (zoom === zoomAppliedRef.current) return;
      zoomAppliedRef.current = zoom;

      const geo = geometryRef.current;
      if (!geo) {
        // Zoomed before the first measurement: nothing to clamp against yet; land
        // instantly. The drag effect re-reads zoomRef when geometry arrives.
        zoomRef.current = zoom;
        gsap.set(zoomLayer, { scale: zoom });
        return;
      }
      const view: Size = { w: geo.viewW, h: geo.viewH };
      const world: Size = { w: geo.worldW, h: geo.worldH };
      const bounds = panBounds(world, view, zoom);
      const durUi = motion().durUi;

      // Zooming out NARROWS the pan range (a smaller scale shows more world), so
      // the current pan may fall outside it — bring it back on the same curve as
      // the scale.
      if (pan) {
        const settled = clampPan(pan, bounds);
        if (settled.x !== pan.x || settled.y !== pan.y) {
          if (reduced) {
            session.savePan(settled);
            gsap.set(panLayer, { x: settled.x, y: settled.y });
          } else {
            gsap.to(panLayer, {
              x: settled.x,
              y: settled.y,
              duration: durUi,
              ease: ZOOM_TWEEN_EASE,
              onUpdate: syncPan,
            });
          }
        }
      }
      draggableRef.current?.applyBounds(bounds);

      if (reduced) {
        zoomRef.current = zoom;
        gsap.set(zoomLayer, { scale: zoom });
        passAfter = true;
      } else {
        // Promoted for the tween only, demoted on landing — never permanent.
        // The promotion is recorded by this context, so a mid-tween revert
        // strips it along with the tween.
        gsap.set(zoomLayer, { willChange: 'transform' });
        gsap.to(zoomLayer, {
          scale: zoom,
          duration: durUi,
          ease: ZOOM_TWEEN_EASE,
          onUpdate: () => {
            zoomRef.current = gsap.getProperty(zoomLayer, 'scaleX') as number;
            runPass();
          },
          onComplete: () => gsap.set(zoomLayer, { willChange: 'auto' }),
        });
      }
    }, viewport);
    if (passAfter) runPass();

    return () => ctx.revert();
  }, [zoom, reduced]);

  /*
   * Reveal context (§6.7). Depends on the boolean `measured`, NEVER on the
   * geometry object: the ResizeObserver's second measurement would recreate the
   * context and its revert() would kill the intro and every pop in flight — no
   * console error, the objects simply end up visible and un-animated. Geometry is
   * read from the ref inside the pass. `reduced` is read from its ref for the same
   * reason: a flip mid-intro must not revert the intro.
   *
   * Runs after the placement effect above (declaration order), so the first pass
   * already has a pan: the intro pops right here, before the first paint of the
   * measured plane, without waiting for the plugins. Back from the grid, the
   * session already knows what showed: no second intro.
   */
  const measured = geometry !== null;
  useGsapContext(
    (self) => {
      const panLayer = panLayerRef.current;
      if (!panLayer || !measured) return;
      revealCtxRef.current = self;
      revealRngRef.current ??= createRng(`${layout.seed}:reveal`);

      // Baseline: everything not yet shown is hidden, everything shown is shown
      // (a previous run's revert restored the plain markup). Tab order starts
      // empty and is rebuilt by the pass.
      const { shown, introDone } = session.read();
      const hidden: Element[] = [];
      const visible: Element[] = [];
      for (const [id, el] of nodesRef.current) {
        if (shown.has(id)) {
          visible.push(el);
          // Fresh nodes (back from the grid) carry none of the pass's marks yet.
          el.setAttribute('data-vitrina-revealed', '');
        } else {
          hidden.push(el);
        }
      }
      if (hidden.length > 0) hide(hidden, introDone ? REVEAL_SCALE : INTRO_SCALE);
      if (visible.length > 0) show(visible);
      for (const id of tabbableRef.current) {
        const el = nodesRef.current.get(id);
        if (el) el.tabIndex = -1;
      }
      tabbableRef.current = new Set();

      runPass();

      return () => {
        revealCtxRef.current = null;
        // Revert just killed every pop still waiting in a stagger. Those objects
        // are back at their plain markup and have never been seen: unclaim them so
        // the next context's first pass pops them again (as the intro, if nothing
        // ever showed) instead of showing them un-animated.
        session.unclaimPending();
        if (session.read().shown.size === 0) session.resetIntro();
      };
    },
    viewportRef,
    [measured],
  );

  /*
   * View hand-off, arrival side: the grid's cards Flip into the objects they
   * came from. Needs the plane placed and its baseline applied (both gate on
   * `measured`, both declared above), so it runs when `measured` turns true —
   * the first render has no geometry and must leave the record untouched.
   * Targets are the shown objects only; cards whose object is not shown simply
   * vanish. Under reduced motion the swap is instant and the record is dropped.
   */
  useGsapContext(
    () => {
      if (!measured) return;
      const record = session.takeFlip();
      const plugins = getInteractionPlugins();
      if (!record || !plugins || reducedRef.current) return;
      const { shown } = session.read();
      const targets: Element[] = [];
      for (const [id, el] of nodesRef.current) if (shown.has(id)) targets.push(el);
      if (targets.length === 0) return;
      plugins.Flip.from(record.state, {
        targets,
        scale: true,
        prune: true,
        duration: VIEW_FLIP_SECONDS,
        ease: motion().easeFlight,
      });
    },
    viewportRef,
    [measured],
  );

  const { shown } = session.read();

  return (
    <div
      ref={viewportRef}
      data-vitrina-viewport=""
      // Unconditional: Lenis decides whether to hijack a wheel event by walking
      // composedPath(), never by checking defaultPrevented — without this
      // attribute a page running Lenis swallows the trackpad. Inert without Lenis.
      data-lenis-prevent=""
      role="region"
      aria-label={labels.viewport}
    >
      <div ref={zoomLayerRef} data-vitrina-zoom="">
        {/* World-sized: the one structural value only this render knows. */}
        <div ref={panLayerRef} data-vitrina-pan="" style={{ width: world.w, height: world.h }}>
          {/* The map still runs every render — it is 114 shallow prop
              comparisons. What it no longer does is re-run the consumer's
              `renderObject` for objects whose answer did not change. */}
          {placed.map((inst) => {
            const entity = entityById.get(inst.entityId);
            if (!entity) return null;
            return (
              <PlaneObject
                key={inst.id}
                entity={entity}
                instanceId={inst.id}
                x={inst.x}
                y={inst.y}
                size={inst.size}
                hidden={hiddenIds.has(inst.id)}
                isActive={inst.entityId === activeEntityId}
                isRevealed={shown.has(inst.id)}
                objectLabel={labels.objectLabel}
                renderObject={renderObject}
                nodeRef={nodeRef(inst.id)}
                onOpen={handleOpen}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
