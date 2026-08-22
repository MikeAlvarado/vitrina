import { useMemo, useState } from 'react';

import type { VitrinaApi, VitrinaProps } from './types';
import { DEFAULT_ZOOM_INDEX, DEFAULT_ZOOM_STEPS, resolveLayout } from './defaults';
import { VitrinaContext } from './context';
import { usePrefersReducedMotion } from './reducedMotion';
import { Plane } from './plane/Plane';

const clampIndex = (index: number, count: number): number =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(index)));

/**
 * Root component: resolves configuration, owns the state (zoom for now; view and
 * the active item join in later steps), and exposes it through context for
 * `useVitrina()`. The library renders no chrome — controls come in as children.
 */
export function Vitrina({
  entities,
  instances,
  layout,
  renderObject,
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

  // 'grid' locks to the grid view, which does not exist yet — until that step it
  // behaves as 'respect'. 'ignore' is the consumer taking the accessibility
  // decision on themselves.
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion === 'ignore' ? false : prefersReduced;

  const index = clampIndex(zoomIndex, stepCount);
  const zoom = zoomSteps[index] ?? 1;

  const api = useMemo<VitrinaApi>(
    () => ({
      zoomSteps,
      zoomIndex: index,
      zoom,
      zoomIn: () => setZoomIndex((i) => clampIndex(i + 1, stepCount)),
      zoomOut: () => setZoomIndex((i) => clampIndex(i - 1, stepCount)),
      setZoomIndex: (next) => setZoomIndex(clampIndex(next, stepCount)),
    }),
    [zoomSteps, index, zoom, stepCount],
  );

  return (
    <div data-vitrina-root="" className={className} style={{ position: 'relative', ...style }}>
      <VitrinaContext.Provider value={api}>
        <Plane
          entities={entities}
          instances={instances}
          layout={resolvedLayout}
          renderObject={renderObject}
          labels={labels}
          zoom={zoom}
          reduced={reduced}
        />
        {children}
      </VitrinaContext.Provider>
    </div>
  );
}
