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
 * and get popped. Grid view and the detail flight are later steps.
 */

import { useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
  WHEEL_CHASE_EASE,
  WHEEL_CHASE_SECONDS,
  WHEEL_SPEED,
  ZOOM_TWEEN_EASE,
  ZOOM_TWEEN_SECONDS,
} from '../defaults';
import { generateInstances } from '../layout/generate';
import { createRng } from '../layout/rng';
import { loadInteractionPlugins, useGsapContext, useIsomorphicLayoutEffect } from '../gsap';
import { centerPan, clampPan, panBounds, selectWorld } from './geometry';
import type { Pan, Size } from './geometry';
import { framePass, staggerDelays } from './reveal';

/** Viewport and world measurements, cached — never re-measured per frame. */
interface PlaneGeometry {
  viewW: number;
  viewH: number;
  worldW: number;
  worldH: number;
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
  /** Effective reduced motion: no intro, no pops, no inertia, no wheel smoothing, no zoom tween. */
  reduced: boolean;
}

/*
 * Structural styles are inline because they ARE the mechanic (two transform
 * layers, hidden overflow, touch capture), not theme. Theme — colors, the
 * :focus-visible ring, cursor states — arrives with the compiled CSS in a later
 * step; nothing below depends on it.
 */
const VIEWPORT_STYLE: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  touchAction: 'none',
  cursor: 'grab',
};

const ZOOM_LAYER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  transformOrigin: '50% 50%',
  willChange: 'transform',
};

const OBJECT_STYLE: CSSProperties = {
  position: 'absolute',
  display: 'block',
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};

/*
 * Unrevealed = opacity 0 AND pointer-events none (§6.5): invisible but clickable
 * would open a panel from empty plane. Both are GSAP-owned inline styles, so the
 * reveal context's revert() restores the plain, server-rendered object.
 */
const hide = (targets: Element[], scale: number) =>
  gsap.set(targets, { opacity: 0, scale, pointerEvents: 'none' });
const show = (targets: Element[]) => gsap.set(targets, { opacity: 1, scale: 1, pointerEvents: 'auto' });

export function Plane({
  entities,
  instances,
  layout,
  renderObject,
  labels,
  zoom,
  reduced,
}: PlaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const panLayerRef = useRef<HTMLDivElement>(null);

  /** Live pan in world units. GSAP's inline transform is the source of truth; this mirrors it. */
  const panRef = useRef<Pan | null>(null);
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

  /*
   * Reveal and tab-order state lives in refs, not React state: it changes on
   * movement frames, and the DOM is written directly — only on change, never
   * every frame. React never renders any of it, so a re-render can never clobber
   * it either.
   */
  /** Instance id → its button. Filled by stable callback refs; the pass never queries the DOM. */
  const nodesRef = useRef(new Map<string, HTMLButtonElement>());
  /** One stable ref callback per instance id, so React only calls them on attach/detach. */
  const nodeRefsRef = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());
  /**
   * Ids the pass has claimed — queued for a pop, or shown. Handed to `framePass`
   * as its revealed set so an id is never re-emitted while it waits its turn in a
   * stagger. A queued pop that its context reverts before it starts is UNclaimed
   * again (see the reveal context's cleanup) and re-enters on the next pass.
   */
  const claimedRef = useRef(new Set<string>());
  /**
   * Ids whose pop has started (or landed instantly). THIS is the permanent,
   * revealed set — it survives the grid toggle and any context recreation.
   */
  const shownRef = useRef(new Set<string>());
  /** Ids in frame per the last pass, revealed or not yet shown — consulted when a pop starts. */
  const inFrameRef = useRef(new Set<string>());
  /** Ids currently carrying tabindex=0 — the attribute is written only when this set changes. */
  const tabbableRef = useRef(new Set<string>());
  /** The reveal context: pops fired from movement frames are added to it so its revert() kills them. */
  const revealCtxRef = useRef<gsap.Context | null>(null);
  /** Seeded gap generator for pop staggers — the only randomness on this side of the library. */
  const revealRngRef = useRef<(() => number) | null>(null);
  /** True until the first batch pops: that batch is the intro, from INTRO_SCALE. */
  const introPendingRef = useRef(true);
  const placedRef = useRef<readonly VitrinaInstance[]>([]);
  const reducedRef = useRef(reduced);
  /** Re-renders once per finished reveal batch so `renderObject` sees `isRevealed` flip. */
  const [, bumpRevealed] = useReducer((n: number) => n + 1, 0);

  const [geometry, setGeometry] = useState<PlaneGeometry | null>(null);

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
      const { world } = selectWorld(layout, width);
      const next: PlaneGeometry = {
        viewW: width,
        viewH: height,
        worldW: world.w,
        worldH: world.h,
        compact: width < layout.compactBreakpoint,
      };
      const current = geometryRef.current;
      if (
        current &&
        current.viewW === next.viewW &&
        current.viewH === next.viewH &&
        current.worldW === next.worldW &&
        current.worldH === next.worldH
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
  }, [layout]);

  /*
   * Until the first measurement this generates for the regular world — the same
   * plane the server rendered, so hydration matches. A compact viewport
   * regenerates right after, in the re-render the measurement triggers.
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

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  // Mirrors for the frame-driven code, which must read the CURRENT values without
  // being recreated when they change. Declared before the effects that read them.
  useIsomorphicLayoutEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  useIsomorphicLayoutEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const nodeRef = (id: string) => {
    let ref = nodeRefsRef.current.get(id);
    if (!ref) {
      ref = (el) => {
        if (el) {
          nodesRef.current.set(id, el);
          // An object that appears after the reveal context exists (consumer changed
          // the instances) is born hidden like every other unrevealed one.
          const ctx = revealCtxRef.current;
          if (ctx && !shownRef.current.has(id)) ctx.add(() => hide([el], REVEAL_SCALE));
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
    shownRef.current.add(id);
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
    for (const id of ids) claimedRef.current.add(id);
    const intro = introPendingRef.current;
    introPendingRef.current = false;

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
        gsap.fromTo(
          el,
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
    const pan = panRef.current;
    if (!geo || !pan) return;
    const nodes = nodesRef.current;
    const { focusable, entering } = framePass(
      placedRef.current,
      { w: geo.viewW, h: geo.viewH },
      pan,
      zoomRef.current,
      REVEAL_INSET,
      claimedRef.current,
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
    for (const id of focusable) if (shownRef.current.has(id)) next.add(id);
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

  // Every mover mirrors the pan layer's transform into panRef from its own
  // onUpdate, then runs the pass on that fresh pan.
  const syncPan = () => {
    const panLayer = panLayerRef.current;
    if (!panLayer) return;
    panRef.current = {
      x: gsap.getProperty(panLayer, 'x') as number,
      y: gsap.getProperty(panLayer, 'y') as number,
    };
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
   * Placement is synchronous and plugin-free, so the plane is centred — and the
   * first pass has a pan to work with — before the first paint, without waiting
   * for the import. The interaction plugins arrive via dynamic import (SSR +
   * bundle size, see gsap.ts), so Draggable and Observer are created AFTER an
   * await. That changes the cleanup contract: a resize or reduced-motion flip
   * before the plugins land (or StrictMode's double mount — same shape) runs the
   * cleanup while the import is still pending — there is no instance to kill
   * yet, and a context reverted then cannot revert what has not been created.
   * Hence the `cancelled` flag checked after the await, and the instances held
   * in closure variables the cleanup kills explicitly.
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

      // First mount centres the world — with the zoom origin at the viewport
      // centre that pan is zoom-invariant. Later runs keep the travelled pan,
      // re-clamped against the (possibly new) world.
      const start = clampPan(
        panRef.current ?? centerPan(world, view),
        panBounds(world, view, zoom),
      );
      panRef.current = start;
      gsap.set(panLayer, { x: start.x, y: start.y });
    }, viewport);
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
          onDrag: syncPan,
          onThrowUpdate: syncPan,
        });
        drag = instance ?? null;
        draggableRef.current = drag;

        /*
         * Wheel feeds a TARGET that quickTo chases — continuous pursuit, never raw
         * deltas per event. Each axis syncs pan from its OWN onUpdate: a purely
         * horizontal gesture never ticks the y tween, and if only one axis synced,
         * the other axis's movement would go unrecorded.
         */
        const chase = reduced ? 0 : WHEEL_CHASE_SECONDS;
        const panToX = gsap.quickTo(panLayer, 'x', {
          duration: chase,
          ease: WHEEL_CHASE_EASE,
          onUpdate: syncPan,
        });
        const panToY = gsap.quickTo(panLayer, 'y', {
          duration: chase,
          ease: WHEEL_CHASE_EASE,
          onUpdate: syncPan,
        });

        wheel = Observer.create({
          target: viewport,
          type: 'wheel',
          preventDefault: true,
          wheelSpeed: WHEEL_SPEED,
          onChange(self) {
            const pan = panRef.current;
            if (!pan) return;
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
      const pan = panRef.current;
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

      // Zooming out NARROWS the pan range (a smaller scale shows more world), so
      // the current pan may fall outside it — bring it back on the same curve as
      // the scale.
      if (pan) {
        const settled = clampPan(pan, bounds);
        if (settled.x !== pan.x || settled.y !== pan.y) {
          if (reduced) {
            panRef.current = settled;
            gsap.set(panLayer, { x: settled.x, y: settled.y });
          } else {
            gsap.to(panLayer, {
              x: settled.x,
              y: settled.y,
              duration: ZOOM_TWEEN_SECONDS,
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
        gsap.to(zoomLayer, {
          scale: zoom,
          duration: ZOOM_TWEEN_SECONDS,
          ease: ZOOM_TWEEN_EASE,
          onUpdate: () => {
            zoomRef.current = gsap.getProperty(zoomLayer, 'scaleX') as number;
            runPass();
          },
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
   * measured plane, without waiting for the plugins.
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
      const hidden: Element[] = [];
      const visible: Element[] = [];
      for (const [id, el] of nodesRef.current) {
        (shownRef.current.has(id) ? visible : hidden).push(el);
      }
      if (hidden.length > 0) hide(hidden, introPendingRef.current ? INTRO_SCALE : REVEAL_SCALE);
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
        for (const id of claimedRef.current) {
          if (!shownRef.current.has(id)) claimedRef.current.delete(id);
        }
        if (shownRef.current.size === 0) introPendingRef.current = true;
      };
    },
    viewportRef,
    [measured],
  );

  // Before the first measurement (and on the server) the pan layer takes the
  // regular world's dimensions — the compact decision needs a viewport width.
  const world: Size = geometry ? { w: geometry.worldW, h: geometry.worldH } : layout.world;

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
      style={VIEWPORT_STYLE}
    >
      <div ref={zoomLayerRef} data-vitrina-zoom="" style={ZOOM_LAYER_STYLE}>
        <div
          ref={panLayerRef}
          data-vitrina-pan=""
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: world.w,
            height: world.h,
            willChange: 'transform',
          }}
        >
          {placed.map((inst) => {
            const entity = entityById.get(inst.entityId);
            if (!entity) return null;
            return (
              <button
                key={inst.id}
                ref={nodeRef(inst.id)}
                type="button"
                data-vitrina-object=""
                data-vitrina-instance={inst.id}
                data-vitrina-entity={inst.entityId}
                aria-label={labels.objectLabel(entity)}
                // Nothing is tabbable until the pass says so: the server and the
                // un-measured client agree, and the pass writes tabindex directly —
                // this prop never changes, so React never fights it.
                tabIndex={-1}
                style={{
                  ...OBJECT_STYLE,
                  left: inst.x,
                  top: inst.y,
                  width: inst.size,
                  height: inst.size,
                }}
              >
                {renderObject(entity, {
                  instanceId: inst.id,
                  isActive: false,
                  isRevealed: shownRef.current.has(inst.id),
                  view: 'plane',
                })}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
