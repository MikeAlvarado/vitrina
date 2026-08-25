import { Vitrina } from 'vitrina';
import type { VitrinaEntity, VitrinaLabels } from 'vitrina';
import 'vitrina/styles.css'; // required: structure, stacking, focus geometry
import 'vitrina/themes/void.css'; // exactly one theme

const labels: VitrinaLabels = {
  viewport: 'Explorable collection',
  objectLabel: (e) => String(e.id),
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid view',
  toPlane: 'Plane view',
};

export function Gallery({ entities }: { entities: VitrinaEntity[] }) {
  return (
    <Vitrina
      entities={entities}
      labels={labels}
      renderObject={(e) => <img src={String(e.data)} alt="" draggable={false} />}
      style={{ height: '100dvh' }}
    />
  );
}
