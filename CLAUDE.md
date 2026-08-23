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
  `plane/reveal.ts`, `detail/machine.ts`) import nothing from React, GSAP, or the DOM.
  They get the exhaustive unit tests.

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
- **The detail is TWO decoupled lifecycles.** The PANEL is the container for "there is
  something active": uncovered once, covered once, unmoved while the active object
  changes. The state machine governs the OBJECT, not the panel. Exactly one visible copy
  of the active object at any moment; the plane stays interactive on the other half — no
  overlay, no focus trap. Escape closes; focus returns to the originating button.
  Programmatic `.focus()` fires `:focus-visible` in Chrome, so object buttons need
  `outline: none` + a deliberate `:focus-visible` ring.

## Grid view (step 5)

- **One card per entity** — the grid is the list of what exists, not of the 114 copies.
  Each card Flips from the SHOWN instance of its entity closest to the viewport centre
  at toggle time (`pairCards`, exact `data-flip-id` = instance id, never an entity
  prefix); entities with nothing shown fade in. Going back, cards fly to that same
  instance; cards whose instance is not shown just vanish. Objects not paired to a card
  are removed instantly — they are not in the DOM to fade.
- The grid container declares BOTH overflow axes (`overflow-y: auto; overflow-x:
  hidden`) and `scrollbar-gutter: stable`: leaving x unset couples it to y, which makes
  the container a valid horizontal scroller that any scroll-into-view can hand a real
  `scrollLeft`. During a flight `overflow-y` is clipped too — a transformed card extends
  the scrollable area and flickers the scrollbar.
- Cell/gap are `--vitrina-grid-cell` / `--vitrina-grid-gap` (240 / 80 defaults) so a theme
  can retune them under media queries; inline styles cannot.
- `labels.grid` is optional and falls back to `labels.viewport` — adding a required
  label would have broken every existing consumer's `labels` object.
- `reducedMotion: 'grid'` locks only when the visitor prefers reduced motion;
  `viewLocked` on the API tells chrome to hide the toggle and the zoom (all no-ops).

## Detail flight (step 6)

- **Two decoupled lifecycles in `src/detail/machine.ts` (PURE).** The PANEL:
  `closed → open → covering → closed`, uncovered ONCE and covered ONCE and still in
  between. The OBJECT (the machine's `flight`): `waiting → in → shown → out`. Coupling
  them was the characteristic bug — switching A→B re-covered and re-revealed the panel;
  now `open → open` never leaves `panel: 'open'`. `activeCopy(state)` is the ONE place
  that decides which copy of the active object shows (`plane` while waiting/home,
  `flight` while in/out, `panel` while shown); the hidden `Set` (`hiddenInstancesOf`),
  the slot's visibility and both visuals' visibility all derive from it in one commit.
- **Open and close are EXACT MIRRORS, and both keep the object above the panel the whole
  time.** The object's five phases pair up around the panel wipe:

  | | open | close |
  |---|---|---|
  | park above panel | `waiting` — over the ORIGIN, while the panel REVEALS | `leaving` — over the SLOT, while the panel COVERS |
  | signal that releases it | `revealed` (after the reveal wipe) | `coverDone` (after the cover wipe) |
  | fly | `in` — origin → slot | `out` — slot → origin |
  | end | `landed` → `shown` | `landed` → `closed` |

  So on **open**: the object is lifted onto the flight layer AT the click (parked over its
  origin, above the panel), the panel wipes open behind it, THEN it flies into the slot.
  On **close** it is the reverse: the object lifts off the slot onto the flight layer
  (parked, above the panel), the panel wipes CLOSED behind it, THEN it flies home to the
  plane and only there loses its z. This is the fix for "on close the object dropped back
  first and lost its z before the panel left" — the close now rewinds the open exactly.
  The whole float+fly is sequenced by the machine (the panel-lifecycle effect fires
  `revealed`/`coverDone` off the wipe's own duration), never by a CSS `animation-delay`.
- **During `leaving`/`out` the panel STAYS `covering`.** `close` from `shown` goes to
  `covering` + `leaving` at once (the panel is already animating closed while the object
  floats); `coverDone` moves `leaving` → `out` but KEEPS `panel: 'covering'` (it will not
  re-run the wipe — the attribute did not change) so `Detail` and the flight visual stay
  mounted for the trip home; `landed` from `out` is what finally reaches `closed`.
  `activeEntity` (hence the whole `Detail` subtree + body portal) is mounted as long as
  `active !== null`, which holds through `out`, so the flight visual never unmounts
  mid-flight.
- **`activeCopy` is driven by the flight phase, so the object holds the flight layer at
  both ends.** `waiting` (first open, has origin, no relay) → `flight`; `in`/`leaving`/
  `out` → `flight`; `shown` → `panel`; a serialize relay's `waiting` stays `plane` (it
  genuinely sits on the plane until the outgoing flies home). The parked clone (a
  `gsap.set` at the origin or slot box, IDENTITY transform, no tween) replaces the hidden
  plane instance — one copy visible throughout, and it is always the one above the panel.
- **The body portal is owned by the orchestrator (`portalReady`), NOT by `Detail`.** The
  orchestrator never unmounts, so the flag flips true once and stays; `Detail` mounts and
  unmounts with the active item, so a flag there would reset to false on every open and
  the flight layer would arrive a frame after the click — the parked clone would have
  nowhere to render and the object would flash behind the panel. `Detail` receives it as
  a prop; the flight effect keys on it so the park re-runs the instant the portal exists.
- **The body portal is owned by the orchestrator (`portalReady`), NOT by `Detail`.** The
  orchestrator never unmounts, so the flag flips true once and stays; `Detail` mounts and
  unmounts with the active item, so a flag there would reset to false on every open and
  the flight layer would arrive a frame after the click — the parked clone would have
  nowhere to render and the object would flash behind the panel. `Detail` receives it as
  a prop; the flight effect keys on it so the park re-runs the instant the portal exists.
- **Landing is a React commit, not a `gsap.set` in `onComplete`.** `onComplete` only
  dispatches; the commit that shows the slot (or un-hides the instance) is the one whose
  effect cleanup reverts the flight context — no blank frame.
- **FLIP by hand, not `Flip.fit`:** two `getBoundingClientRect`s, the box set ONCE to
  the destination's, one tween on x/y/scaleX/scaleY (no layout per frame). `Flip.fit`
  goes through `getGlobalMatrix` and does not run under jsdom, where the geometry is
  tested. Both the active flight and the relay use the same `flyVisual`.
- **React owns `visibility`; GSAP owns opacity/scale/pointer-events.** Neither writes the
  other's, so the reveal context's `revert()` and the hidden origin never collide.
- **Focus returns in a layout effect of the commit the panel closes in** — the same
  commit un-hides the origin, and a `visibility: hidden` element takes no focus. Exact
  instance from the root's registry (never a selector by entity prefix), `preventScroll`
  (the button lives in the `overflow: hidden` viewport), fallback to the root
  (`tabIndex={-1}`) when there is no origin. Focus moves INTO the panel only on the
  closed → open uncover, never on mount (`defaultActiveId` must not steal focus) and
  never on a relay.
- **The click's origin for a controlled `activeId` waits in a ref read during render and
  never cleared there:** StrictMode renders twice; cleared in a layout effect.
- **Draggable swallows the click that follows a drag** (`suppressClickOnDrag`), so an
  object's `onClick` fires only for real clicks; `minimumMovement: 5` separates the two.
- **Stacking scale — tokens in `base.css`, no bare z-index in any component:**
  `--vitrina-z-plane` 10, `--vitrina-z-panel` 40, `--vitrina-z-flight` 50 (gaps for
  consumer chrome above the flight). Who gets which:
  - `--vitrina-z-plane` on the plane VIEWPORT and the grid ROOT — one rung for the whole
    object layer, EVERY object including the active one. The z-index there makes the
    viewport a stacking context, so a dragged object passing under the panel ducks
    behind it. **No object ever carries its own z-index**: the active one is hidden
    (`visibility: hidden`) while its clone flies, never raised a layer.
  - `--vitrina-z-panel` on the panel layer.
  - `--vitrina-z-flight` on BOTH flight layers (active clone AND relay) — above the panel
    in EVERY state, so the flying object never ducks behind a panel still revealing and
    then jumps forward when the wipe ends.
- **The flight layers are PORTALLED to `document.body` (`createPortal`), and this is
  STRUCTURAL, not a z-index tweak.** The plane's two transform layers (zoom + pan) each
  establish a stacking context AND, being transformed, become the *containing block* of
  any `position: fixed` descendant. A flight layer rendered inside the Vitrina root
  therefore resolves `fixed` against a transformed ancestor and competes inside a context
  the panel already outranks — no static z-index can climb out of that. Rendered on
  `body`, outside the root and every transformed ancestor, the flight is a sibling of the
  whole widget: `fixed` resolves against the viewport again.
- **`--vitrina-z-flight` goes on the PORTAL WRAPPER, not on the inner flight layers** —
  this is the node that actually competes against the panel, and getting it wrong put the
  flight *behind* the panel. Why: the panel layer (z = `--vitrina-z-panel`) lives inside
  the root, which is `position: relative` with NO z-index and so creates NO stacking
  context, so the panel emerges into the document's ROOT context at level 40. The portal
  wrapper is `position: fixed` (which always makes a stacking context) on `body`; left at
  `z-index: auto` it joins the root context at level 0 and — by paint order — LOSES to
  the panel's positive z, and a `z-index: 50` on an inner layer can't help because a child
  never escapes its parent's level. So both competitors must sit in the same root context
  and the WRAPPER must carry the higher token: panel 40 < wrapper 50 → the object wins
  from the first frame, before the panel finishes revealing. (Keep the root free of any
  stacking-context trigger — `transform`, `filter`, a `z-index` — or the panel would be
  trapped in the root's context while the portal stayed in body's, and the comparison
  breaks.) The inner flight/relay layers and the flying visuals carry NO z-index, so the
  order also never rides on the momentary z GSAP's Flip stamps during a flip and strips at
  the end.
  - **SSR-safe:** the portal mounts only after the first client effect (a `mounted` flag
    set in `useIsomorphicLayoutEffect`), and renders nothing on the server or the first
    paint. SSR emits the panel alone (inert markup; there is no flight without an
    interaction), and hydration stays in step because the portal is added after the first
    commit, not during render. Verified: `renderToString` emits no `data-vitrina-flight*`,
    and a hydrate of a `defaultActiveId` tree logs zero mismatch warnings.
  - The portal wrapper is stamped `data-vitrina-root` so the stacking tokens and any
    theme custom properties (all scoped to `[data-vitrina-root]`) resolve on `body` too.
- The panel layer stays INSIDE the root; only the flight escapes. All layers are
  `pointer-events: none` except the panel (`auto`): a `pointer-events: none` layer does
  not hand the hit-test to what paints beneath. No overlay — darkening the other half
  eats the pointerdown that starts a drag.
- **Before blaming the stacking, confirm the object ARRIVES.** The Flip destination is the
  slot's measured rect; if the panel opens with no object inside, the bug is the
  destination (a zero/absent slot rect), not the layer. The DOM test lands a flight and
  asserts `slot` ends visible with the object's content and the flight visual hidden.
- The shell renders no close button: `ctx.close()` is the consumer's, Escape is the
  library's. `labels.closeDetail` is for the consumer's control and `<VitrinaControls>`.

### Open collision (`openCollision` prop) — how ONE object is relayed for the next

- Only relevant INSIDE an already-open panel; the panel itself never moves. `relaying`
  is the previous object flying home, always a DIFFERENT entity from the active one, so
  no frame shows two copies of one object.
  - **`serialize`** (default): the outgoing flies home FIRST (`relayLanded`), then the
    new one — which sat `waiting` on the plane, still visible there — flies in. One
    object in flight at a time. A third click replaces the queued one (`state.queued`,
    holds one, never stacks); the object that was only ever waiting stays on the plane.
  - **`crossfade`**: the incoming flies `in` and the outgoing `relays` home AT ONCE, two
    layers. A crossfade only starts from a settled `shown`; opening while still
    flying/relaying parks in `queued` and `drain`s once the slot is clean (relay gone
    AND the active object `shown`).
- The panel's TEXT content crosses on its own: `active` flips to the new entity the
  instant a relay starts, and the content is rendered for `active` and **never keyed by
  id** — a remount would kill any crossfade the consumer runs on the text (the old would
  vanish in the same commit the new arrives). Reset internal state by deriving it from
  the id during render, not with `key`.
- If the panel's height differs between objects, the card's height is TWEENED (measured
  after the content commit, from a ref that survives commits), so it does not jump.
- The plane/grid hide a `Set` of instances (`hiddenInstancesOf`): the active one and the
  relaying one at once.

### Panel entrance (§ the card)

- The card is not slid in, it is uncovered: a `clip-path` wipe from the seam,
  `inset(0 0 0 100%) → inset(0)`. Three nested boxes — panel layer, panel wrapper, card
  — because the mask and the scroll BOTH live on the card, never the wrapper: a
  `clip-path` on the wrapper would cut a sticking-out sibling (a close button over the
  seam) into a crescent, and declaring `overflow-y` couples `overflow-x` to `auto` and
  clips whatever sticks out. Any such chrome is a sibling of the card, inside the wrapper.
- The wipe is CSS keyframes (runs on the commit the card mounts), keyed on
  `data-vitrina-panel-anim` (`reveal`/`cover`/`none`) — set from the PANEL phase, `none`
  on every relay, so switching the active object never re-wipes.
- `src/styles/base.css` exists from this step: the focus rules (native ring suppressed
  with `outline: 2px solid transparent` — `none` vanishes under forced colours too — and
  drawn back on `:focus-visible`, because a programmatic `.focus()` matches it in
  Chrome; both in the stylesheet, an inline `outline: none` would beat the ring), the
  panel wipe keyframes, and the custom properties — the stacking scale
  (`--vitrina-z-plane/panel/flight`) and the motion tokens.
- **All durations/curves come from CSS variables** — `--vitrina-dur-flight`,
  `--vitrina-dur-panel`, the two eases — read at runtime (`readSeconds`) with the
  `defaults.ts` constants as the SSR/jsdom fallback only. No animation numbers in the
  component. Setting `--vitrina-dur-flight` to 2s in devtools plays the whole
  choreography in deliberate slow motion.

## GSAP lifecycle gotchas (§6.7)

- `useGsapContext(fn, scopeRef, deps)` wraps `gsap.context`, reverts on cleanup.
- `gsap.context(fn)` runs `fn` **during construction** — referencing `const ctx = ...`
  inside it is a temporal-dead-zone `ReferenceError` that passes lint/typecheck/build and
  fails only at hydration. Use the `self` argument.
- `ctx.add()` with the _outer_ context from inside a `matchMedia` branch creates a cycle
  and blows the stack. Use the context the branch receives.
- **`otherCtx.add(fn)` called while a different context is under construction nests
  `otherCtx` INTO it** (`prev.data.push(self)` in GSAP's `Context.add`): the next revert of
  the outer one takes every tween of the inner one with it — the zoom context reverting
  every reveal pop, silently. Anything that feeds the reveal context (the visibility pass)
  runs only outside any `gsap.context` setup: after construction, or from tween callbacks.
- `gsap.from`/`fromTo` defer initial state to end of tick — `lazy: false` where it matters.
- **Anything created after an `await` inside an effect needs a cancellation flag.** The
  plugins arrive via dynamic `import()`; whenever the cleanup runs while that promise is
  pending (a resize or reduced-motion flip before the plugins land; StrictMode's double
  mount is the same shape) it finds nothing to kill, and a `gsap.context` reverted then
  cannot revert what did not exist yet — every run that was ever started still creates
  its Draggable/Observer/quickTo tweens when the continuations flush. Pattern:
  `let cancelled = false` at the top of the effect, `true` in the cleanup,
  `if (cancelled) return` right after the await; hold the instances in closure variables
  and kill them explicitly in the cleanup (`drag?.kill()`, `wheel?.kill()`,
  `ctx?.revert()`); `Draggable.get(node)?.kill()` before creating as the safety net (GSAP
  already enforces one Draggable per target — the leak that actually survives is the
  Observer and the tweens). The module-level promise cache only removes duplicate work —
  it does not fix the race. `tests/teardown.test.tsx` pins it: one Draggable, one
  Observer after a StrictMode mount, after resizes racing the import, and nothing at all
  after an unmount that beats the import.
- A reverted reveal context kills the pops still waiting in their stagger and restores
  the plain markup. "Revealed" is therefore the set whose pop has STARTED; ids merely
  queued are unclaimed again on cleanup so the next context pops them (StrictMode's
  double mount would otherwise show the whole intro un-animated).
- **The view hand-off (`src/session.ts`) is captured in a layout-effect cleanup declared
  FIRST in the component**, so it runs before the placement effect's revert strips the
  pan/zoom transforms and before a Flip still in flight is killed — React runs unmount
  cleanups in declaration order, and a deleted subtree's cleanups run while its DOM is
  still attached. The plane captures only if it actually placed itself
  (`placedOnceRef`): StrictMode's simulated unmount comes before that and must not
  overwrite the grid's record. Under StrictMode the first arrival's Flip is reverted, but
  the capture stored the cards mid-flight (at their plane positions), so the second run
  flies the same flight — a record is consumed whatever view wrote it.
- The plane's baseline marks shown nodes (`data-vitrina-revealed`) itself: back from the
  grid the buttons are NEW nodes, and only StrictMode's node reuse ever hid that.
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
- **Teardown test** (`tests/teardown.test.tsx`, jsdom + StrictMode, scaffolding in
  `tests/harness.tsx`): after mount+unmount assert nothing survives —
  tweens on `globalTimeline`, ScrollTrigger, Observer, Draggable (ask element by
  element; there is no global list). Two disciplines: (1) assert mounting _created_
  something first; (2) filter `globalTimeline` to tweens whose targets are `Element`s —
  ScrollTrigger parks two internal `delayedCall`s (function targets) there forever.
- **View test** (`tests/view.test.tsx`): grid markup (one card per entity, no text beyond
  `renderObject`'s, both overflow axes), controlled/uncontrolled toggle, the `'grid'` lock,
  and the round trip: pan and revealed set identical on return, `isRevealed` true from the
  first render back, cards paired by exact shown instance id.
- **Machine test** (`tests/machine.test.ts`, pure): every transition pinned, no-ops return
  the same reference, the panel never re-covers on a swap, the full arc is symmetric
  (`waiting→in→shown` on open mirrored by `leaving→out` on close, the panel `covering`
  across both close phases), and a 20 000-step seeded random walk per collision mode
  asserts the invariant on every reachable state.
- **Detail DOM test** (`tests/detail.test.tsx`): the panel reveals once and covers once
  across A→B→C (the decoupling), the open/close MIRROR (Escape covers the panel FIRST with
  the clone floating above it, THEN the object flies home and lands on the plane — not the
  reverse), one visible copy at every step, the flight's measured
  geometry on the fixed visual, the shell (dialog named by `objectLabel`, no text beyond
  `renderDetail`'s, pointer-events on the layers, scroll+mask on the card not the
  wrapper), the flight portal (on `document.body`, out of the root, `fixed`, removed on
  unmount) and the stacking scale (plane < panel < flight, the flight token on the PORTAL
  WRAPPER — the node that competes against the panel — with the inner layers, flying
  visuals and plane objects all carrying none), Escape + focus back on the EXACT origin,
  reduced motion, controlled
  `activeId`, `openDetail`/next/prev, view change (`detach`), entity removal (`abandon`),
  and both collision modes end to end (A, B, then C mid-sequence → C open, A and B back).
  Motion is hand-driven: `landTimeline()` fires whatever is due on the global timeline
  (the panel's reveal/cover `delayedCall`s live there too), `landUntilSettled` runs to
  rest.
- **Reveal/tab-order DOM test** (`tests/reveal-dom.test.tsx`): the DOM is checked against
  `framePass`'s own prediction at every zoom step — never against hand-picked counts,
  which depend on where 9 objects happen to fall. Motion timing is driven by hand:
  `gsap.globalTimeline.pause()` AFTER mount (a paused ancestor stops `gsap.set` from
  rendering immediately, so never before), then `globalTimeline.time(t)`. Pops created
  during a render are not rendered in that pass — that is what makes a queued batch
  deterministic. `gsap.ticker.sleep()` is useless here: creating a tween wakes it.
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
- [ ] 3. `<Vitrina>` + `<Plane>`: layers, drag, wheel, zoom, bounds — code complete,
     gate green, SSR smoke passed; browser check on `pnpm preview` still pending
- [ ] 4. Reveal + tab order + teardown test — code complete, gate green, DOM tests
     against `framePass`; reveal rhythm / intro feel still need the real-browser check
- [ ] 5. Grid view + Flip toggle — code complete, gate green (`tests/view.test.tsx`,
     teardown across repeated toggles); the flight itself needs the real-browser check
     (the playground has no toggle by design — the demo's controls will)
- [ ] 6. Detail panel + object state machine, panel/object lifecycles DECOUPLED
     (panel uncovers once, covers once, holds still across object swaps), configurable
     open collision (serialize/crossfade), panel entrance wipe, between-objects height
     tween — code complete, gate green (`tests/machine.test.ts`, `tests/detail.test.tsx`
     incl. both collision modes and the reveal-once/cover-once check, teardown extended
     with open/close/relay/unmount-mid-flight); the flight, serialize vs crossfade feel,
     the wipe choreography (`--vitrina-dur-flight` at 2s for slow motion), the height
     tween, the panel beside a live plane and the focus ring need the real-browser check
     (the playground has a `renderDetail` with varying height and a collision toggle).
     Stacking (now that the flight portals to `body`), with `--vitrina-dur-flight` at 2s:
     first confirm the object ARRIVES — the flying copy ends in the panel slot, visible,
     opacity 1 (if the panel opens empty the bug is the Flip destination, not the layer;
     jsdom probe confirms arrival, but the real browser is the check). Then: the flying
     object stays ABOVE the panel from the first frame to the last — open, close, and the
     A→B relay. Watch the OPEN/CLOSE MIRROR: on open the object is above the panel from the
     click and the panel reveals behind it, then it flies in; on CLOSE the panel must cover
     FIRST with the object still floating above it, and only after the panel is gone does
     the object fly home to the plane and lose its z — the close is the open rewound, never
     "object drops back first, then the panel leaves". And with the panel open, dragging
     the plane so an object passes under the panel, that object goes BEHIND it (this is what
     distinguishes "the flight layer is right" from "every object rose"). One visible copy
     of the active object throughout.
     **Reconsider whether crossfade still earns its place:** with the panel now still,
     serialize may feel complete on its own — a real-browser call, per the prompt.
- [ ] 7. Themes, `base.css`, `<VitrinaControls>`, reduced-motion paths
     (note: `package.json` exports already reference `dist/*.css` — `base.css` exists
     since step 6 with the focus rules only and the build copies it; the themes do not,
     so `npm pack` is not truthful until then)
- [ ] 8. Build config, exports map, SSR test, README; `npm pack` → install tarball into
     scratch Vite app **before** writing the demo
- [ ] 9. `apps/demo` (Vite + React + TS, void theme, minerals + emoji datasets)

## reference/

Contiene implementaciones previas de esta mecánica, de otro proyecto. **Solo lectura.**

- Consúltalas SOLO cuando este archivo o el prompt te dirijan explícitamente a un archivo concreto.
- Úsalas para entender comportamiento, timing y configuración de plugins.
- NO copies estructura, nombres, tipos, clases de Tailwind ni strings.
- Ningún archivo de src/ importa nada de reference/. reference/ está en .gitignore.
