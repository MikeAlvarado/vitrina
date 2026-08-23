/*
 * jsdom scaffolding shared by the DOM tests. No `@vitest-environment` docblock
 * here — each test file declares its own.
 *
 * jsdom has no ResizeObserver, no matchMedia, and measures every element as 0×0.
 * The plane bails out of its first measurement on a zero rect (correctly: a
 * hidden plane must not run), so without a viewport size nothing — no Draggable,
 * no Observer, no pops — would ever be created and a teardown test would pass
 * without having tested anything.
 */
import { StrictMode, act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { gsap } from 'gsap';
import { vi } from 'vitest';

import { Vitrina, useVitrina } from '../src';
import type { VitrinaApi, VitrinaEntity, VitrinaLabels, VitrinaProps } from '../src';
import { loadInteractionPlugins } from '../src/gsap';

declare global {
  // React's act() checks this flag; without it every act() warns.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export const VIEW = { width: 1200, height: 800 };
/** Where the stub places the detail slot (the flight's destination). */
export const SLOT = { x: 800, y: 100, size: 240 };

export const entities: VitrinaEntity[] = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}` }));

let api: VitrinaApi | null = null;
/** Chrome-less probe: grabs the library's state the way a consumer's controls would. Mount it as a child. */
export function Probe() {
  api = useVitrina();
  return null;
}
/** The latest API the probe saw. */
export const currentApi = (): VitrinaApi => {
  if (!api) throw new Error('no <Probe /> mounted');
  return api;
};

export const labels: VitrinaLabels = {
  viewport: 'Plane',
  grid: 'Grid',
  objectLabel: (e) => e.id,
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid',
  toPlane: 'Plane',
};

export interface DomStubs {
  /** What the viewport measures. Mutable: change it, then fire `onResize`. */
  view: { width: number; height: number };
  /** Read by the matchMedia stub. Set BEFORE mounting. */
  prefersReduced: boolean;
  /** ResizeObservers constructed — the measuring effect builds one per mount, so StrictMode shows as ≥ 2. */
  observersBuilt: number;
  /** The latest ResizeObserver callback — firing it is how a test resizes the viewport. */
  onResize: (() => void) | null;
  /** The getBoundingClientRect spy — its call count is how a test proves a path measured nothing. */
  measure: ReturnType<typeof vi.spyOn>;
}

/** Installs the stubs for one test. Pair with `vi.restoreAllMocks()` + `vi.unstubAllGlobals()` in afterEach. */
export function stubDom(): DomStubs {
  const stubs: DomStubs = {
    view: { ...VIEW },
    prefersReduced: false,
    observersBuilt: 0,
    onResize: null,
    measure: undefined as unknown as DomStubs['measure'],
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        stubs.observersBuilt += 1;
        stubs.onResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: stubs.prefersReduced && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  stubs.measure = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      const rect = (x: number, y: number, width: number, height: number) => ({
        x,
        y,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        width,
        height,
        toJSON: () => ({}),
      });
      if (
        this.hasAttribute('data-vitrina-viewport') ||
        this.hasAttribute('data-vitrina-grid') ||
        this.hasAttribute('data-vitrina-root')
      ) {
        return rect(0, 0, stubs.view.width, stubs.view.height);
      }
      // Plane objects sit where their inline position says; grid cards (no inline
      // position) at the origin. Enough for Flip to see a real delta between views.
      // The flight visual likewise: GSAP writes its box as inline px.
      if (
        (this.hasAttribute('data-vitrina-object') || this.hasAttribute('data-vitrina-flight')) &&
        this instanceof HTMLElement
      ) {
        const size = parseFloat(this.style.width) || 240;
        return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, size, size);
      }
      // The detail slot: somewhere on the right half, so a flight has a real delta.
      if (this.hasAttribute('data-vitrina-slot')) return rect(SLOT.x, SLOT.y, SLOT.size, SLOT.size);
      return rect(0, 0, 0, 0);
    });
  return stubs;
}

export interface MountOptions {
  props?: Partial<VitrinaProps>;
  children?: ReactNode;
}

const element = (options: MountOptions) => (
  <StrictMode>
    <Vitrina
      entities={entities}
      labels={labels}
      renderObject={(e) => <span>{e.id}</span>}
      {...options.props}
    >
      {options.children}
    </Vitrina>
  </StrictMode>
);

/** Renders the plane under StrictMode into `host`, synchronously. The caller wraps it in `act`. */
export function renderStrict(host: HTMLElement, options: MountOptions = {}): Root {
  const root = createRoot(host);
  root.render(element(options));
  return root;
}

/** Re-renders with new props (controlled-mode tests). The caller wraps it in `act`. */
export function rerender(root: Root, options: MountOptions = {}): void {
  root.render(element(options));
}

/** Flushes the dynamic plugin import and whatever its continuations schedule. */
export async function settle(): Promise<void> {
  await act(async () => {
    await loadInteractionPlugins();
  });
  await act(async () => {});
}

export async function mountStrict(options: MountOptions = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  await act(async () => {
    root = renderStrict(host, options);
  });
  await settle();
  return { root, host, pan: panLayerOf(host) };
}

/** The plane's pan layer, or null in grid view. */
export const panLayerOf = (host: HTMLElement): HTMLElement | null =>
  host.querySelector<HTMLElement>('[data-vitrina-pan]');

/** The plane's pan layer, when the test knows the plane is mounted. */
export function requirePan(host: HTMLElement): HTMLElement {
  const pan = panLayerOf(host);
  if (!pan) throw new Error('pan layer not rendered');
  return pan;
}

/**
 * Resizes the viewport synchronously: new measurement, re-render, interaction
 * effect re-run — all before yielding to microtasks (`act` with a sync callback
 * flushes React synchronously and does not yield), which is what makes the
 * import race deterministic.
 */
export function resizeSync(stubs: DomStubs, width: number, height: number): void {
  stubs.view = { width, height };
  if (!stubs.onResize) throw new Error('no ResizeObserver registered');
  act(() => stubs.onResize?.());
}

export const objectsOf = (host: HTMLElement): HTMLButtonElement[] =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('[data-vitrina-object]'));

/** Lands every pop queued so far (and anything else on the global timeline). */
export function landTimeline(): void {
  act(() => {
    gsap.globalTimeline.time(gsap.globalTimeline.time() + 5);
  });
}

/** The plane objects whose pop has started — the ones a click can open. */
export const revealedObjectsOf = (host: HTMLElement): HTMLButtonElement[] =>
  objectsOf(host).filter((el) => el.hasAttribute('data-vitrina-revealed'));

/** Live tweens whose targets include `el`. */
export const tweensOn = (el: Element): gsap.core.Animation[] =>
  gsap.globalTimeline
    .getChildren(true, true, false)
    .filter((t) => t.targets().some((target: unknown) => target === el));

export const detailOf = (host: HTMLElement) => ({
  layer: host.querySelector<HTMLElement>('[data-vitrina-detail]'),
  panel: host.querySelector<HTMLElement>('[data-vitrina-panel]'),
  card: host.querySelector<HTMLElement>('[data-vitrina-panel-card]'),
  slot: host.querySelector<HTMLElement>('[data-vitrina-slot]'),
  content: host.querySelector<HTMLElement>('[data-vitrina-detail-content]'),
  // The flight layers are PORTALLED to document.body — outside `host`.
  portal: document.querySelector<HTMLElement>('[data-vitrina-flight-portal]'),
  flightLayer: document.querySelector<HTMLElement>('[data-vitrina-flight-layer]'),
  flight: document.querySelector<HTMLElement>('[data-vitrina-flight]'),
  relayLayer: document.querySelector<HTMLElement>('[data-vitrina-relay-layer]'),
  relay: document.querySelector<HTMLElement>('[data-vitrina-relay]'),
  panelAnim: host.querySelector('[data-vitrina-panel]')?.getAttribute('data-vitrina-panel-anim') ?? null,
  panelPhase: host.querySelector('[data-vitrina-panel]')?.getAttribute('data-vitrina-panel-phase') ?? null,
  // The root that drives chrome is the widget's, not the portal peer: query within host.
  detailPhase: host.querySelector('[data-vitrina-root]')?.getAttribute('data-vitrina-panel-phase') ?? null,
});

/**
 * Advances the timeline until the flight and relay layers hold no live tweens,
 * AND the panel has finished revealing/covering (its `delayedCall`s are on the
 * same global timeline). A relay drains across several completions — one landing
 * spawns the next flight — so a single jump is not enough. Bounded so a stuck
 * machine fails loudly instead of hanging.
 */
export function landUntilSettled(host: HTMLElement): void {
  for (let i = 0; i < 24; i++) {
    landTimeline();
    const { flight, relay, panelPhase } = detailOf(host);
    const live = (flight ? tweensOn(flight).length : 0) + (relay ? tweensOn(relay).length : 0);
    // Still opening (waiting for reveal) or covering means a delayedCall is pending.
    const settling = panelPhase === 'covering';
    if (live === 0 && !settling) break;
  }
}

/** Presses Escape the way a visitor does: a keydown on whatever has focus, bubbling to the document. */
export function pressEscape(): void {
  act(() => {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}
