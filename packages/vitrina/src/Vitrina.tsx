import { useCallback, useMemo, useState } from 'react';

import type { VitrinaApi, VitrinaProps, VitrinaView } from './types';
import { DEFAULT_ZOOM_INDEX, DEFAULT_ZOOM_STEPS, resolveLayout } from './defaults';
import { VitrinaContext } from './context';
import { usePrefersReducedMotion } from './reducedMotion';
import { createSession } from './session';
import { Plane } from './plane/Plane';
import { Grid } from './grid/Grid';

const clampIndex = (index: number, count: number): number =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(index)));

/**
 * Root component: resolves configuration, owns the state (zoom and view; the
 * active item joins in a later step) and the session the plane keeps across
 * view toggles, and exposes it all through context for `useVitrina()`. The
 * library renders no chrome — controls come in as children.
 */
export function Vitrina({
  entities,
  instances,
  layout,
  renderObject,
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
   * 'respect' (default): no intro, no pops, no inertia, no Flip — drag, wheel,
   * zoom and the toggle still work. 'grid': additionally lock the view to the
   * grid, with no toggle and no zoom. 'ignore': animate regardless — the
   * consumer taking the accessibility decision on themselves.
   */
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion === 'ignore' ? false : prefersReduced;
  const viewLocked = reducedMotion === 'grid' && prefersReduced;

  // View: controlled when `view` is given, uncontrolled otherwise — same shape
  // as `activeId`. The lock overrides both.
  const [internalView, setInternalView] = useState<VitrinaView>(defaultView);
  const controlled = viewProp !== undefined;
  const view: VitrinaView = viewLocked ? 'grid' : controlled ? viewProp : internalView;

  const setView = useCallback(
    (next: VitrinaView) => {
      if (viewLocked || next === view) return;
      onViewChange?.(next);
      if (!controlled) setInternalView(next);
    },
    [viewLocked, view, controlled, onViewChange],
  );

  const index = clampIndex(zoomIndex, stepCount);
  const zoom = zoomSteps[index] ?? 1;

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
    }),
    [zoomSteps, index, zoom, stepCount, view, setView, viewLocked],
  );

  return (
    <div
      data-vitrina-root=""
      data-vitrina-view={view}
      className={className}
      style={{ position: 'relative', ...style }}
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
          />
        )}
        {children}
      </VitrinaContext.Provider>
    </div>
  );
}
