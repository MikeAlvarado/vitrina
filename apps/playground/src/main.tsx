import { StrictMode, useState } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Vitrina, VitrinaControls } from 'vitrina';
import type { VitrinaEntity, VitrinaLabels } from 'vitrina';

// base.css is mandatory since step 7: it owns the structure (layers, stacking,
// overflow, focus geometry) — always loaded. The THEMES are imported as raw
// text instead: both target [data-vitrina-root], so loading the two at once
// would just cascade by file order; the theme switch injects exactly one into a
// <style> tag.
import.meta.glob('../../../packages/vitrina/src/styles/base.css', { eager: true });
const THEME_SOURCES = import.meta.glob('../../../packages/vitrina/src/styles/{paper,void}.css', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
type Theme = 'paper' | 'void';
const themeCss = (theme: Theme): string =>
  Object.entries(THEME_SOURCES).find(([path]) => path.endsWith(`/${theme}.css`))?.[1] ?? '';

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
  // The two collision modes, the two themes and slow motion are only tellable
  // apart in a real browser (the gate proves the machine, never the feel):
  // toggles for all three. Slow motion remounts (key): the motion tokens are
  // read once at mount, so retuning --vitrina-dur-flight needs a fresh mount.
  const [collision, setCollision] = useState<'serialize' | 'crossfade'>('serialize');
  const [theme, setTheme] = useState<Theme>('paper');
  const [slow, setSlow] = useState(false);
  const ink = theme === 'paper' ? '#222' : '#fff';
  const surface = theme === 'paper' ? '#f5f6ee' : '#000';
  const pill = (selected: boolean) => ({
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid currentColor',
    background: selected ? ink : 'transparent',
    color: selected ? surface : ink,
    cursor: 'pointer',
  });
  return (
    <>
      <style>{themeCss(theme)}</style>
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
          color: ink,
        }}
      >
        {(['serialize', 'crossfade'] as const).map((mode) => (
          <button key={mode} type="button" onClick={() => setCollision(mode)} style={pill(collision === mode)}>
            {mode}
          </button>
        ))}
        {(['paper', 'void'] as const).map((name) => (
          <button key={name} type="button" onClick={() => setTheme(name)} style={pill(theme === name)}>
            {name}
          </button>
        ))}
        <button type="button" onClick={() => setSlow((s) => !s)} style={pill(slow)}>
          2s flight
        </button>
      </div>
      <Vitrina
        key={slow ? 'slow' : 'normal'}
        entities={entities}
        labels={labels}
        openCollision={collision}
        style={{
          height: '100dvh',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          // Read once at the mount the `key` above forces: the whole
          // choreography in deliberate slow motion.
          ...(slow
            ? ({ '--vitrina-dur-flight': '2s', '--vitrina-dur-panel': '1.5s' } as CSSProperties)
            : {}),
        }}
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
      >
        {/* The library's own optional chrome: zoom out/in + view toggle over
            useVitrina(). Unstyled by design; index.html positions it. */}
        <VitrinaControls />
      </Vitrina>
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
