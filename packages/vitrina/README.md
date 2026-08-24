# vitrina

A React library that renders a finite, draggable plane of cut-out objects — pan with
inertia and elastic edges, discrete zoom, a staggered reveal as objects enter the frame,
a grid view the objects Flip into, and a detail panel one object flies into while the
plane stays alive beside it.

Interaction reference: [Palmer Dinnerware](https://palmer-dinnerware.com). This is an
independent implementation of the interaction pattern; no code, assets, or copy of
theirs were used.

## Install

```sh
npm i vitrina gsap
```

`react`, `react-dom` (≥18) and `gsap` (≥3.13) are peer dependencies — see
[why GSAP is a peer](#why-gsap-is-a-peer-dependency).

## Quick start

Three lines — what exists, what to call it, how to draw it — plus a real height:
the widget fills its container, and an unsized container is an invisible widget.

```tsx
import { Vitrina } from 'vitrina';
import type { VitrinaEntity, VitrinaLabels } from 'vitrina';
import 'vitrina/styles.css'; // required: structure, stacking, focus geometry
import 'vitrina/themes/paper.css'; // exactly one theme

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
      renderObject={(e) => <span>{String(e.data)}</span>}
      style={{ height: '100dvh' }}
    />
  );
}
```

Every user-visible string arrives through `labels` — the library ships no copy and no
default language, and renders those strings as aria-labels only.

## What `renderObject` receives

Whatever `renderObject` returns lands in a **ready-sized, centred box** — and the same
box in every place a copy of the object appears: the plane instance, the grid card, the
panel's slot, the flying copy. You never size the box; you fill it.

- **An image (or inline SVG) fills it on its own** — `width`/`height: 100%` with
  `object-fit: contain`, so the aspect is kept. This is the intended case: a cut-out
  PNG with real transparency, so the theme's `drop-shadow` follows the silhouette.
- **Any other content is centred and capped** to the box (`max-width`/`max-height:
  100%` on the direct child).
- **Text or emoji content needs a type size** — a box cannot tell type how big to be.
  The box is a CSS size container and `--vitrina-object-font-size` (default `60cqmin`,
  60% of the box's smaller side) is applied to the direct child; retune the token on
  `[data-vitrina-root]` rather than styling the child by hand.
- The box paints **no surface of its own** — no background, no native button face. Give
  your content a background and the shadow wraps that rectangle instead of the cut-out;
  leave it transparent.

## Two datasets, the same three lines

The library never looks inside `entity.data`; it hands it back to your render props
verbatim. Whatever `renderObject` returns is the cut-out. Images:

```tsx
type Mineral = { src: string; name: string };
const minerals: VitrinaEntity[] = [
  { id: 'quartz', data: { src: '/minerals/quartz.png', name: 'Quartz' } },
  { id: 'fluorite', data: { src: '/minerals/fluorite.png', name: 'Fluorite' } },
  // … at least 8 — see “How many entities”
];

<Vitrina
  entities={minerals}
  labels={{ ...labels, objectLabel: (e) => (e.data as Mineral).name }}
  renderObject={(e) => <img src={(e.data as Mineral).src} alt="" draggable={false} />}
/>;
```

Plain text:

```tsx
const emoji: VitrinaEntity[] = ['🌋', '🪐', '🦑', '🌵', '🎈', '🪞', '🧊', '🐚'].map(
  (glyph) => ({ id: glyph, data: glyph }),
);

<Vitrina
  entities={emoji}
  labels={labels}
  renderObject={(e) => <span>{String(e.data)}</span>}
/>;
```

The glyph takes its size from the box (`--vitrina-object-font-size`); the images fill
theirs. Neither render prop mentions a dimension.

Entities are **what exists**; instances are **where copies appear**. Each entity is
repeated across the plane (a plane with 15 objects reads as empty), deterministically
from `layout.seed` — same seed, same plane, on the server and on every client. The
detail panel keys off the entity, so every copy opens the same thing.

## Props

| Prop               | Type                                             | Default             | What it does                                                                                                                                    |
| ------------------ | ------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`         | `VitrinaEntity[]`                                | required            | What exists: `{ id, size?, data? }`. `size` is the reference diameter at zoom 1; `data` is yours, handed back verbatim. Duplicate ids throw.     |
| `renderObject`     | `(entity, ctx) => ReactNode`                     | required            | The object itself, called once per instance. `ctx`: `{ instanceId, isActive, isRevealed, view }`. Must be pure and cheap.                        |
| `labels`           | `VitrinaLabels`                                  | required            | Every user-visible string (see below). Rendered as aria-labels; the one visible use is `<VitrinaControls>`' button text.                         |
| `renderDetail`     | `(entity, ctx) => ReactNode`                     | —                   | The detail panel's content. `ctx`: `{ close(), next(), prev(), view }`. The library owns the shell and the flight, renders nothing else inside.  |
| `instances`        | `VitrinaInstance[]`                              | generated           | Provide to skip generation entirely (e.g. precomputed with `generateInstances`).                                                                 |
| `layout`           | `VitrinaLayout`                                  | measured defaults   | World size, instance count, columns, base size, jitter, separation, `seed`, compact breakpoint. Omitted fields fall back to the defaults.        |
| `activeId`         | `string \| null`                                 | —                   | Controlled active entity. Omit for uncontrolled.                                                                                                 |
| `defaultActiveId`  | `string \| null`                                 | `null`              | Initial active entity (uncontrolled). Mounts the panel open, settled, no flight — and steals no focus.                                           |
| `onActiveChange`   | `(id: string \| null) => void`                   | —                   | Fires on open/close/switch, controlled or not.                                                                                                   |
| `openCollision`    | `'serialize' \| 'crossfade'`                     | `'serialize'`       | Opening B with A open: `serialize` flies A home first, then B in; `crossfade` runs both at once on two layers.                                   |
| `view`             | `'plane' \| 'grid'`                              | —                   | Controlled view. Omit for uncontrolled.                                                                                                          |
| `defaultView`      | `'plane' \| 'grid'`                              | `'plane'`           | Initial view (uncontrolled).                                                                                                                     |
| `onViewChange`     | `(view) => void`                                 | —                   | Fires on every toggle.                                                                                                                           |
| `zoomSteps`        | `number[]`                                       | `[0.75, 1, 1.25]`   | The discrete zoom scales.                                                                                                                        |
| `defaultZoomIndex` | `number`                                         | `1`                 | Which step is the resting state.                                                                                                                 |
| `reducedMotion`    | `'respect' \| 'grid' \| 'ignore'`                | `'respect'`         | What the OS preference means — see “Reduced motion”.                                                                                             |
| `className`        | `string`                                         | —                   | On the root.                                                                                                                                     |
| `style`            | `CSSProperties`                                  | —                   | On the root.                                                                                                                                     |
| `children`         | `ReactNode`                                      | —                   | Optional chrome, rendered inside the root — the subtree where `useVitrina()` resolves.                                                           |

`VitrinaLabels`: `viewport` (aria-label of the plane region), `grid` (optional, falls
back to `viewport`), `objectLabel(entity)` (accessible name of each object button),
`closeDetail`, `zoomIn`, `zoomOut`, `toGrid`, `toPlane`.

Also exported: `useVitrina()` (the full API for your own chrome: zoom state and
transitions, view, `openDetail`/`closeDetail`, `detailPhase`, `viewLocked`, the
`labels` passed through), `<VitrinaControls>` (below), `generateInstances(entities,
resolveLayout(layout))` and `resolveLayout`/`DEFAULT_LAYOUT` — generation is a feature,
not an internal: precompute instances at build time and pass them via `instances`.

## Styles and themes

Two imports: the structural stylesheet (required) and exactly one theme.

```ts
import 'vitrina/styles.css'; // REQUIRED: layers, stacking, overflow, focus geometry
import 'vitrina/themes/paper.css'; // the factory default — or vitrina/themes/void.css
```

`styles.css` (base) owns the mechanic's structure and carries **no color**; without it
the plane does not clip, stack, or scroll correctly. A theme is custom properties on
`[data-vitrina-root]` plus the paint that consumes them — `paper` is a light plane with
a dark diffuse shadow under each object, `void` is near-black with a halo of light
instead. Both define the same token set, so swapping themes is a one-line change; your
own theme is the same file shape with your values.

### Your own theme (Tailwind 4 example)

The token set is: `--vitrina-page`, `--vitrina-ink`, `--vitrina-muted`,
`--vitrina-focus`, `--vitrina-panel-surface`, `--vitrina-seam`,
`--vitrina-object-shadow`. With a shipped theme imported, override the tokens alone.
Without one, a theme is tokens **plus the paint** — with Tailwind 4's CSS-first theme
variables:

```css
@import 'tailwindcss';
@import 'vitrina/styles.css';

[data-vitrina-root] {
  color: var(--vitrina-ink);
  --vitrina-page: var(--color-stone-100);
  --vitrina-ink: var(--color-stone-900);
  --vitrina-muted: var(--color-stone-400);
  --vitrina-focus: var(--color-stone-900);
  --vitrina-panel-surface: var(--color-stone-100);
  --vitrina-seam: var(--color-stone-400);
  /* The COMPLETE filter value in ONE token — composing drop-shadow() lists across
     several tokens is how shadows silently die. */
  --vitrina-object-shadow: drop-shadow(0 18px 32px rgb(0 0 0 / 0.25));
}

[data-vitrina-viewport],
[data-vitrina-grid] {
  background: var(--vitrina-page);
  color: var(--vitrina-ink);
}

/* Every copy of an object gets the same treatment — the plane instance, the grid
   card, the panel slot, and both flying visuals — so nothing changes weight
   mid-flight. drop-shadow follows the cut-out alpha, not the box. */
[data-vitrina-object],
[data-vitrina-slot],
[data-vitrina-flight],
[data-vitrina-relay] {
  filter: var(--vitrina-object-shadow);
}

[data-vitrina-panel-card] {
  background: var(--vitrina-panel-surface);
  color: var(--vitrina-ink);
  border-left: 1px solid var(--vitrina-seam);
}
```

Every element the library renders carries a `data-vitrina-*` attribute; there are no
class names to collide with and nothing to configure in `tailwind.config`.

**Motion tokens** live on `[data-vitrina-root]` and are read **once at mount** with one
`getComputedStyle` call — never per frame. Retuning one applies on the next mount.

| Token                         | Drives                                              | Default        |
| ----------------------------- | --------------------------------------------------- | -------------- |
| `--vitrina-dur-micro`         | the wheel chase                                     | `0.16s`        |
| `--vitrina-dur-ui`            | one zoom step (and its pan re-clamp)                | `0.32s`        |
| `--vitrina-dur-flight`        | the detail flight                                   | `0.6s`         |
| `--vitrina-dur-panel`         | the panel wipe, each content line, the height tween | `0.45s`        |
| `--vitrina-ease-micro`        | the wheel chase (a GSAP ease string)                | `power3.out`   |
| `--vitrina-ease-flight`       | the flights and the view Flip (a GSAP ease string)  | `power3.inOut` |
| `--vitrina-stagger-line`      | gap between content-line entrances                  | `0.07s`        |
| `--vitrina-stagger-line-exit` | the tighter exit gap                                | `0.04s`        |

The ease tokens hold **GSAP ease strings**, not CSS timing functions — they drive
tweens. The panel wipe's own curves stay CSS (`--vitrina-panel-ease-in`/`-out`). Layout
knobs (`--vitrina-grid-cell`, `--vitrina-grid-gap`, `--vitrina-detail-object`,
`--vitrina-panel-width`, `--vitrina-object-font-size`) are ordinary custom properties a
theme may retune under media queries.

## Controls

The library renders no chrome on its own. `useVitrina()` exposes the state and
transitions to build yours; `<VitrinaControls>` is the unstyled convenience on top —
three buttons (zoom out, zoom in, view toggle) whose text comes from your `labels`,
each carrying a `data-vitrina-*` attribute to style and position. It renders nothing
when the view is locked (see below). Mount it as a child of `<Vitrina>`.

## Detail content entrance (`data-vitrina-line`)

The detail panel's content is yours (`renderDetail`), so the library cannot animate
markup whose structure it does not know. Mark the blocks you want choreographed with
`data-vitrina-line`:

```tsx
renderDetail={(entity) => (
  <article>
    <h2 data-vitrina-line>…</h2>
    <p data-vitrina-line>…</p>
    <footer data-vitrina-line>…</footer>
  </article>
)}
```

- **Open:** the card is uncovered first; then the lines enter staggered (opacity plus a
  short rise), in document order, while the object flies in alongside — the text never
  waits for the landing.
- **Switching objects with the panel open** re-runs the entrance for the new content;
  the panel itself does not move, and the content is never remounted (no `key`), so a
  crossfade you run on it survives.
- **Close** plays the same animation mirrored — inverted order, a tighter step, since
  its only job is avoiding a flat blink — and the panel unmounts only when the last
  line has finished.
- No `data-vitrina-line` anywhere → no content animation; nothing else changes.

The steps are the custom properties `--vitrina-stagger-line` (default 70 ms) and
`--vitrina-stagger-line-exit` (default 40 ms) on `[data-vitrina-root]`; each line's own
duration follows the panel's `--vitrina-dur-panel`.

## Reduced motion

The `reducedMotion` prop arbitrates what the OS preference means:

- `'respect'` (default): no intro, no pops, no inertia, no staggers — objects simply
  appear; drag, wheel, zoom and the panel keep working.
- `'grid'`: additionally lock the view to the grid — no toggle, no zoom.
  `api.viewLocked` tells chrome to hide both (`<VitrinaControls>` already does).
- `'ignore'`: animate regardless; that accessibility decision is yours.

Tab order is identical in all three modes — focus is not decoration. The stylesheet
follows the same arbitration: base.css keys its reduced rules on the
`data-vitrina-reduced` attribute the root stamps, never on the media query.

## Smooth-scroll libraries

The plane's viewport carries `data-lenis-prevent` unconditionally.
[Lenis](https://github.com/darkroomengineering/lenis) decides whether to take over a
wheel event by walking `composedPath()` — it ignores `defaultPrevented` — so without
the attribute a page running Lenis swallows every trackpad pan over the plane. With no
Lenis on the page the attribute is inert. Other smooth-scroll libraries need whatever
their own exclusion mechanism is, aimed at `[data-vitrina-viewport]`.

## How many entities

The generator balances unconditionally (instance counts per entity never differ by more
than one) and keeps copies of the same entity apart — full separation for roughly 15
entities and up on the default layout, and even below that adjacent duplicates are
repaired away. It never throws on hard input: 3 entities across 114 instances render
fine. But below **~8 entities** the plane starts reading as wallpaper — repetition
becomes the texture instead of the discovery. Recommendation, not a limit.

## Server rendering

No `window`, `document`, or `matchMedia` is touched at module scope — `renderToString`
works in plain Node. The server emits every object at its generated position, plain and
untransformed; the client hydrates and takes over pan, zoom, and reveal. Positions are
deterministic from `layout.seed` (no `Math.random()` anywhere), so the server and the
client generate the same plane and hydration matches.

## Why GSAP is a peer dependency

GSAP is free — including for commercial use — but it is **not MIT-licensed**. Bundling
it would ship GSAP's code inside this package's MIT grant, a conflict; as a peer
dependency you install it directly and its license applies to it on its own terms. The
peer range is `>=3.13`, the release where every plugin (including the formerly paid
ones) became public. Only the GSAP core is imported statically; the plugins the
mechanic uses (`Draggable`, `InertiaPlugin`, `Flip`, `Observer`) load via dynamic
`import()` inside an effect — nothing GSAP-related runs on the server, and ~21 KB gzip
stays off the critical path.

## Credits

The interaction pattern — the finite draggable plane, the reveal, the grid toggle, the
detail flight — is referenced from
[Palmer Dinnerware](https://palmer-dinnerware.com), whose site is its finest
expression. This library is an independent implementation: no code, no assets, and no
copy from that site were used. Measured values used as defaults (world size, instance
count, reveal rhythm) are noted as such in the source.

## License

MIT. GSAP is licensed separately under [its own terms](https://gsap.com/licensing/) —
see the peer-dependency note above.
