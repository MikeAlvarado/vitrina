// @vitest-environment jsdom
/*
 * The visibility pass, wired to the DOM (§6.4/§6.5). The pure `framePass` is
 * tested exhaustively in reveal.test.ts; this checks what the plane DOES with
 * its answers: which attributes and styles land on which buttons, that they
 * are written only when the answer changes, and that the pass measures nothing.
 *
 * Most cases run under reduced motion, where reveal is instant — the same pass,
 * the same sets, no timing. One case runs with motion to pin the rule that an
 * object whose pop has not started yet is NOT tabbable, even though it is
 * already "revealed" in the pass's bookkeeping.
 */
import { act } from 'react';
import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LAYOUT, generateInstances, useVitrina } from '../src';
import type { VitrinaApi, VitrinaObjectContext } from '../src';
import { REVEAL_INSET } from '../src/defaults';
import { centerPan } from '../src/plane/geometry';
import { framePass } from '../src/plane/reveal';
import { VIEW, entities, mountStrict, objectsOf, stubDom } from './harness';
import type { DomStubs } from './harness';

let stubs: DomStubs;
let api: VitrinaApi | null = null;

/** Chrome-less probe: grabs the library's state the way a consumer's controls would. */
function Probe() {
  api = useVitrina();
  return null;
}

const idOf = (el: Element) => el.getAttribute('data-vitrina-instance') ?? '';
const revealedOf = (els: HTMLButtonElement[]) => els.filter((el) => el.hasAttribute('data-vitrina-revealed'));
const tabbableOf = (els: HTMLButtonElement[]) => els.filter((el) => el.tabIndex === 0);

beforeEach(() => {
  stubs = stubDom();
  api = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('reveal + tab order under reduced motion (instant)', () => {
  it('reveals exactly what framePass predicts for the centred plane; hides the rest fully', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict();
    const objects = objectsOf(host);
    expect(objects).toHaveLength(DEFAULT_LAYOUT.count);

    // The analytic prediction: the same generator, the centering pan, zoom 1.
    const placed = generateInstances(entities, DEFAULT_LAYOUT);
    const view = { w: VIEW.width, h: VIEW.height };
    const pan = centerPan(DEFAULT_LAYOUT.world, view);
    const { entering } = framePass(placed, view, pan, 1, REVEAL_INSET, new Set());
    expect(entering.length).toBeGreaterThan(0);
    expect(entering.length).toBeLessThan(objects.length);

    const revealed = revealedOf(objects);
    expect(revealed.map(idOf).sort()).toEqual([...entering].sort());

    for (const el of revealed) {
      expect(el.style.opacity).toBe('1');
      expect(el.style.pointerEvents).toBe('auto');
      expect(el.tabIndex).toBe(0); // centre inside the inset frame ⇒ rect inside the frame
    }
    for (const el of objects) {
      if (el.hasAttribute('data-vitrina-revealed')) continue;
      expect(el.style.opacity).toBe('0');
      expect(el.style.pointerEvents).toBe('none');
      expect(el.tabIndex).toBe(-1);
    }

    await act(async () => root.unmount());
  });

  it('zoom steps: the DOM tracks framePass at every step, reveal is permanent, off-frame revealed objects leave the tab order — measuring nothing', async () => {
    stubs.prefersReduced = true;
    // Wide steps so zooming in really pushes revealed objects out of frame.
    const { host, root } = await mountStrict({
      props: { zoomSteps: [0.5, 1, 2], defaultZoomIndex: 1 },
      children: <Probe />,
    });
    const objects = objectsOf(host);
    const placed = generateInstances(entities, DEFAULT_LAYOUT);
    const view = { w: VIEW.width, h: VIEW.height };
    const pan = centerPan(DEFAULT_LAYOUT.world, view); // zoom-invariant: no re-clamp at any step
    const ids = (els: Element[]) => els.map(idOf).sort();
    const measuredBefore = stubs.measure.mock.calls.length;

    const revealedAt1 = new Set(ids(revealedOf(objects)));
    expect(revealedAt1.size).toBeGreaterThan(0);

    // 1 → 0.5: a wider frame; the new arrivals are exactly what the pass predicts.
    act(() => api?.zoomOut());
    const predictedOut = framePass(placed, view, pan, 0.5, REVEAL_INSET, revealedAt1);
    expect(predictedOut.entering.length).toBeGreaterThan(0);
    const revealedAtHalf = ids(revealedOf(objects));
    expect(revealedAtHalf).toEqual([...revealedAt1, ...predictedOut.entering].sort());
    // At rest, everything revealed is in frame ⇒ tabbable.
    expect(ids(tabbableOf(objects))).toEqual(revealedAtHalf);

    // 0.5 → 1 → 2: nothing un-reveals; the tab order is the pass's focusable set.
    const revealedSet = new Set(revealedAtHalf);
    for (const zoom of [1, 2]) {
      act(() => api?.zoomIn());
      expect(ids(revealedOf(objects))).toEqual(revealedAtHalf);
      const predicted = framePass(placed, view, pan, zoom, REVEAL_INSET, revealedSet);
      expect(predicted.entering).toEqual([]); // nested frames: nothing new at a tighter zoom
      expect(ids(tabbableOf(objects))).toEqual([...predicted.focusable].sort());
    }
    // …and at 2 the scenario is not vacuous: some revealed objects sit outside the frame, still visible.
    const tabbableAt2 = tabbableOf(objects);
    expect(tabbableAt2.length).toBeLessThan(revealedAtHalf.length);
    expect(tabbableAt2.length).toBeGreaterThan(0);
    for (const el of revealedOf(objects)) expect(el.style.opacity).toBe('1');

    // The pass measured nothing: no object, no viewport. What a zoom click does
    // measure (a handful of layer DIVs) is GSAP's Draggable re-applying its
    // bounds — once per click, never per frame, never an object.
    const measuredSince = stubs.measure.mock.contexts.slice(measuredBefore) as Element[];
    expect(
      measuredSince.filter(
        (el) => el.hasAttribute('data-vitrina-object') || el.hasAttribute('data-vitrina-viewport'),
      ),
    ).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it('renderObject sees isRevealed flip once a batch lands', async () => {
    stubs.prefersReduced = true;
    const seen = new Map<string, boolean>();
    const renderObject = vi.fn((_: unknown, ctx: VitrinaObjectContext) => {
      seen.set(ctx.instanceId, ctx.isRevealed);
      return null;
    });
    const { host, root } = await mountStrict({ props: { renderObject } });
    const objects = objectsOf(host);
    const revealedIds = new Set(revealedOf(objects).map(idOf));
    expect(revealedIds.size).toBeGreaterThan(0);

    for (const [id, isRevealed] of seen) expect(isRevealed).toBe(revealedIds.has(id));

    await act(async () => root.unmount());
  });
});

describe('reveal + tab order with motion', () => {
  afterEach(() => {
    gsap.globalTimeline.resume();
  });

  it('an object whose pop has not started is not tabbable; its pop starting makes it so', async () => {
    const { host, root } = await mountStrict({
      props: { zoomSteps: [0.5, 1], defaultZoomIndex: 1 },
      children: <Probe />,
    });
    const objects = objectsOf(host);
    const isPop = (t: gsap.core.Tween | gsap.core.Timeline): t is gsap.core.Tween =>
      t instanceof gsap.core.Tween &&
      t.targets().some((x: unknown) => x instanceof HTMLButtonElement && x.hasAttribute('data-vitrina-object'));
    const popsOf = () => gsap.globalTimeline.getChildren(true, true, false).filter(isPop);

    // The intro was queued at mount: one pop per entering object.
    expect(popsOf().length).toBeGreaterThan(0);

    // Freeze GSAP's clock, then zoom out with motion. The zoom tween is created
    // paused-by-ancestor; driving the root clock past its end runs its onUpdate
    // — the pass — which queues a new batch of pops, staggered from that moment.
    // Tweens created during a render are not rendered in that same pass, so
    // every pop in the batch is pending: deterministic, whatever the machine.
    gsap.globalTimeline.pause();
    const popsBefore = popsOf().length;
    act(() => api?.zoomOut());
    const measuredBefore = stubs.measure.mock.calls.length;
    act(() => {
      gsap.globalTimeline.time(gsap.globalTimeline.time() + 1);
    });
    // That was a movement frame (the zoom tween's onUpdate ran the pass): zero measurements.
    expect(stubs.measure.mock.calls.length).toBe(measuredBefore);
    const pending = popsOf().filter((t) => !popsOf().slice(0, popsBefore).includes(t) && t.totalTime() === 0);
    expect(pending.length).toBeGreaterThan(1);

    // The rule: tabbable ⇔ the pop has started. Never a focus ring on opacity 0.
    for (const el of objects) {
      expect(el.tabIndex === 0).toBe(el.hasAttribute('data-vitrina-revealed'));
    }
    for (const t of pending) {
      const el = t.targets()[0] as HTMLButtonElement;
      expect(el.tabIndex).toBe(-1);
      expect(el.style.opacity).toBe('0');
      expect(el.style.pointerEvents).toBe('none');
    }

    // Advance the root clock to just past the earliest pending pop's start: that
    // one starts; the rest (gaps ≥ 30 ms) stay pending.
    const next = pending.reduce((a, b) => (b.startTime() < a.startTime() ? b : a));
    act(() => {
      gsap.globalTimeline.time(next.startTime() + 0.001);
    });
    const el = next.targets()[0] as HTMLButtonElement;
    expect(el.hasAttribute('data-vitrina-revealed')).toBe(true);
    expect(el.tabIndex).toBe(0);
    expect(el.style.pointerEvents).toBe('auto');
    for (const t of pending) {
      if (t === next) continue;
      expect((t.targets()[0] as HTMLButtonElement).tabIndex).toBe(-1);
    }

    await act(async () => root.unmount());
  });
});
