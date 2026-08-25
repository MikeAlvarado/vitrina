import { StrictMode, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Vitrina, VitrinaControls } from 'vitrina';
import type {
  VitrinaDetailContext,
  VitrinaDismiss,
  VitrinaEntity,
  VitrinaLabels,
  VitrinaPanelSide,
} from 'vitrina';

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
// problem is never the images. Code and price are playground data — the
// library never reads inside `data`.
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

interface Item {
  glyph: string;
  code: string;
  price: string;
}

/*
 * IMAGE objects (the default): one cut-out SVG shape per entity, as a data URI
 * <img>. Emoji-as-text stays behind the `content` toggle for A/B only — on
 * macOS, Chrome renders emoji from Apple Color Emoji, a BITMAP (sbix) font with
 * pre-generated strikes at fixed sizes: animating scale crosses strike
 * thresholds and the glyph snaps between bitmaps, which makes emoji text
 * useless for verifying scale animations.
 */
const hueOf = (id: string): number => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
const shapeUri = (id: string, i: number): string => {
  const hue = hueOf(id);
  const fill = `hsl(${hue} 65% 55%)`;
  const dark = `hsl(${hue} 70% 38%)`;
  const light = `hsl(${hue} 70% 75%)`;
  const shape =
    i % 3 === 0
      ? `<circle cx="50" cy="50" r="43" fill="${fill}"/><circle cx="37" cy="37" r="12" fill="${light}"/>`
      : i % 3 === 1
        ? `<polygon points="50,5 93,29 93,71 50,95 7,71 7,29" fill="${fill}"/><polygon points="50,5 93,29 50,53 7,29" fill="${dark}"/>`
        : `<polygon points="50,3 97,50 50,97 3,50" fill="${fill}"/><polygon points="50,3 97,50 50,50" fill="${dark}"/><polygon points="3,50 50,50 50,97" fill="${light}"/>`;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shape}</svg>`,
  )}`;
};
const SHAPES: Record<string, string> = Object.fromEntries(
  Object.keys(GLYPHS).map((id, i) => [id, shapeUri(id, i)]),
);

const entities: VitrinaEntity[] = Object.entries(GLYPHS).map(([id, glyph], i) => ({
  id,
  data: {
    glyph,
    code: `VT-${String(i + 1).padStart(3, '0')}`,
    price: `${24 + i * 7} €`,
  } satisfies Item,
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

/** The consumer's half of the `modal` contract: the same breakpoint as --vitrina-panel-size. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// --- The holes (one implementation each; the toggles only mount/unmount them) --

// Código y etiqueta, arriba.
const renderAbove = (entity: VitrinaEntity) => {
  const item = entity.data as Item;
  return (
    <header data-vitrina-line="" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ opacity: 0.6, fontSize: 12, letterSpacing: '0.08em' }}>{item.code}</span>
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          border: '1px solid currentColor',
          borderRadius: 999,
          padding: '2px 8px',
        }}
      >
        objeto
      </span>
    </header>
  );
};

// Riel vertical de miniaturas, al lado del objeto. The first thumb is OUR copy
// of the object: hidden behind objectSettled while the clone travels, so no
// frame shows two copies.
const renderBeside = (entity: VitrinaEntity, ctx: VitrinaDetailContext) => {
  const item = entity.data as Item;
  return (
    <ul className="pg-rail" data-vitrina-line="">
      {[0, 1, 2].map((n) => (
        <li key={n}>
          <button type="button" aria-label={`${entity.id} ${n + 1}`}>
            <span
              style={
                n === 0
                  ? { opacity: ctx.objectSettled ? 1 : 0.15, transition: 'opacity 0.2s' }
                  : { opacity: 0.55 }
              }
            >
              {item.glyph}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};

// Nombre y precio, bajo el objeto. The body length varies by entity so the
// between-objects HEIGHT tween is visible when stepping ← / →.
const renderDetail = (entity: VitrinaEntity) => {
  const item = entity.data as Item;
  return (
    <div style={{ display: 'grid', gap: 12, paddingTop: 16 }}>
      <h2 data-vitrina-line="" style={{ margin: 0, fontSize: 22 }}>
        {entity.id}
      </h2>
      <strong data-vitrina-line="" style={{ fontSize: 16 }}>
        {item.price}
      </strong>
      <p data-vitrina-line="" style={{ margin: 0, opacity: 0.7, lineHeight: 1.5 }}>
        {`${entity.id} `.repeat(4 + (entity.id.length % 5) * 8)}
      </p>
    </div>
  );
};

// Flechas al pie: margin-top auto against the column's min-height slack.
const renderBelow = (_: VitrinaEntity, ctx: VitrinaDetailContext) => (
  <footer data-vitrina-line="" style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', gap: 8 }}>
    <button type="button" onClick={() => ctx.step(-1)} style={{ font: 'inherit' }}>
      ←
    </button>
    <button type="button" onClick={() => ctx.step(1)} style={{ font: 'inherit' }}>
      →
    </button>
  </footer>
);

// La ✕: the library guarantees the region never scrolls; index.html decides
// where in it the button sits (over the seam on desktop, top-right under 640px).
const renderClose = (ctx: VitrinaDetailContext) => (
  <button type="button" className="pg-close" onClick={ctx.close} aria-label={labels.closeDetail}>
    ×
  </button>
);

// --- The configuration the controls edit, and the two presets ----------------

type Hole = 'above' | 'beside' | 'detail' | 'below' | 'close';
const HOLES: Hole[] = ['above', 'beside', 'detail', 'below', 'close'];
const DISMISSALS: VitrinaDismiss[] = ['escape', 'outside', 'planeDrag'];
const SIDES: VitrinaPanelSide[] = ['left', 'right', 'top', 'bottom'];

interface PanelConfig {
  side: VitrinaPanelSide;
  /** --vitrina-panel-size, percent. With `responsive`, the ≥640px value. */
  size: number;
  /** 100% under 640px, `size` above — the consumer's media query, not the library's. */
  responsive: boolean;
  beside: 'start' | 'end';
  /** 'compact' = modal only under the SAME 640px breakpoint as the size. */
  modal: 'off' | 'on' | 'compact';
  dismiss: Record<VitrinaDismiss, boolean>;
  holes: Record<Hole, boolean>;
}

const PRESETS: Record<'vitrina' | 'catálogo', PanelConfig> = {
  // The minimal case — what a fresh install of the library looks like: one
  // render prop, everything else at its default.
  vitrina: {
    side: 'right',
    size: 50,
    responsive: false,
    beside: 'start',
    modal: 'off',
    dismiss: { escape: true, outside: false, planeDrag: false },
    holes: { above: false, beside: false, detail: true, below: false, close: false },
  },
  // The Mediterra panel, rebuilt from props alone (the exam: nothing here may
  // need src/). Full width under 640px and half above; modal rides the same
  // breakpoint.
  catálogo: {
    side: 'left',
    size: 50,
    responsive: true,
    beside: 'start',
    modal: 'compact',
    dismiss: { escape: true, outside: false, planeDrag: false },
    holes: { above: true, beside: true, detail: true, below: true, close: true },
  },
};

function App() {
  // Collision modes, themes and slow motion are only tellable apart in a real
  // browser (the gate proves the machine, never the feel). Slow motion remounts
  // (key): the motion tokens are read once at mount. The PANEL config does NOT
  // remount — panelSide and the rest change hot, mid-flight too.
  const [collision, setCollision] = useState<'serialize' | 'crossfade'>('serialize');
  const [theme, setTheme] = useState<Theme>('paper');
  const [slow, setSlow] = useState(false);
  // img (default) vs emoji-as-text: the A/B that separates a library bug from a
  // bitmap-font artifact (see the note on SHAPES).
  const [content, setContent] = useState<'img' | 'emoji'>('img');
  const [config, setConfig] = useState<PanelConfig>(PRESETS.catálogo);
  const patch = (p: Partial<PanelConfig>) => setConfig((c) => ({ ...c, ...p }));

  // index.html has no breakpoints of its own any more: the size/inset tokens are
  // emitted below from the config, media query included. `modal` rides the SAME
  // breakpoint — these two lines are the whole contract.
  const compact = useMediaQuery('(max-width: 639.98px)');
  const modal = config.modal === 'on' || (config.modal === 'compact' && compact);

  const dismissOn = DISMISSALS.filter((d) => config.dismiss[d]);
  const activePreset =
    Object.entries(PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(config))?.[0] ??
    null;

  // The consumer's panel CSS, from the config: --vitrina-panel-size on the axis
  // the side dictates, and the fixed-inset band only when there is a ✕ to
  // reserve it for (a bare padding otherwise, so content never glues to the edge).
  const inset = config.holes.close ? ['64px 20px 24px', '32px 28px 28px'] : ['24px', '24px'];
  const panelCss = config.responsive
    ? `[data-vitrina-root]{--vitrina-panel-size:100%;--vitrina-panel-fixed-inset:${inset[0]};}` +
      `@media (min-width:640px){[data-vitrina-root]{--vitrina-panel-size:${config.size}%;--vitrina-panel-fixed-inset:${inset[1]};}}`
    : `[data-vitrina-root]{--vitrina-panel-size:${config.size}%;--vitrina-panel-fixed-inset:${inset[1]};}`;

  const ink = theme === 'paper' ? '#222' : '#fff';
  const surface = theme === 'paper' ? '#f5f6ee' : '#000';
  const mini = (selected: boolean): CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid currentColor',
    background: selected ? ink : 'transparent',
    color: selected ? surface : ink,
    cursor: 'pointer',
    font: 'inherit',
  });
  const row = (label: string, children: ReactNode) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      <span style={{ opacity: 0.6, minWidth: 96 }}>{label}</span>
      {children}
    </div>
  );
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label key={label} style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <>
      <style>{themeCss(theme)}</style>
      <style>{panelCss}</style>
      {/*
        The config panel lives OUTSIDE the Vitrina root: a fixed sibling in the
        document's own stacking context (z 100, above the flight's 50), taking
        no part in the widget's stacking or hit-testing.
      */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 12,
          maxWidth: 300,
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: ink,
          background: surface,
          border: '1px solid currentColor',
        }}
      >
        {row(
          'preset',
          (Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((name) => (
            <button key={name} type="button" onClick={() => setConfig(PRESETS[name])} style={mini(activePreset === name)}>
              {name}
            </button>
          )),
        )}
        {row(
          'panelSide',
          SIDES.map((s) => (
            <button key={s} type="button" onClick={() => patch({ side: s })} style={mini(config.side === s)}>
              {s}
            </button>
          )),
        )}
        {row(
          '--vitrina-panel-size',
          <>
            <input
              type="range"
              min={25}
              max={100}
              step={5}
              value={config.size}
              onChange={(e) => patch({ size: Number(e.target.value) })}
            />
            <span>{config.size}%</span>
            {check('100% <640px', config.responsive, (v) => patch({ responsive: v }))}
          </>,
        )}
        {row(
          'besidePlacement',
          (['start', 'end'] as const).map((p) => (
            <button key={p} type="button" onClick={() => patch({ beside: p })} style={mini(config.beside === p)}>
              {p}
            </button>
          )),
        )}
        {row(
          'modal',
          (['off', 'on', 'compact'] as const).map((m) => (
            <button key={m} type="button" onClick={() => patch({ modal: m })} style={mini(config.modal === m)}>
              {m === 'compact' ? '<640px' : m}
            </button>
          )),
        )}
        {row(
          'dismissOn',
          DISMISSALS.map((d) =>
            check(d, config.dismiss[d], (v) => patch({ dismiss: { ...config.dismiss, [d]: v } })),
          ),
        )}
        {row(
          'holes',
          HOLES.map((h) =>
            check(h, config.holes[h], (v) => patch({ holes: { ...config.holes, [h]: v } })),
          ),
        )}
        {row(
          'openCollision',
          (['serialize', 'crossfade'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setCollision(mode)} style={mini(collision === mode)}>
              {mode}
            </button>
          )),
        )}
        {row(
          'theme',
          (['paper', 'void'] as const).map((name) => (
            <button key={name} type="button" onClick={() => setTheme(name)} style={mini(theme === name)}>
              {name}
            </button>
          )),
        )}
        {row(
          'motion',
          <button type="button" onClick={() => setSlow((s) => !s)} style={mini(slow)}>
            2s flight
          </button>,
        )}
        {row(
          'content',
          (['img', 'emoji'] as const).map((c) => (
            <button key={c} type="button" onClick={() => setContent(c)} style={mini(content === c)}>
              {c}
            </button>
          )),
        )}
      </div>
      <Vitrina
        key={slow ? 'slow' : 'normal'}
        entities={entities}
        labels={labels}
        openCollision={collision}
        panelSide={config.side}
        besidePlacement={config.beside}
        modal={modal}
        dismissOn={dismissOn}
        style={{
          height: '100dvh',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          fontFamily: 'system-ui, sans-serif',
          // Read once at the mount the `key` above forces: the whole
          // choreography in deliberate slow motion.
          ...(slow
            ? ({ '--vitrina-dur-flight': '2s', '--vitrina-dur-panel': '1.5s' } as CSSProperties)
            : {}),
        }}
        renderAbove={config.holes.above ? renderAbove : undefined}
        renderBeside={config.holes.beside ? renderBeside : undefined}
        renderDetail={config.holes.detail ? renderDetail : undefined}
        renderBelow={config.holes.below ? renderBelow : undefined}
        renderClose={config.holes.close ? renderClose : undefined}
        renderObject={(entity) =>
          content === 'img' ? (
            // The real case: an image fills the box (base.css object-fit).
            // draggable={false}: a native image drag would eat the plane's.
            <img src={SHAPES[entity.id]} alt="" draggable={false} style={{ display: 'block' }} />
          ) : (
            // Emoji as text — A/B only; see the SHAPES note (bitmap-font strikes).
            <svg
              viewBox="0 0 100 100"
              width="100%"
              height="100%"
              aria-hidden="true"
              style={{ display: 'block' }}
            >
              <text x="50" y="50" fontSize="82" textAnchor="middle" dominantBaseline="central">
                {(entity.data as Item).glyph}
              </text>
            </svg>
          )
        }
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
