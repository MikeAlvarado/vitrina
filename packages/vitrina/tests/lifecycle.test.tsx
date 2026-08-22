// @vitest-environment jsdom
/*
 * Interaction lifecycle under React StrictMode.
 *
 * StrictMode mounts, unmounts and remounts every effect in development. Anything
 * an effect creates AFTER an `await` (the interaction plugins arrive via dynamic
 * import) is created after that first cleanup already ran and could not see it —
 * without a cancellation flag, two mounts mean two of everything. This test pins
 * the invariant: after mount exactly one Draggable and one Observer own the plane;
 * after unmount, none survive (teardown discipline from the working rules).
 */
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Observer } from 'gsap/Observer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Vitrina } from '../src';
import type { VitrinaEntity, VitrinaLabels } from '../src';
import { loadInteractionPlugins } from '../src/gsap';

declare global {
  // React's act() checks this flag; without it every act() warns.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VIEW = { width: 1200, height: 800 };

const entities: VitrinaEntity[] = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}` }));
const labels: VitrinaLabels = {
  viewport: 'Plane',
  objectLabel: (e) => e.id,
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid',
  toPlane: 'Plane',
};

/** Every Draggable the library created, dead or alive — `Draggable.get` only ever shows the latest per element. */
let created: Draggable[] = [];
/** ResizeObservers constructed: the measuring effect builds one per mount, so StrictMode shows as ≥ 2. */
let observersBuilt = 0;
/** The latest ResizeObserver callback — firing it is how a test resizes the viewport. */
let onResize: (() => void) | null = null;
/** Mutable so a test can change what the viewport measures before firing `onResize`. */
let view = { ...VIEW };
const liveDraggables = () => created.filter((d) => d.enabled());

/** Tweens parked on the global timeline whose targets are DOM elements (function-target delayedCalls are GSAP internals). */
const elementTweens = () =>
  gsap.globalTimeline
    .getChildren(true, true, false)
    .filter((t) => t.targets().some((target: unknown) => target instanceof Element));

beforeEach(() => {
  created = [];
  observersBuilt = 0;
  onResize = null;
  view = { ...VIEW };
  const realCreate = Draggable.create;
  vi.spyOn(Draggable, 'create').mockImplementation((targets, vars) => {
    const instances = realCreate.call(Draggable, targets, vars);
    created.push(...instances);
    return instances;
  });

  // jsdom has neither; the plane needs both to get past its first measurement.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observersBuilt += 1;
        onResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  );
  // jsdom measures everything as 0×0; give the viewport a real size so geometry
  // resolves and the interaction actually gets created.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const size = this.hasAttribute('data-vitrina-viewport') ? view : { width: 0, height: 0 };
    return { x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Flushes the dynamic plugin import and whatever its continuations schedule. */
async function settle() {
  await act(async () => {
    await loadInteractionPlugins();
  });
  await act(async () => {});
}

function renderStrict(host: HTMLElement) {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <Vitrina entities={entities} labels={labels} renderObject={(e) => <span>{e.id}</span>} />
    </StrictMode>,
  );
  return root;
}

async function mountStrict() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: ReturnType<typeof createRoot>;
  await act(async () => {
    root = renderStrict(host);
  });
  await settle();
  const pan = host.querySelector('[data-vitrina-pan]');
  if (!(pan instanceof HTMLElement)) throw new Error('pan layer not rendered');
  return { root, host, pan };
}

/** Resizes the viewport synchronously: new measurement, re-render, interaction effect re-run. */
function resizeSync(width: number, height: number) {
  view = { width, height };
  if (!onResize) throw new Error('no ResizeObserver registered');
  act(() => onResize?.());
}

describe('interaction lifecycle under StrictMode', () => {
  it('mounts exactly one Draggable and one Observer on the plane', async () => {
    const { pan, root } = await mountStrict();

    // Discipline 1: prove the setup is real before asserting counts — StrictMode
    // actually double-mounted (two measuring effects ran) and something was created.
    expect(observersBuilt).toBeGreaterThanOrEqual(2);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(Draggable.get(pan)).toBeDefined();
    expect(liveDraggables()).toHaveLength(1);
    expect(Draggable.get(pan)).toBe(liveDraggables()[0]);
    expect(Observer.getAll()).toHaveLength(1);
    expect(Observer.getAll()[0]?.vars.type).toBe('wheel');

    await act(async () => root.unmount());
  });

  it('creates one interaction when the cleanup runs while the plugin import is pending', async () => {
    /*
     * The race the cancellation flag exists for. Each synchronous resize re-runs
     * the interaction effect: the previous run's cleanup fires before that run's
     * `.then` continuation has executed, so — without the flag — every run that
     * was ever started still creates its Draggable/Observer once the microtasks
     * flush. (`act` without an async callback flushes React synchronously and
     * does not yield to microtasks, which is what makes this deterministic.)
     */
    const { pan, root } = await mountStrict();
    resizeSync(1000, 700);
    resizeSync(900, 600);
    resizeSync(1100, 750);
    await settle();

    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(liveDraggables()).toHaveLength(1);
    expect(Draggable.get(pan)).toBe(liveDraggables()[0]);
    expect(Observer.getAll()).toHaveLength(1);

    await act(async () => root.unmount());
    expect(liveDraggables()).toHaveLength(0);
    expect(Observer.getAll()).toHaveLength(0);
    expect(elementTweens()).toHaveLength(0);
  });

  it('leaves nothing behind on unmount', async () => {
    const { pan, root } = await mountStrict();
    expect(liveDraggables()).toHaveLength(1);
    expect(Observer.getAll()).toHaveLength(1);

    await act(async () => root.unmount());

    expect(Draggable.get(pan)).toBeUndefined();
    expect(liveDraggables()).toHaveLength(0);
    expect(Observer.getAll()).toHaveLength(0);
    expect(elementTweens()).toHaveLength(0);
  });
});
