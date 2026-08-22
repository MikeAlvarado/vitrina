import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Vitrina } from 'vitrina';
import type { VitrinaEntity, VitrinaLabels } from 'vitrina';

// base.css and void.css are step 7 and do not exist yet. Globbed instead of imported
// so this file runs today and picks them up — with HMR — the moment they land in
// packages/vitrina/src/styles; an empty match is not an error. Until then the page
// supplies the black (index.html) and the library's structural inline styles carry
// the mechanic.
import.meta.glob('../../../packages/vitrina/src/styles/{base,void}.css', { eager: true });

// Fifteen glyphs, zero image assets. If the plane feels right with these, the
// problem is never the images.
const GLYPHS: Record<string, string> = {
  stone: '🪨',
  gem: '💎',
  orb: '🔮',
  eye: '🧿',
  coin: '🪙',
  amphora: '🏺',
  urn: '⚱️',
  jar: '🫙',
  lamp: '🪔',
  lantern: '🏮',
  trumpet: '🎺',
  violin: '🎻',
  drum: '🥁',
  accordion: '🪗',
  banjo: '🪕',
};

const entities: VitrinaEntity[] = Object.entries(GLYPHS).map(([id, glyph]) => ({
  id,
  data: glyph,
}));

const labels: VitrinaLabels = {
  viewport: 'Plane',
  objectLabel: (entity) => entity.id,
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid',
  toPlane: 'Plane',
};

function App() {
  return (
    <Vitrina
      entities={entities}
      labels={labels}
      style={{ height: '100dvh', userSelect: 'none', WebkitUserSelect: 'none' }}
      renderObject={(entity) => (
        // SVG text scales with the button (the instance size), which a font-size
        // set from here could not know.
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          <text x="50" y="50" fontSize="82" textAnchor="middle" dominantBaseline="central">
            {entity.data as string}
          </text>
        </svg>
      )}
    />
  );
}

// StrictMode stays ON. In development it mounts, unmounts and remounts every effect:
// the cheapest GSAP leak detector there is, and it finds in seconds what the step-4
// teardown test formalises. Duplicated objects or two Draggables fighting over the
// plane means it is working, not that it is broken.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
