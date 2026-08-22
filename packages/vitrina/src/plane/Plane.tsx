/*
 * The explorable plane: a finite world panned by drag and wheel, zoomed in
 * discrete steps. Internal — consumers mount `<Vitrina>`.
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
 * bounds and (from the next step) visibility derive from that analytically —
 * zero `getBoundingClientRect()` per frame.
 *
 * This step renders every object visible from the start: reveal, tab order, grid
 * view, and the detail flight are later steps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gsap } from 'gsap';
import type { Draggable } from 'gsap/Draggable';

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
  WHEEL_CHASE_EASE,
  WHEEL_CHASE_SECONDS,
  WHEEL_SPEED,
  ZOOM_TWEEN_EASE,
  ZOOM_TWEEN_SECONDS,
} from '../defaults';
import { generateInstances } from '../layout/generate';
import {
  loadInteractionPlugins,
  useGsapContext,
  useIsomorphicLayoutEffect,
  type InteractionPlugins,
} from '../gsap';
import { centerPan, clampPan, panBounds, selectWorld } from './geometry';
import type { Pan, Size } from './geometry';

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
  /** Effective reduced motion: no inertia, no wheel smoothing, no zoom tween. */
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
   * (the zoom effect below) read it here instead of closing over the state.
   */
  const geometryRef = useRef<PlaneGeometry | null>(null);

  const [geometry, setGeometry] = useState<PlaneGeometry | null>(null);
  const [plugins, setPlugins] = useState<InteractionPlugins | null>(null);

  // The interaction plugins arrive via dynamic import (SSR + bundle size, see
  // gsap.ts). Until they land the plane renders static — the same markup the
  // server produced.
  useEffect(() => {
    let alive = true;
    void loadInteractionPlugins().then((loaded) => {
      if (alive) setPlugins(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Measuring lives in its OWN layout effect, before and outside any GSAP
   * context. Geometry lands in state (the re-render is what hands it to the drag
   * context below via its deps) and in the ref (for effects that must not recreate
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

  // Every mover mirrors the pan layer's transform into panRef from its own
  // onUpdate. (The next step's visibility pass hooks in here too.)
  const syncPan = () => {
    const panLayer = panLayerRef.current;
    if (!panLayer) return;
    panRef.current = {
      x: gsap.getProperty(panLayer, 'x') as number,
      y: gsap.getProperty(panLayer, 'y') as number,
    };
  };

  /*
   * Drag + wheel. This context DOES depend on the measured geometry — world
   * bounds and centering come from it — and recreates on every real resize, which
   * is cheap: nothing here animates, it only places the plane and rebuilds the
   * Draggable/Observer. `zoom` is deliberately NOT a dep: a zoom click must not
   * destroy the Draggable mid-inertia (bounds are re-applied by the zoom effect
   * below; the closure's `zoom` is still fresh at every re-creation because a
   * dep change always rides a re-render).
   */
  useGsapContext(
    () => {
      const viewport = viewportRef.current;
      const zoomLayer = zoomLayerRef.current;
      const panLayer = panLayerRef.current;
      if (!viewport || !zoomLayer || !panLayer || !geometry || !plugins) return;
      const { Draggable, Observer } = plugins;

      const view: Size = { w: geometry.viewW, h: geometry.viewH };
      const world: Size = { w: geometry.worldW, h: geometry.worldH };

      // The LIVE scale, not the prop: recreating this context mid-zoom-tween must
      // not snap the scale to the target.
      gsap.set(zoomLayer, { scale: zoomRef.current });

      // First mount centres the world — with the zoom origin at the viewport
      // centre that pan is zoom-invariant. Later runs keep the travelled pan,
      // re-clamped against the (possibly new) world.
      const bounds = panBounds(world, view, zoom);
      const start = clampPan(panRef.current ?? centerPan(world, view), bounds);
      panRef.current = start;
      gsap.set(panLayer, { x: start.x, y: start.y });

      /*
       * `trigger` (the viewport, which never moves) ≠ `target` (the pan layer):
       * with a single node the layer eventually translates out from under the
       * pointer and stops receiving pointerdown — a dead zone.
       */
      const [drag] = Draggable.create(panLayer, {
        trigger: viewport,
        type: 'x,y',
        inertia: !reduced,
        zIndexBoost: false,
        edgeResistance: EDGE_RESISTANCE,
        // Below this the gesture is a click, not a drag: panning can start on top
        // of an object without activating it.
        minimumMovement: DRAG_THRESHOLD_PX,
        bounds,
        onDrag: syncPan,
        onThrowUpdate: syncPan,
      });
      draggableRef.current = drag ?? null;

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

      const wheel = Observer.create({
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

      return () => {
        drag?.kill();
        draggableRef.current = null;
        wheel.kill();
      };
    },
    viewportRef,
    [geometry, reduced, plugins],
  );

  /*
   * Zoom, in its own context: with `zoom` in the drag context's deps every click
   * would destroy and recreate the Draggable and Observer mid-inertia. Geometry is
   * read from the REF, not the deps — a resize mid-tween would recreate this
   * context and its revert() would snap the scale back.
   *
   * Recreation still reverts the previous run's tweens, so setup starts by
   * restoring the live values from the refs. Revert and restore happen in the same
   * layout pass, so the reverted state never paints.
   */
  useGsapContext(
    () => {
      const zoomLayer = zoomLayerRef.current;
      const panLayer = panLayerRef.current;
      if (!zoomLayer || !panLayer) return;

      gsap.set(zoomLayer, { scale: zoomRef.current });
      const pan = panRef.current;
      if (pan) gsap.set(panLayer, { x: pan.x, y: pan.y });

      if (zoom === zoomAppliedRef.current) return;
      zoomAppliedRef.current = zoom;

      const geo = geometryRef.current;
      if (!geo) {
        // Zoomed before the first measurement: nothing to clamp against yet; land
        // instantly. The drag context re-reads zoomRef when geometry arrives.
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
      } else {
        gsap.to(zoomLayer, {
          scale: zoom,
          duration: ZOOM_TWEEN_SECONDS,
          ease: ZOOM_TWEEN_EASE,
          onUpdate: () => {
            zoomRef.current = gsap.getProperty(zoomLayer, 'scaleX') as number;
          },
        });
      }
    },
    viewportRef,
    [zoom, reduced],
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
                type="button"
                data-vitrina-object=""
                data-vitrina-instance={inst.id}
                data-vitrina-entity={inst.entityId}
                aria-label={labels.objectLabel(entity)}
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
                  isRevealed: true,
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
