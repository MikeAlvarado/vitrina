# vitrina

A React library that renders a finite, draggable plane of cut-out objects — pan with
inertia and elastic edges, discrete zoom, a staggered reveal, a grid view, and a detail
flight that keeps the plane alive beside it.

Interaction reference: [Palmer Dinnerware](https://palmer-dinnerware.com). This is an
independent implementation; no code, assets, or copy of theirs were used.

**Status: pre-release, under construction.** The deterministic instance generator and the
public types exist; the plane itself does not yet. The full README (install, examples,
prop table, theming) lands with the first publishable build.

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
