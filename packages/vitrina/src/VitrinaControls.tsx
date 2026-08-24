/*
 * Optional chrome: three buttons over `useVitrina()` — zoom out, zoom in, and
 * the view toggle. The library never mounts it on its own (chrome is opt-in);
 * mount it as a child of `<Vitrina>`, where the hook resolves.
 *
 * Unstyled beyond base.css's button reset and focus-ring geometry — no layout,
 * no colors, no opinion the tokens don't already carry; the consumer positions
 * and paints it through the data attributes. Every string comes from `labels`
 * (via the API): these buttons are the ONE place the library renders a label as
 * visible text — a control needs a face, and the words are still the
 * consumer's, never the library's.
 *
 * Under the `reducedMotion: 'grid'` lock the zoom and the toggle are all
 * no-ops, so the whole strip renders nothing — disabled buttons that never
 * enable would only advertise chrome that cannot work.
 */

import type { CSSProperties } from 'react';
import { useVitrina } from './context';

export interface VitrinaControlsProps {
  className?: string;
  style?: CSSProperties;
}

export function VitrinaControls({ className, style }: VitrinaControlsProps) {
  const api = useVitrina();
  if (api.viewLocked) return null;
  const atMin = api.zoomIndex <= 0;
  const atMax = api.zoomIndex >= api.zoomSteps.length - 1;
  return (
    <div data-vitrina-controls="" className={className} style={style}>
      <button type="button" data-vitrina-zoom-out="" disabled={atMin} onClick={api.zoomOut}>
        {api.labels.zoomOut}
      </button>
      <button type="button" data-vitrina-zoom-in="" disabled={atMax} onClick={api.zoomIn}>
        {api.labels.zoomIn}
      </button>
      <button type="button" data-vitrina-view-toggle="" onClick={api.toggleView}>
        {api.view === 'plane' ? api.labels.toGrid : api.labels.toPlane}
      </button>
    </div>
  );
}
