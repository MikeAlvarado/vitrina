// @vitest-environment jsdom
/*
 * Teardown: nothing GSAP survives the plane.
 *
 * It was a property of the design — every tween, Draggable and Observer lives in
 * a context that reverts on cleanup — but a property nobody measures is a
 * promise. This measures it, on every `pnpm check`.
 *
 * Four things are counted, and they are the four this library creates or could
 * come to create: live tweens on the `globalTimeline` (pops, quickTo chasers,
 * inertia throws), ScrollTrigger (none today — counted so one can never sneak in
 * unnoticed), Observer (the wheel), and Draggable, which lives in no global list
 * and has to be asked element by element — so the nodes are collected BEFORE
 * unmounting, after which there is nowhere left to look.
 *
 * Every case first proves that mounting created something. A cleanup test on a
 * component that never animated passes always and proves nothing.
 *
 * What this does NOT say, and cannot from jsdom: that the exit looks right. Feel
 * is a real-browser check on `pnpm preview`.
 */
import { act } from 'react';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Probe,
  currentApi,
  detailOf,
  landTimeline,
  landUntilSettled,
  mountStrict,
  pressEscape,
  renderStrict,
  requirePan,
  resizeSync,
  revealedObjectsOf,
  settle,
  stubDom,
  tweensOn,
} from './harness';
import type { DomStubs } from './harness';

interface LiveAnimations {
  tweens: number;
  scrollTriggers: number;
  observers: number;
}

const NOTHING_LIVE: LiveAnimations = { tweens: 0, scrollTriggers: 0, observers: 0 };

/**
 * Trap: the globalTimeline is never empty once ScrollTrigger has been used — it
 * parks two internal `delayedCall`s there forever. A delayedCall animates a
 * FUNCTION; what this library creates animates elements. Filtering on that
 * leaves GSAP's own bookkeeping out without a brittle allow-list.
 */
function animatesDom(child: gsap.core.Animation): boolean {
  return (
    child instanceof gsap.core.Tween &&
    child.targets().some((target: unknown) => target instanceof Element)
  );
}

/** What GSAP has live NOW, document-wide — an orphan hangs off no React tree, so the container cannot be asked. */
function liveAnimationCount(): LiveAnimations {
  return {
    tweens: gsap.globalTimeline.getChildren(true, true, true).filter(animatesDom).length,
    scrollTriggers: ScrollTrigger.getAll().length,
    observers: Observer.getAll().length,
  };
}

const total = (count: LiveAnimations) => count.tweens + count.scrollTriggers + count.observers;

/** Draggables are in no global list: ask per element (`Draggable.get`), which is exactly what `kill()` clears. */
const liveDraggables = (nodes: Element[]) =>
  nodes.filter((node) => Draggable.get(node) !== undefined).length;

const nodesOf = (container: HTMLElement): Element[] => [container, ...container.querySelectorAll('*')];

/** Every Draggable the library created, dead or alive — `Draggable.get` only ever shows the latest per element. */
let created: Draggable[] = [];
const enabledDraggables = () => created.filter((d) => d.enabled());

let stubs: DomStubs;

beforeEach(() => {
  created = [];
  const realCreate = Draggable.create;
  vi.spyOn(Draggable, 'create').mockImplementation((targets, vars) => {
    const instances = realCreate.call(Draggable, targets, vars);
    created.push(...instances);
    return instances;
  });
  stubs = stubDom();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('teardown — nothing GSAP survives the plane', () => {
  it('StrictMode mount creates exactly one interaction; unmount leaves nothing live', async () => {
    const { host, root } = await mountStrict();
    const pan = requirePan(host);
    const nodes = nodesOf(host);

    // Mounting created something — and the double mount really happened.
    expect(stubs.observersBuilt).toBeGreaterThanOrEqual(2);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(total(liveAnimationCount())).toBeGreaterThan(0);
    expect(liveAnimationCount().tweens).toBeGreaterThan(0); // intro pops + quickTo chasers
    expect(liveDraggables(nodes)).toBe(1);

    // Exactly one of each, after StrictMode's mount → unmount → remount.
    expect(Draggable.get(pan)).toBe(enabledDraggables()[0]);
    expect(enabledDraggables()).toHaveLength(1);
    expect(Observer.getAll()).toHaveLength(1);
    expect(Observer.getAll()[0]?.vars.type).toBe('wheel');

    await act(async () => root.unmount());

    expect(liveAnimationCount()).toEqual(NOTHING_LIVE);
    expect(liveDraggables(nodes)).toBe(0);
    expect(enabledDraggables()).toHaveLength(0);
  });

  it('unmounting before the plugin import resolves leaves nothing live', async () => {
    /*
     * The race the cancellation flag exists for, in its purest form: the cleanup
     * runs while the import's continuation has not executed. Render and unmount
     * are both synchronous `act`s with no await between them, so the `.then`
     * cannot have run — whether the import is still in flight (first test in a
     * fresh process) or already cached (any later run): a continuation is a
     * microtask either way.
     */
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root!: ReturnType<typeof renderStrict>;
    act(() => {
      root = renderStrict(host);
    });
    const nodes = nodesOf(host);

    // The mount got far enough to matter: placement ran and the intro was queued
    // (those are synchronous) — only the plugins were still on their way.
    expect(liveAnimationCount().tweens).toBeGreaterThan(0);
    expect(created).toHaveLength(0);

    act(() => root.unmount());
    await settle();

    // The continuation ran for a mount that no longer exists — and created nothing.
    expect(created).toHaveLength(0);
    expect(liveAnimationCount()).toEqual(NOTHING_LIVE);
    expect(liveDraggables(nodes)).toBe(0);
  });

  it('resizes racing the import leave exactly one interaction, and none after unmount', async () => {
    /*
     * Each synchronous resize re-runs the interaction effect: the previous run's
     * cleanup fires before that run's `.then` continuation has executed, so —
     * without the flag — every run that was ever started would still create its
     * Draggable/Observer once the microtasks flush.
     */
    const { host, root } = await mountStrict();
    const pan = requirePan(host);
    const nodes = nodesOf(host);
    resizeSync(stubs, 1000, 700);
    resizeSync(stubs, 900, 600);
    resizeSync(stubs, 1100, 750);
    await settle();

    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(enabledDraggables()).toHaveLength(1);
    expect(Draggable.get(pan)).toBe(enabledDraggables()[0]);
    expect(Observer.getAll()).toHaveLength(1);

    await act(async () => root.unmount());

    expect(liveAnimationCount()).toEqual(NOTHING_LIVE);
    expect(liveDraggables(nodes)).toBe(0);
  });

  it('toggling plane ↔ grid repeatedly, then unmounting, leaves nothing live', async () => {
    const { host, root } = await mountStrict({ children: <Probe /> });
    const panLayers: Element[] = [];
    const rememberPlane = () => {
      const pan = host.querySelector('[data-vitrina-pan]');
      if (pan) panLayers.push(pan);
    };
    rememberPlane();

    // Let the intro land so there are shown objects to hand to Flip.
    act(() => {
      gsap.globalTimeline.time(gsap.globalTimeline.time() + 5);
    });
    expect(host.querySelectorAll('[data-vitrina-revealed]').length).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      act(() => currentApi().toggleView());
      const inGrid = host.querySelector('[data-vitrina-grid]') !== null;
      expect(inGrid).toBe(i % 2 === 0);
      expect(host.querySelector('[data-vitrina-viewport]') !== null).toBe(!inGrid);
      // Every toggle flies something: the hand-off is a Flip with real tweens.
      expect(liveAnimationCount().tweens).toBeGreaterThan(0);
      if (!inGrid) rememberPlane();
      await settle();
      // Only the CURRENT plane owns a Draggable; every previous one is dead.
      expect(liveDraggables(panLayers)).toBe(inGrid ? 0 : 1);
    }
    expect(panLayers.length).toBe(3);

    await act(async () => root.unmount());

    expect(liveAnimationCount()).toEqual(NOTHING_LIVE);
    expect(liveDraggables(panLayers)).toBe(0);
    expect(enabledDraggables()).toHaveLength(0);
  });

  it('opening, closing, relaying to another, and unmounting mid-flight leaves nothing live', async () => {
    /*
     * Every panel hole filled, each carrying a data-vitrina-line: the lines are
     * what the panel-lifecycle and re-arm contexts tween, so a leak in either
     * shows up here as a surviving Element tween. renderClose adds the fixed
     * region (entrance/exit only), the others the re-arming column.
     */
    const { host, root } = await mountStrict({
      children: <Probe />,
      props: {
        renderAbove: (e) => <div data-vitrina-line="">{`code-${e.id}`}</div>,
        renderBeside: () => <div data-vitrina-line="">rail</div>,
        renderDetail: (e) => <p data-vitrina-line="">{e.id}</p>,
        renderBelow: () => <footer data-vitrina-line="">foot</footer>,
        renderClose: (ctx) => (
          <button type="button" data-vitrina-line="" onClick={ctx.close}>
            ×
          </button>
        ),
      },
    });
    const nodes = nodesOf(host);
    landTimeline();
    // Two revealed objects of DIFFERENT entities (same-entity opens are no-ops).
    const byEntity = new Map<string, HTMLButtonElement>();
    for (const el of revealedObjectsOf(host)) {
      const e = el.getAttribute('data-vitrina-entity') ?? '';
      if (!byEntity.has(e)) byEntity.set(e, el);
    }
    const [first, second] = [...byEntity.values()];
    if (!first || !second) throw new Error('need two revealed objects of different entities');

    // Open and settle: reveal delayedCall, then the fly-in, then shown.
    act(() => first.click());
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    const flightA = detailOf(host).flight;
    if (!flightA) throw new Error('no flight visual');

    // Close (mirror of open): the panel covers first with the object parked above
    // it, then the object flies home. Either way it settles to closed.
    pressEscape();
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();

    // Open another, relay to a different one mid-flight, and unmount with a
    // flight (and the relay) still in the air.
    act(() => second.click());
    // The holes' lines are animated from the click's own commit: held at 0,
    // staggering in behind the wipe — live tweens the unmount must kill.
    const lines = Array.from(document.querySelectorAll('[data-vitrina-line]'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.flatMap(tweensOn).length).toBeGreaterThan(0);
    landTimeline(); // reveal → second flies in
    act(() => first.click()); // parked: second is still mid-flight
    const flightB = detailOf(host).flight;
    const relayB = detailOf(host).relay;
    if (!flightB || !relayB) throw new Error('no flight/relay visual');
    landTimeline(); // second lands → the parked request drains: second relays home
    expect(tweensOn(relayB)).toHaveLength(1);
    // The drained swap re-armed the column's lines: the stagger is live again.
    expect(lines.flatMap(tweensOn).length).toBeGreaterThan(0);
    const flying = [flightA, flightB, relayB, ...nodesOf(host)];
    expect(flying.flatMap(tweensOn).length).toBeGreaterThan(0);

    await act(async () => root.unmount());

    expect(liveAnimationCount()).toEqual(NOTHING_LIVE);
    expect(flying.flatMap(tweensOn)).toHaveLength(0);
    expect(lines.flatMap(tweensOn)).toHaveLength(0);
    expect(liveDraggables(nodes)).toBe(0);
    expect(enabledDraggables()).toHaveLength(0);
  });
});
