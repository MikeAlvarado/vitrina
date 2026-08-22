# vitrina — working rules

React library: a finite, draggable plane of cut-out objects (pan, zoom, reveal, grid
view, detail flight). Interaction reference is palmer-dinnerware.com; the mechanic was
previously proven in a private repo (Mediterra). The constants and gotchas below are
transcribed from that working implementation — each one cost a real bug. Treat them as
requirements, not suggestions.

## Naming

The name appears only as: npm package `vitrina`, CSS vars `--vitrina-*`, data attributes
`data-vitrina-*`, root component `<Vitrina>`. Never bake the name into prose that would
need rewriting on a rename — a rename must stay a single find-and-replace.

## Hard rules

- **The library owns the mechanic, never the content.** No product data, no copy, no
  strings, no domain concepts in `src/`. A field named `price`/`name`/`descriptor` in a
  library type is a bug. All user-visible strings arrive via the `labels` prop
  (aria-labels only — the library renders no visible text).
- **Entities vs instances.** Entities are what exists; instances are where copies appear.
  The detail panel keys off `entityId`; instance ids follow `${entityId}-${n}`.
- **`Math.random()` anywhere in `src/` is a bug.** All randomness flows from the seeded
  PRNG in `src/layout/rng.ts` (xmur3 + mulberry32). Otherwise SSR and hydrate generate
  different planes → hydration mismatch (this bit Mediterra once).
- **Chrome is opt-in.** The library renders no buttons. State is exposed via
  `useVitrina()`; `<VitrinaControls>` is an unstyled convenience on top.
- **`src/index.ts` is the entire public surface.** Not exported there = free to refactor.
- **No Tailwind anywhere in the library.** Compiled CSS only; every element carries a
  `data-vitrina-*` attribute; themes are CSS custom properties on `[data-vitrina-root]`.
- **GSAP is a peer dependency, never bundled** (licence conflict with MIT otherwise).
  Plugins (`Draggable`, `InertiaPlugin`, `Flip`, `Observer`) load via dynamic `import()`
  inside an effect — SSR requirement and keeps ~21 KB gzip off the critical path.
- **SSR-safe:** no `window`/`document`/`matchMedia` at module scope. Server renders
  objects at generated positions, plain; client takes over on hydrate.
- Modules marked PURE (`layout/generate.ts`, `layout/rng.ts`, `plane/geometry.ts`,
  `plane/reveal.ts`) import nothing from React, GSAP, or the DOM. They get the
  exhaustive unit tests.

## The mechanic — non-negotiable details (§6 of the build brief)

- **Two nested transform layers.** Zoom layer = viewport-sized, `transform-origin:
center`, `scale` only. Pan layer inside it = world-sized, `translate` only. With the
  origin at viewport centre, zoom needs **no pan compensation**. A world point at `wx`
  paints at `(wx + panX − viewW/2) · zoom + viewW/2`; bounds and visibility derive from
  that analytically. **Zero `getBoundingClientRect()` per frame.**
- **Draggable: `trigger` (the viewport, never moves) ≠ `target` (the pan layer).** Same
  node for both eventually translates out of the viewport and stops receiving
  `pointerdown` — a dead zone that forced a redesign once. `minimumMovement: 5`,
  `zIndexBoost: false`, `edgeResistance: 0.8`, inertia off under reduced motion.
- **Wheel:** GSAP `Observer` (`type: 'wheel'`, `preventDefault: true`, `wheelSpeed: 1.6`)
  writes a target that `gsap.quickTo` chases. Divide deltas by zoom (screen px → world
  units). Both axes sync pan in their own `onUpdate` — a horizontal gesture never ticks
  the y tween. Put `data-lenis-prevent` on the viewport unconditionally (Lenis walks
  `composedPath()`, ignores `defaultPrevented`; the attribute is inert without Lenis).
- **Visibility is one analytic pass** answering two questions: tab order (off-frame and
  unrevealed objects are not focusable — native scroll-into-view would set a real
  `scrollLeft` on the `overflow: hidden` viewport, outside GSAP's transform) and reveal
  (objects whose **centre** newly enters the viewport inset by `REVEAL_INSET`). Write
  attributes only on change, never every frame. This pass lives **outside** any
  `matchMedia` branch — focus behaves identically under reduced motion.
- **Reveal:** unrevealed = `opacity: 0` **and** `pointer-events: none` (invisible but
  clickable opens a panel from empty plane). Scale 0.6 → 1; gap between pops seeded
  random 30–80 ms (a fixed step reads as a mechanical wave). Revealed is permanent,
  survives the grid toggle.
- **Detail flight is an explicit state machine** `idle → opening → open → closing →
idle`; exactly one visible copy of the active object at any moment. `Flip` moves it.
  The plane stays interactive on the other half — no overlay, no focus trap. Escape
  closes; focus returns to the originating button. Programmatic `.focus()` fires
  `:focus-visible` in Chrome, so object buttons need `outline: none` + a deliberate
  `:focus-visible` ring.

## GSAP lifecycle gotchas (§6.7)

- `useGsapContext(fn, scopeRef, deps)` wraps `gsap.context`, reverts on cleanup.
- `gsap.context(fn)` runs `fn` **during construction** — referencing `const ctx = ...`
  inside it is a temporal-dead-zone `ReferenceError` that passes lint/typecheck/build and
  fails only at hydration. Use the `self` argument.
- `ctx.add()` with the _outer_ context from inside a `matchMedia` branch creates a cycle
  and blows the stack. Use the context the branch receives.
- `gsap.from`/`fromTo` defer initial state to end of tick — `lazy: false` where it matters.
- Measure in its own layout effect, before and outside the GSAP context; geometry in
  state **and** a ref. The reveal/intro context depends on a boolean `measured`, **never
  on the geometry object** — the ResizeObserver's second measurement would recreate the
  context and its `revert()` kills the intro mid-flight with no console error. Read
  geometry from the ref inside.

## Measured constants (defaults in `src/defaults.ts`)

| Token                             | Value                            | Source                                               |
| --------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `world`                           | 4645 × 3044                      | measured on Palmer                                   |
| `compactWorld`                    | 2200 × 3000                      | Mediterra, mobile                                    |
| `compactBreakpoint`               | 640                              |                                                      |
| `count` / `columns`               | 114 / 14                         | measured on Palmer                                   |
| grid cell / step                  | 240 px cell, ~320 px step        | measured on Palmer                                   |
| `baseSize`                        | 190                              |                                                      |
| `sizeJitter` / `minSeparation`    | 0.15 / 2                         |                                                      |
| `compactSizeFactor`               | 0.62                             | Mediterra                                            |
| `zoomSteps`                       | [0.75, 1, 1.25], resting index 1 |                                                      |
| intro scale / reveal scale        | 0.5 / 0.6                        | measured on Palmer                                   |
| `edgeResistance` / drag threshold | 0.8 / 5 px                       |                                                      |
| `wheelSpeed`                      | 1.6                              | tuned after a real "trackpad pans too slowly" report |
| reveal gap                        | 30–80 ms, seeded random          | measured on Palmer                                   |
| `REVEAL_INSET`                    | 0.12 of viewport                 |                                                      |

## Generator invariants (`src/layout/generate.ts`)

Three phases, all deterministic from one seed:

1. **Assign** — least-used entity per cell, cells walked in seeded-shuffled order (a
   row-major walk puts consecutive uses of one entity in adjacent cells by
   construction). A cell whose least-used pool all conflict is _deferred_ (requeued,
   bounded) so the pool can rotate; only after deferrals exhaust does the separation
   radius relax toward 0.
2. **Repair** — deterministic swap pass (no RNG): exchange two cells' entities when
   that removes a separation violation without creating one; cascaded down through
   smaller radii so that even when full separation is unsatisfiable, _adjacent_
   duplicates never survive (empirically zero down to 8 entities).
3. **Materialize** — positions (stagger + jitter, clamped to world), sizes
   (`entity.size ?? baseSize` × 1±jitter), ids `${entityId}-${n}`, in row-major order.

Invariants: `max(uses) − min(uses) ≤ 1` unconditionally (balance beats separation);
never throws on unsatisfiable input (3 entities × 114 instances must render); zero
separation violations for ≥15 entities on the default grid (tested over many seeds).
With 8 entities, ~14 copies each is AT the packing bound for radius 2 — below ~8 the
plane reads as wallpaper (README recommendation, not an error). Duplicate entity ids
throw a TypeError.

## Geometry invariants (`src/plane/geometry.ts`, `src/plane/reveal.ts`)

Everything derives from `screen = (w + pan − view/2) · zoom + view/2` (§6.1). Key
properties, all tested: the world point under the viewport centre is zoom-invariant
(this is why zoom needs no pan compensation); `centerPan` is the midpoint of
`panBounds` at every zoom; when the scaled world cannot cover an axis, that axis's
bounds collapse to the centering pan (world sits centred, undraggable along it);
degenerate inputs (zero viewport, zoom ≤ 0) return finite/empty results, never NaN.
`instanceVisible` is strict (zero visible pixels ≠ focusable); `centreInside` is
inclusive and tests the CENTRE against the inset frame (born-whole rule). `framePass`
is the §6.4 single pass: `focusable` = revealed ∩ rect-overlaps-frame, `entering` =
unrevealed ∩ centre-in-inset-frame, input order preserved; callers union `entering`
into their revealed set (permanence lives in the caller's set, the pass never
re-emits a revealed id). `staggerDelays` starts at 0 with seeded gaps in [30, 80) ms.

## Testing

- Pure modules: exhaustive, no DOM. Boundary cases explicitly (zero entities, one
  entity, count < entity count, tiny world, zoom extremes, negative pan, zero viewport).
- **Teardown test** (from step 4 on): after mount+unmount assert nothing survives —
  tweens on `globalTimeline`, ScrollTrigger, Observer, Draggable (ask element by
  element; there is no global list). Two disciplines: (1) assert mounting _created_
  something first; (2) filter `globalTimeline` to tweens whose targets are `Element`s —
  ScrollTrigger parks two internal `delayedCall`s (function targets) there forever.
- SSR test: `renderToString` in Node; no throw; objects present in markup.
- **Only verifiable in a real browser on `pnpm preview`, never in an automated tab**
  (frozen rAF, stale `getBoundingClientRect`): drag/trackpad feel, edge elasticity,
  reveal rhythm, the flight, >1900 px viewports, real mobile, banding on pure black
  (if visible, lift `--vitrina-page` to `#08080A`), perf at full instance count. Say
  when something needs this check; do not pretend a test covered it.

## Licensing

Library is MIT. GSAP: free for commercial use but not MIT; peer dep keeps the grant
clean. Its licence bars no-code visual animation builders — the demo's config panel must
stay sliders-setting-props, never an exporting editor. Demo assets: verify rights **per
record** (Smithsonian is not blanket CC0); every asset gets a `CREDITS.md` entry.

## Commands

`pnpm check` = lint + typecheck + test + build (root). Per-package: `pnpm -C
packages/vitrina test|typecheck|build`.

## Status (order of work, §11)

- [x] 1. Scaffold + types + `generateInstances` + tests — determinism proven over 100 runs
- [x] 2. `geometry.ts` + `reveal.ts` + boundary tests — §10 cases enumerated per file
- [ ] 3. `<Vitrina>` + `<Plane>`: layers, drag, wheel, zoom, bounds (browser check)
- [ ] 4. Reveal + tab order + teardown test
- [ ] 5. Grid view + Flip toggle
- [ ] 6. Detail panel + flight state machine
- [ ] 7. Themes, `base.css`, `<VitrinaControls>`, reduced-motion paths
     (note: `package.json` exports already reference `dist/*.css` — the build must copy
     styles from step 7 on, and `npm pack` is not truthful until then)
- [ ] 8. Build config, exports map, SSR test, README; `npm pack` → install tarball into
     scratch Vite app **before** writing the demo
- [ ] 9. `apps/demo` (Vite + React + TS, void theme, minerals + emoji datasets)

## reference/

Contiene implementaciones previas de esta mecánica, de otro proyecto. **Solo lectura.**

- Consúltalas SOLO cuando este archivo o el prompt te dirijan explícitamente a un archivo concreto.
- Úsalas para entender comportamiento, timing y configuración de plugins.
- NO copies estructura, nombres, tipos, clases de Tailwind ni strings.
- Ningún archivo de src/ importa nada de reference/. reference/ está en .gitignore.
