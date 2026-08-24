# vitrina

A React library that renders a finite, draggable plane of cut-out objects — pan with
inertia and elastic edges, discrete zoom, a staggered reveal, a grid view, and a detail
flight that keeps the plane alive beside it.

Interaction reference: [Palmer Dinnerware](https://palmer-dinnerware.com). This is an
independent implementation; no code, assets, or copy of theirs were used.

**Status: pre-release, under construction.** The deterministic instance generator and the
public types exist; the plane itself does not yet. The full README (install, examples,
prop table, theming) lands with the first publishable build.

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

**Motion tokens** live on `[data-vitrina-root]` and are read **once at mount** with one
`getComputedStyle` call — never per frame. Retuning one applies on the next mount.

| Token | Drives | Default |
| --- | --- | --- |
| `--vitrina-dur-micro` | the wheel chase | `0.16s` |
| `--vitrina-dur-ui` | one zoom step (and its pan re-clamp) | `0.32s` |
| `--vitrina-dur-flight` | the detail flight | `0.6s` |
| `--vitrina-dur-panel` | the panel wipe, each content line, the height tween | `0.45s` |
| `--vitrina-ease-micro` | the wheel chase (a GSAP ease string) | `power3.out` |
| `--vitrina-ease-flight` | the flights and the view Flip (a GSAP ease string) | `power3.inOut` |
| `--vitrina-stagger-line` | gap between content-line entrances | `0.07s` |
| `--vitrina-stagger-line-exit` | the tighter exit gap | `0.04s` |

The ease tokens hold **GSAP ease strings**, not CSS timing functions — they drive
tweens. The panel wipe's own curves stay CSS (`--vitrina-panel-ease-in`/`-out`). Layout
knobs (`--vitrina-grid-cell`, `--vitrina-grid-gap`, `--vitrina-detail-object`,
`--vitrina-panel-width`) are ordinary custom properties a theme may retune under media
queries.

## Controls

The library renders no chrome on its own. `useVitrina()` exposes the state and
transitions to build yours; `<VitrinaControls>` is the unstyled convenience on top —
three buttons (zoom out, zoom in, view toggle) whose text comes from your `labels`,
each carrying a `data-vitrina-*` attribute to style and position. It renders nothing
when the view is locked (see below). Mount it as a child of `<Vitrina>`.

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
