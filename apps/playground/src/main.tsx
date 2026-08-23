import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Vitrina } from 'vitrina';
import type { VitrinaEntity, VitrinaLabels } from 'vitrina';

// base.css exists since step 6 (focus rules, the panel wipe, and the stacking +
// motion tokens); void.css is step 7 and does not exist yet. Globbed instead of
// imported so this file runs whether or not each is present, and picks up void.css
// — with HMR — the moment it lands in packages/vitrina/src/styles; an empty match
// is not an error. The page still supplies the black (index.html); the library's
// structural inline styles carry the mechanic either way.
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
  // The two collision modes are only tellable apart in a real browser (the gate
  // proves the state machine, never the feel): a toggle to flip between them.
  const [collision, setCollision] = useState<'serialize' | 'crossfade'>('serialize');
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 100,
          display: 'flex',
          gap: 8,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        {(['serialize', 'crossfade'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setCollision(mode)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #333',
              background: collision === mode ? '#fff' : 'transparent',
              color: collision === mode ? '#000' : '#fff',
              cursor: 'pointer',
            }}
          >
            {mode}
          </button>
        ))}
      </div>
      <Vitrina
        entities={entities}
        labels={labels}
        openCollision={collision}
        style={{ height: '100dvh', userSelect: 'none', WebkitUserSelect: 'none' }}
        // The panel is a shell: everything below is the playground's, including the
        // close button (the library renders no buttons; Escape works regardless).
        // The body length varies by entity so the panel's between-objects HEIGHT
        // tween is visible when stepping ← / → without closing. Each block is
        // marked data-vitrina-line: the library staggers them in after the wipe
        // (alongside the flight), re-arms them on ← / →, and staggers them out —
        // tighter, last first — on close.
        renderDetail={(entity, ctx) => (
          <div style={{ padding: 24, display: 'grid', gap: 12 }}>
            <strong data-vitrina-line="">{entity.id}</strong>
            <p data-vitrina-line="" style={{ margin: 0, opacity: 0.7, lineHeight: 1.5 }}>
              {`${entity.id} `.repeat(4 + (entity.id.length % 5) * 8)}
            </p>
            <div data-vitrina-line="" style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={ctx.prev}>
                ←
              </button>
              <button type="button" onClick={ctx.next}>
                →
              </button>
              <button type="button" onClick={ctx.close} aria-label={labels.closeDetail}>
                ×
              </button>
            </div>
          </div>
        )}
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
    </>
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
