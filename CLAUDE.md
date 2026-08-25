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
  library type is a bug. All user-visible strings arrive via the `labels` prop — the
  core renders them as aria-labels only; the ONE place a label renders as visible text
  is `<VitrinaControls>`'s buttons (opt-in chrome, and the words are still the
  consumer's).
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
  clickable opens a panel from empty plane). Scale 0.6 → 1 on `back.out(1.4)`; gap
  between pops seeded random 30–80 ms (a fixed step reads as a mechanical wave).
  Revealed is permanent, survives the grid toggle. One `fromTo` per object,
  `lazy: false` (a deferred initial state paints a frame un-hidden before the pop).
  At rest the content node sits at identity, the button carries no transform ever
  (pinned in `tests/reveal-dom.test.tsx`).
  **TWO nodes per object.** The BUTTON holds the instance's exact box at constant
  scale; its only child `[data-vitrina-object-content]` fills it, carries the pop's
  opacity/scale, and centres `renderObject`'s return (the content rules and
  `container-type: size` live THERE). Why: the themes hang
  `--vitrina-object-shadow` on the BUTTON, and a filter on a node that changes
  scale re-rasterizes across raster-scale thresholds — jumps of its own. The
  button declares no overflow/contain/container-type (pinned in
  `tests/styles.test.ts`), so the overshoot paints past the box un-clipped.
  `pointer-events` stays on the button — the hit target; a child's `none` would
  not stop its clicks. Grid cards share the two-node structure (they never pop;
  the content rules key on the node).
  **Verify reveal/scale animation with IMAGE content only — never emoji-as-text.**
  On macOS, Chrome draws emoji from Apple Color Emoji, a BITMAP (sbix) font with
  fixed-size strikes: under an animated scale the glyph snaps between strikes —
  crisp size jumps mid-pop that read exactly like a broken animation while DOM,
  tween frames and geometry all measure perfect. This cost ten rounds of pipeline
  surgery on a bug the library never had. The playground's objects are generated
  `<img>` shapes; emoji stays behind its `content` toggle for A/B only.
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
  can retune them under media queries; inline styles cannot. `--vitrina-card-gap` (12) is
  the object↔card-content gap: an object's distance to ITS caption is not the distance
  between two cards.
- `labels.grid` is optional and falls back to `labels.viewport` — adding a required
  label would have broken every existing consumer's `labels` object.
- **The grid has TWO composition holes of its own (0.2.0), and THREE nodes per cell.**
  `renderCard(entity, ctx)` fills the card beside the object; `renderGridHeader()` fills
  a full-row header INSIDE the scroll container. Why holes and not a `ctx.view` branch of
  `renderObject`: the card's BUTTON is the Flip element at a fixed
  `--vitrina-grid-cell`, so anything inside it sits on the object and travels with it
  into the plane. Structure: `[data-vitrina-grid-item]` (the cell, a flex column) >
  `[data-vitrina-card]` (the button, `flex: none` so a tall caption cannot squeeze the
  box the Flip measured) + `[data-vitrina-card-content]` (the caption, a SIBLING).
  Why the header is not `children`: `children` mounts as a sibling of the VIEW, outside
  the box that scrolls, so a heading there stays pinned over a catalogue moving under it.
  The card renders no control of its own — the object button is the card's only control
  (a button cannot nest one), and interactive content in `renderCard` is a sibling of it.
  Both holes are grid-only, never called in plane view, and with neither given the grid
  emits exactly the DOM it always did plus the item wrapper. The driver is accessibility,
  not decoration: under `reducedMotion: 'grid'` this view IS the catalogue for a visitor
  who cannot take the plane, and unnamed objects tell them nothing.
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
- **Landing is a React commit, and the hand-off OVERLAPS in `onComplete`.** `onComplete`
  FIRST shows the landing copy — slot `visible` flying in, instance un-hidden flying
  out and on a relay; plain DOM writes of the exact values the next commit renders, so
  React never disagrees — THEN dispatches. The commit that follows hides the flying
  visual and its effect cleanup reverts the flight context; until it lands, both copies
  sit exactly superimposed (invisible). Leaving the whole swap to the commit paints one
  frame with NEITHER copy — a visible blink at every landing, because the commit runs a
  frame after the tween's last render. And `autoRound: false` on the park set and the
  flight set/tween: GSAP rounds a positioned element's left/top/width/height to whole
  px, so the rounded box lands up to half a pixel off the slot's fractional rect — with
  the overlap, a double image instead of a snap.
- **FLIP by hand, not `Flip.fit`:** two `getBoundingClientRect`s, the box set ONCE to
  the destination's, one tween on x/y/scaleX/scaleY (no layout per frame). `Flip.fit`
  goes through `getGlobalMatrix` and does not run under jsdom, where the geometry is
  tested. Both the active flight and the relay use the same `flyVisual`.
- **React owns `visibility`; GSAP owns opacity/scale/pointer-events.** Neither writes the
  other's, so the reveal context's `revert()` and the hidden origin never collide. The
  ONE licensed exception is the landing overlap above: `onComplete` pre-writes exactly
  the visibility value the very next commit renders.
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
    What the attribute does NOT carry is INHERITED text style: the wrapper lives on
    `body`, outside the consumer's tree, so the flying copy would paint with body's
    typography — same box, different font metrics (SVG text baselines and line boxes
    both move with the font), and every hand-off jumps vertically by the constant
    difference: up on lift-off, down on landing, both visuals at once in a crossfade.
    The orchestrator reads the root's inheritable text properties ONCE at mount (same
    discipline as the motion tokens) and replays them inline on the wrapper. `color` is
    deliberately NOT copied: the themes set it on `[data-vitrina-root]` (which the
    stamp resolves), and an inline copy would pin a hot theme switch to mount time.
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
  - **`none`** (0.2.0): no flight and NO RELAY — `relayInto` goes straight to `shown`
    with `relaying: null`, so the outgoing object is back on the plane and the incoming
    one is in the slot in the same commit. `relaying` must stay null: a relay with no
    flight would leave a `relayLanded` nobody ever fires. It is a swap INSIDE an open
    panel only — the first open still flies (the `panel !== 'open'` branch never reads
    the mode) — and a request arriving mid-flight still parks in `queued` rather than
    cutting a tween; it lands settled when the flight does (`beginInOpen` honours the
    mode too, for a queue drained across a mode change). Why it exists: `step()` between
    two neighbours in `entities` is routinely a trip across the whole world, and
    watching an object cross a plane nobody is looking at is slower than the swap it
    illustrates. Mediterra's real behaviour, which neither serialize nor crossfade could
    express.
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
- `src/styles/base.css` exists from this step (and since step 7 is the FULL structural
  stylesheet, see below): the focus rules (native ring suppressed with `outline: 2px
  solid transparent` — `none` vanishes under forced colours too — and drawn back on
  `:focus-visible`, because a programmatic `.focus()` matches it in Chrome; both in the
  stylesheet, an inline `outline: none` would beat the ring), the panel wipe keyframes,
  and the custom properties — the stacking scale (`--vitrina-z-plane/panel/flight`) and
  the motion tokens.
- **All durations/curves come from CSS variables**, read ONCE at mount
  (`readMotionTokens` in `src/motion.ts` — one `getComputedStyle` on the root, never a
  read per frame) with the `defaults.ts` constants as the SSR/jsdom fallback only. No
  animation numbers in the component. Retuning a token applies on the next MOUNT — the
  playground's "2s flight" toggle remounts (`key`) with `--vitrina-dur-flight: 2s` to
  play the whole choreography in deliberate slow motion.
- Two things on the card's CSS are load-bearing, not styling: `scrollbar-gutter:
  stable` (with a classic scrollbar the width is reserved only once the content needs
  it; if the height crosses that threshold MID-ANIMATION the scrollbar appears and
  shoves the content horizontally — it reads as text moving with no tween on it) and an
  explicit `overflow-x: hidden` (declaring only Y leaves X a valid scroll container,
  and any native scroll-into-view on a descendant hands it a real `scrollLeft` that
  shifts the whole card).

### Content lines (`data-vitrina-line`) — the panel content's entrance

- The content is `renderDetail`'s, so the library cannot animate nodes whose structure
  it does not know. It animates the panel descendants carrying `data-vitrina-line`
  (querySelectorAll in the panel scope, document order). None marked → no content
  animation, nothing breaks. Documented in the README; the playground marks its blocks.
- **Two GSAP contexts, not one.** The panel's arrival (and any chrome lines that enter
  with it) depends only on open/close — it lives in the panel-lifecycle effect. The
  content depends ALSO on the active id, because it re-arms on an A→B swap without
  closing — its own effect, scoped to `[data-vitrina-detail-content]`. With one
  dependency list, switching objects would replay the panel's own entrance with the
  panel already open.
- **Open choreography:** the card is uncovered → the lines enter staggered → the object
  flies in. The stagger runs WITH the flight (both are released by the wipe's
  duration), never after it — text waiting for the landing makes the opening feel twice
  as long. Each line: opacity + a short rise (`DETAIL_LINE_SHIFT`). The step is
  `--vitrina-stagger-line`; starts are multiples of that step, never loose numbers.
- **`lazy: false` on the from/fromTo tweens.** Without it GSAP defers the initial state
  to the end of the tick and the content paints one frame at full opacity before
  entering. This is also what makes the relay swap clean: the incoming lines are held
  at 0 in the very commit the text flips.
- **Close:** same properties, same durations, mirror curve, inverted stagger
  (`from: 'end'`) — and TIGHTER: its step is its own variable,
  `--vitrina-stagger-line-exit` (~40 ms against the entrance's ~70). On the way in the
  stagger paces the reading in order; on the way out there is nothing to read and its
  only job is avoiding the flat blink — an equally long step leaves the close feeling
  undecided. Exit starts are multiples of the exit step.
- **The unmount derives from the REAL exit duration** — `coverDone` fires at
  max(wipe, last line's start + its duration), computed from the lines actually found
  and the live token values, never a second constant that must agree by hand: two such
  numbers desynchronise the moment someone retunes a token, and the symptom is a close
  cut off mid-animation with no console error.
- On a relay the panel does not move but the content crosses: the old leaves with the
  commit, the new staggers in from 0. Never remount with `key={id}` — a remount kills
  any crossfade the consumer runs and the old vanishes in the same commit the new
  arrives; the re-arm derives from the id. `overwrite: 'auto'` on the re-arm kills a
  first-open entrance still mid-stagger on the same nodes.
- A panel MOUNTED already open (`defaultActiveId`, controlled id on hydrate) plays no
  entrance — `prevPanelRef` starts at the mount phase, not `'closed'`; animating there
  would flash server-rendered content out and back in.

## base.css, themes, controls, reduced motion (step 7)

- **base.css is the structural stylesheet and MANDATORY** (`vitrina/styles.css`): layer
  positioning, the z scale, overflow (both axes ALWAYS explicit), transform-origin,
  touch-action, the focus-ring geometry, the wipe keyframes, every token. Components
  keep inline styles ONLY for runtime values (world size, instance boxes, GSAP-owned
  transforms, `visibility`). Zero color in base.css. The DOM tests assert structure
  against the stylesheet TEXT (`tests/css.ts`): jsdom does not cascade attribute-selector
  rules into `getComputedStyle` reliably — and inside that helper never use
  `new URL(x, import.meta.url)`: Vite rewrites that exact pattern into an asset URL on
  the (jsdom) page origin; resolve a path with `fileURLToPath` instead.
- **The motion tokens are read ONCE at mount** into a ref; `motion()` feeds every tween.
  The ease tokens (`--vitrina-ease-micro`, `--vitrina-ease-flight`) hold GSAP ease
  STRINGS — GSAP core does not parse `cubic-bezier()`; the wipe's curves stay CSS timing
  functions (`--vitrina-panel-ease-in/out`). `--vitrina-dur-micro` = wheel chase,
  `--vitrina-dur-ui` = zoom step, plus the flight/panel durations and line staggers.
- **will-change is put on and taken off, NEVER permanent** — a forever-promoted layer
  squats on GPU memory. Pan layer: promoted on press / first wheel tick, demoted when
  drag, throw and both chase tweens are all at rest (each quickTo's `onComplete` checks
  the other). Zoom layer: around its tween. Flight visuals: in the park/fly `gsap.set`s,
  stripped by their context's revert. No stylesheet declares will-change (pinned by
  `tests/styles.test.ts`).
- **Reduced motion in CSS keys on the root ATTRIBUTE `data-vitrina-reduced`, never the
  media query**: the `reducedMotion` prop arbitrates and `'ignore'` must animate with
  the preference on — a media query would overrule it silently. The orchestrator stamps
  the attribute when reduction is effective; the tab-order pass runs identically in all
  three modes.
- **Themes: `paper.css` is the factory default** (palette measured on the reference's
  live site: `#f5f6ee` paper, `#222` ink, `#a1a19c` grey; dark diffuse drop-shadow under
  each object), **`void.css` the dark one** (`#08080A` page — not pure black, it bands —
  no shadow, a light halo). Both define the SAME token set on `[data-vitrina-root]`
  (page, ink, muted, focus, panel-surface, seam, object-shadow) plus the paint that
  consumes it; a consumer imports exactly ONE. The object treatment is `drop-shadow`
  (follows the cut-out alpha, not the box) and the COMPLETE filter value lives in one
  token — composing `drop-shadow()` lists across tokens is how shadows silently die.
  Every copy of an object (plane instance, grid card, panel slot, both flight visuals)
  gets the same filter, so nothing changes weight mid-flight.
- **`<VitrinaControls>`: exactly three buttons** — zoom out, zoom in, view toggle — over
  `useVitrina()` (`api.labels` passes the strings through; ends disable their zoom
  button; the toggle renames itself `toGrid`/`toPlane`). Renders `null` under
  `viewLocked` — all three would be no-ops. `labels.closeDetail` remains for the
  consumer's own close control; neither the panel shell nor the controls render one.
- **The focus ring is FOUR tokens, three of them geometry.** `--vitrina-focus` (colour,
  in every theme's set) plus `--vitrina-focus-width` / `-offset` / `-radius` in base.css,
  consumed by the button reset (the radius rounds nothing but the ring — the button
  paints no surface). Defaults stay conservative (2px / 2px / 0) because the library
  cannot know how much air a consumer's content leaves around an object's box, and they
  INHERIT: scoping them to a subtree (`[data-vitrina-controls]`, the grid) retunes that
  subtree's ring with no specificity fight against the stylesheet. Pinned in
  `tests/styles.test.ts` — a hard-coded value in the reset is a consumer forced to
  out-specify base.css to move their own ring.
- Draggable gets `cursor: 'grab'` / `activeCursor: 'grabbing'` explicitly: its default
  writes an inline `cursor: move` on the trigger that would beat the stylesheet.

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
  **`gsap.set` is lazy the same way**: a set created in a React commit WRITES at the end
  of the next tick, AFTER that tick's tweens render — stomping their frame with the
  set's values. `lazy: false` on any set that must land now (the reveal baseline).
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

**The world in use is `selectWorld`'s ONE decision, and explicit `instances` turn the
compact world OFF (0.2.0).** Instance coordinates are absolute world px and pan is
clamped so the world always covers the viewport; swapping in `compactWorld` under
coordinates computed for the wide world puts everything past the compact width outside
the pan bounds — unreachable forever, on phones (~50% of Mediterra's instances). So:
`selectWorld(layout, width, explicitInstances)` returns `{ world, sizeFactor, compact }`
— the world, the size factor AND the compact flag the generation keys on, one answer
from one place — and with `instances` given it is always the regular world at every
width. Generated instances keep compact: they are re-generated INTO whichever world is
in use, clamped to it, so they cannot fall out.

The world box IS the reachability test (`outOfWorld`, PURE): the visible window sweeps
all of [0, world] as the pan travels its bounds, and covers more only when the scaled
world cannot fill an axis — so inside the box is always reachable, outside it never is.
Any instance outside the world in use gets ONE dev-only `console.warn` naming it
(`isProduction()` in `src/env.ts`, shared with the panel-coverage warning), keyed on the
offending SET so StrictMode says it once and a new set says it again. Accepting a
configuration that guarantees invisible content in silence is the worst of the three
possible behaviours.

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
  first render back, cards paired by exact shown instance id. Plus the composition holes:
  `renderCard` mounts inside EVERY item as a SIBLING of the button (never a descendant —
  the button's text stays `renderObject`'s alone and it keeps the `data-flip-id`), one
  control per card, the ctx it receives (instance, `view: 'grid'`, `isActive` following
  the panel), the header inside the scroll container and `children` outside it, and both
  holes silent in plane view. Anything the render props record is keyed by ENTITY, never
  appended — StrictMode renders twice and the question is what each card got.
- **World test** (`tests/world.test.tsx`): nothing is ever outside the pan bounds. The
  reachable region (the visible window at the extreme pans, unioned) covers the whole
  world box at every viewport and zoom step; every instance — explicit AND generated — is
  `instanceVisible` inside it at 320…1920 px; the same explicit list against
  `compactWorld` strands a third of itself (the bug, pinned); the plane really mounts the
  regular world at a phone width with `instances` given and the compact one without; and
  the dev warning names the offenders once and stays silent when everything is inside.
- **Machine test** (`tests/machine.test.ts`, pure): every transition pinned, no-ops return
  the same reference, the panel never re-covers on a swap, the full arc is symmetric
  (`waiting→in→shown` on open mirrored by `leaving→out` on close, the panel `covering`
  across both close phases), and a 20 000-step seeded random walk per collision mode
  asserts the invariant on every reachable state — `none`'s walk additionally asserts
  that `relaying` is NEVER set and every in-panel swap lands `shown` in one step.
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
  Content lines: held at 0 from the click's commit (`lazy: false`), released after the
  wipe at multiples of the step alongside the flight, re-armed on a relay without a
  re-wipe, exit inverted and gating `coverDone` at the real exit total, inert under
  reduced motion and with no lines marked.
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
- **Real-browser animation checks need IMAGE content — emoji-as-text lies.** On macOS,
  Chrome renders emoji from Apple Color Emoji (bitmap sbix strikes at fixed sizes);
  any animated scale snaps the glyph between strikes, faking a broken animation that
  no DOM, tween or geometry measurement will ever show. The playground defaults to
  generated `<img>` shapes; its `content: emoji` toggle exists for A/B only.

## Licensing

Library is MIT. GSAP: free for commercial use but not MIT; peer dep keeps the grant
clean. Its licence bars no-code visual animation builders — the demo's config panel must
stay sliders-setting-props, never an exporting editor. Demo assets: verify rights **per
record** (Smithsonian is not blanket CC0); every asset gets a `CREDITS.md` entry.

## Commands

`pnpm check` = lint + typecheck + test + build (root); `pnpm -r` is topological, so the
library builds before `apps/demo` compiles against its `dist`. Per-package: `pnpm -C
packages/vitrina test|typecheck|build`.

Browser: `pnpm -C apps/playground dev` (aliases the library SOURCE — HMR, the bench for
mechanic work) and `pnpm -C apps/demo dev` (consumes `dist`, so run `pnpm -C
packages/vitrina build` first; `pnpm -C apps/demo preview` builds and serves it).

## Status (order of work, §11)

- [x] 1. Scaffold + types + `generateInstances` + tests — determinism proven over 100 runs
- [x] 2. `geometry.ts` + `reveal.ts` + boundary tests — §10 cases enumerated per file
- [ ] 3. `<Vitrina>` + `<Plane>`: layers, drag, wheel, zoom, bounds — code complete,
     gate green, SSR smoke passed; browser check on `pnpm preview` still pending
- [ ] 4. Reveal + tab order + teardown test — code complete, gate green, DOM tests
     against `framePass`; pops verified clean in a real browser with IMAGE content
     (throws into virgin territory, overshoot on — the emoji lesson above); reveal
     rhythm / intro feel still need the deliberate real-browser pass
- [ ] 5. Grid view + Flip toggle — code complete, gate green (`tests/view.test.tsx`,
     teardown across repeated toggles); the flight itself needs the real-browser check
     (since step 7 the playground mounts `<VitrinaControls>`, which has the toggle).
     0.2.0 added `renderCard` / `renderGridHeader` (the item wrapper is new DOM): the
     real-browser check now also covers a card with copy under it — the Flip must still
     fly from and to the BUTTON's box with the caption staying put in the cell, rows of
     uneven caption length must not shift the objects, and the header must scroll away
     with the cards instead of pinning. Also: a card with nothing shown to fly from
     fades in as ONE thing, object and copy together (`onEnter` animates both). That
     pairing is real-browser-only — under StrictMode the grid's flight context is built,
     reverted and rebuilt, and the second run has no entering elements to call it.
     Already smoke-checked in a live tab (static layout only — rAF is frozen there, so
     nothing about the flight or the fade): header 880px across all three 240px columns
     and scrolling with the cards (200px of scroll moved it 200px, `scrollLeft` still 0),
     item a 12px-gap flex column measuring 282 = 240 + 12 + 30, card `flex: 0 0 auto` at
     exactly 240×240 with the copy BELOW and outside the button, one control per card,
     a click still opening the panel.
- [ ] 6. Detail panel + object state machine, panel/object lifecycles DECOUPLED
     (panel uncovers once, covers once, holds still across object swaps), configurable
     open collision (serialize/crossfade/none), panel entrance wipe, between-objects height
     tween — code complete, gate green (`tests/machine.test.ts`, `tests/detail.test.tsx`
     incl. all three collision modes and the reveal-once/cover-once check, teardown extended
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
     of the active object throughout. The landing seam, at 2s and at full speed: the object
     neither blinks nor shifts on the last frame — open, close, and both relay modes (the
     hand-off overlaps in `onComplete` and the box is unrounded; jsdom + a driven tab pin
     the mechanism, only real frames prove the paint).
     Content lines, with `--vitrina-dur-flight` at 2s: card first, lines staggered in
     (~70 ms steps), object arriving in parallel — never text waiting for the landing;
     the close staggered out tighter (~40 ms), last line first, and NOT cut off
     mid-animation (the unmount derives from the exit total); ← / → re-arms the lines
     with no re-wipe; with no `data-vitrina-line` at all the panel still opens fine.
     Tab between the panel's elements: nothing may shift horizontally (scrollbar-gutter
     + overflow-x on the card).
     **Reconsider whether crossfade still earns its place:** with the panel now still,
     serialize may feel complete on its own — a real-browser call, per the prompt.
     0.2.0 added `'none'` (the playground's collision toggle has all three): check that
     the swap reads as instant and deliberate rather than as a dropped frame — the panel
     holds, the content crosses, the outgoing object is back on the plane in the same
     frame — and that ← / → at speed never leaves a copy behind on either side.
- [ ] 7. Themes, `base.css`, `<VitrinaControls>`, reduced-motion paths — code complete,
     gate green (`tests/styles.test.ts` pins base.css structural/colorless/no-will-change
     and the theme token parity; `tests/controls.test.tsx` pins the three buttons, the
     `'grid'` lock, the three modes, identical tab order, and will-change on/off around
     the zoom tween; the build copies all three CSS files to dist, so the exports map —
     and `npm pack` — is truthful now). Real-browser checks still pending:
     - paper (default) and void via the playground's theme switch: plane on paper with
       the dark diffuse shadow under each object / void with the halo; the panel seam;
       the SAME weight on the object across plane → flight → slot (the filter rides
       every copy).
     - will-change actually toggling in devtools (pan layer during drag/wheel only,
       zoom layer during the step, flight visuals during park/fly) — nothing promoted
       at rest.
     - the three `reducedMotion` modes with the OS preference REALLY on (System
       Settings → Accessibility → Display → Reduce motion), not simulated from
       devtools: 'respect' = no intro/pops/inertia/staggers but drag, wheel, zoom,
       toggle and panel all alive; 'grid' = locked grid, controls render nothing;
       'ignore' = full motion. Tab order identical in all three.
     - `<VitrinaControls>` in the playground (bottom-left): zoom ends disable, toggle
       renames, focus ring on keyboard only.
     Already smoke-checked in a live tab (static wiring only — the automated tab
     freezes rAF, so nothing about feel): both themes paint and swap, the object
     drop-shadow/halo applies, controls render the label texts and inherit the theme
     ink (the fix that came out of this check: themes set `color` on the ROOT, not
     only on the views — otherwise chrome inside the root inherits the page's), pan
     layer at `will-change: auto` at rest, viewport `cursor: grab` + `touch-action:
     none` + z 10 from the stylesheet.
- [x] 8. Build config, exports map, SSR test, README; `npm pack` → install tarball into
     scratch Vite app **before** writing the demo — done: tsup (ESM + d.ts, CSS copied
     raw), exports map (root + styles.css + both themes), `repository.directory`,
     LICENSE duplicated into the package, SSR test extended (generated positions in the
     markup, zero transforms, every src module imported in Node — no browser globals at
     module scope), full README at root and package. Tarball verified from a fresh
     Vite + React + TS app outside the workspace: `tsc` + `vite build` resolve all four
     export paths, GSAP plugins land in their own dynamic chunks, Node `renderToString`
     emits the 114 objects plain. (Importing BOTH themes at once lets the consumer's CSS
     minifier drop the earlier one — identical selectors, fully overridden; the
     documented contract is exactly one theme, so not a packaging bug.)
- [ ] 9. `apps/demo` (Vite + React + TS, void theme, minerals + emoji datasets) —
     code complete, gate green (`pnpm check` now builds the library, then typechecks
     and builds the demo against it). One page, ONE `<Vitrina>` above the fold; every
     section below sets props on it. Sections in order: the plane full-bleed with no
     copy over it (92dvh, so the next section peeks and is the only scroll cue),
     install, live config panel, dataset toggle, accessibility, credits.
     Real-browser checks still pending — the automated tab freezes rAF, so nothing
     below is about feel: drag/inertia on the demo's own plane, the reveal rhythm at
     the demo's `count`, the flight into the panel at both `--vitrina-panel-size`
     breakpoints, the grid toggle, and the theme switch mid-flight. Since 0.2.0 both
     datasets fill the grid's holes (`renderCard` = name + locality / code point,
     `renderGridHeader` = the catalogue heading): check the toggle INTO the grid with
     captions present — objects must not shift between rows of uneven caption length —
     and that the two-line clamp on `.card-sub` holds for the longest locality. Plus, from the
     chrome pass: the focus ring (2px / 7px off / 13px radius, ink mixed 86% toward
     the page) on a plane object, on a grid card (offset drops to 3px — a card has no
     air around it) and on a control chip, at a DESKTOP width; and the control strip's
     hover/active/disabled over a plane being dragged, where the backdrop blur is the
     thing that has to hold up. The automated tab confirmed the static paint only, and
     at 349px CSS — it refused to resize.
     Decisions worth keeping:
     - **It consumes `dist`, never `src` — no Vite alias.** `vitrina` resolves through
       the workspace link into the package's `exports` map. It is the ONLY thing in the
       repo that breaks if the exports map, the build, or `files` is wrong; the
       playground aliases the source and would keep working through all three. This is
       why the demo has `typecheck` and `build` scripts: `pnpm -r` is topological, so
       the gate builds the library first and then compiles the demo against the real
       artifact. Verified in the built output: base.css structure, void's tokens, the
       demo's own sheet, and paper inlined via `?inline` all land in `dist/assets`.
     - **The quick-start snippet is a real file** (`src/examples/QuickStart.example.tsx`)
       read with `?raw` and rendered into the page. It is inside the demo's `tsc` and
       its build, so a renamed prop fails the gate instead of rotting on the page. A
       snippet typed into markup cannot fail.
     - **Exactly one theme is imported for real** (`vitrina/themes/void.css`), because
       that is the documented contract. The config panel's paper option is the sole
       exception and is handled the only way a live switch can be: paper is pulled in as
       TEXT (`?inline`) and injected into a `<style>` while selected — importing both
       for real leaves the outcome to file order and lets a minifier drop one.
     - **The page's palette mirrors the theme's tokens** into `--demo-*` (and stamps
       `data-demo-theme` on `<html>`), so the widget never reads as a component dropped
       onto a background that nearly matches. No accent colour anywhere: the specimens
       are the only colour on the page.
     - **`modal` is tied to the SAME breakpoint as `--vitrina-panel-size`** (860px), one
       declared in `App.tsx` and one in `styles.css` — under it the panel covers the
       plane completely and free focus would send Tab into a plane nobody can see.
     - **The config panel stays a config panel.** Sliders setting props on a fixed
       component; no export, no embeddable artifact — GSAP's licence bars no-code
       animation builders and that line is not worth approaching.
     - **`layout` is memoised on the five primitives**, not on the config object: the
       library memoises generated instances on the `layout` identity, so a fresh object
       per render would regenerate 114 instances on every keystroke in the seed field.
     - **No sticky "applied to the plane" bar.** It was tried; pinned to the viewport
       for the length of a long section it spends its life covering controls it has
       nothing to do with, and the only thing on it that matters (the link back up) is
       equally findable at the end of the section.
     - Content: **24 CC0 specimens from NMNH Mineral Sciences**, chosen because the
       records carry real metadata (species, locality, catalogue number, cut, weight,
       associated minerals) and that fills the panel with true copy instead of 24
       invented paragraphs. Nothing from the Met: its holdings are jewellery, not
       specimens, and mixing them would dilute the set — NMNH alone produced 24 verified
       records. **Rights were verified per record, live**, on each `si.edu/object/…`
       page, and the check is `media--openaccess` (the IMAGE is CC0) AND *Metadata
       Usage* `CC0` — because a record can be CC0 metadata over a restricted photograph,
       which is the trap. Calibrated against a known negative from the same museum: The
       Hope Diamond (`siris_sic_8819`) is `media--no-openaccess`, and
       `siris_arc_402896` is `media--no-openaccess` WITH CC0 metadata. Every statement
       is in `apps/demo/assets/CREDITS.md`, per file.
     - **The cut-outs are made for near-black, which is a different job from cutting for
       print.** A matte lifted against a museum's white cloth leaves the edge ramp
       carrying that white — invisible over paper, a milky halo over `#08080A`. Two
       things prevent it, both in `apps/demo/tools/cutout.py` (committed, so the claim
       is checkable): the mask is ERODED before it is feathered, so the ramp sits on
       pixels that were interior to the specimen; and every transparent pixel's RGB is
       overwritten with the nearest foreground colour, so neither the browser's
       resampling nor the WebP encoder can pull the background back in. Cast shadows are
       classified as background by chromaticity (same hue as the cloth, lower luminance)
       — left in, they weld a grey puddle to the specimen. Ran once; the `.webp` files
       are committed and nothing is fetched or reprocessed at build time.
     - **Second dataset: Twemoji 17.0.3 SVG files (CC-BY 4.0), not emoji characters.**
       The point is content-agnosticism — same component, same props, non-photographic
       content one click away — and shipping the CHARACTER would have walked straight
       into the bitmap-font trap on the very page that demonstrates the motion. The
       emoji panel shows the character as text beside its vector twin, which makes the
       README's note visible instead of merely stated.

## reference/

Contiene implementaciones previas de esta mecánica, de otro proyecto. **Solo lectura.**

- Consúltalas SOLO cuando este archivo o el prompt te dirijan explícitamente a un archivo concreto.
- Úsalas para entender comportamiento, timing y configuración de plugins.
- NO copies estructura, nombres, tipos, clases de Tailwind ni strings.
- Ningún archivo de src/ importa nada de reference/. reference/ está en .gitignore.
