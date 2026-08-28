// @vitest-environment jsdom
/*
 * What must NOT re-render. The plane mounts one component per instance (114 by
 * default) and each one's subtree is the consumer's `renderObject`, so "who
 * re-renders" is a load-bearing property, not a micro-optimisation: before the
 * objects were memoised, a click on the zoom, a render of the page above the
 * widget, or a batch of reveal pops landing mid-drag re-ran all 114 of them.
 *
 * These are CALL-COUNT assertions, never timings: timings are unstable in CI and
 * prove nothing about the mechanism. What is pinned here is exactly which copies
 * the library asks the consumer to draw again, which is what regresses the day
 * someone adds a prop to the object that is rebuilt every render.
 *
 * NO StrictMode here, deliberately (every other DOM test uses it): StrictMode
 * double-invokes render functions, so every count would be doubled by React
 * rather than by the library, and a regression could hide inside the factor.
 * The teardown/detail tests own the StrictMode contract; this file owns the
 * counts.
 */
import { act, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Vitrina } from '../src';
import type { VitrinaObjectContext, VitrinaProps } from '../src';
import { Probe, currentApi, entities, labels, landTimeline, objectsOf, settle, stubDom } from './harness';
import type { DomStubs } from './harness';

let stubs: DomStubs;

beforeEach(() => {
  stubs = stubDom();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Every ctx `renderObject` was called with, in order. */
type Call = VitrinaObjectContext;

/** Re-renders the tree ABOVE <Vitrina> — a consumer's own state changing. */
let bumpParent: (() => void) | null = null;

function Wrapper({ props }: { props: Partial<VitrinaProps> }) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  bumpParent = force;
  return (
    <Vitrina entities={entities} labels={labels} renderObject={() => null} {...props}>
      <Probe />
    </Vitrina>
  );
}

async function mountPlain(props: Partial<VitrinaProps>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<Wrapper props={props} />);
  });
  await settle();
  return { root, host };
}

/** A recording `renderObject`. Its identity is stable — that is the contract the memo rests on. */
function recorder() {
  const calls: Call[] = [];
  const renderObject: VitrinaProps['renderObject'] = (_entity, ctx) => {
    calls.push({ ...ctx });
    return null;
  };
  return {
    renderObject,
    calls,
    /** The instances re-rendered since the mark — a set, so StrictMode-style repeats cannot inflate it. */
    since: (mark: number) => new Set(calls.slice(mark).map((c) => c.instanceId)),
    mark: () => calls.length,
  };
}

const idOf = (el: Element) => el.getAttribute('data-vitrina-instance') ?? '';
const entityOf = (el: Element) => el.getAttribute('data-vitrina-entity') ?? '';
const revealedIds = (host: HTMLElement) =>
  new Set(objectsOf(host).filter((el) => el.hasAttribute('data-vitrina-revealed')).map(idOf));

describe('the objects re-render only when their own answer changes', () => {
  it('a render of the consumer tree above <Vitrina> reaches no object at all', async () => {
    stubs.prefersReduced = true;
    const rec = recorder();
    const { root, host } = await mountPlain({ renderObject: rec.renderObject });

    // The mount itself drew every object exactly once (no memo can skip that).
    expect(rec.since(0).size).toBe(objectsOf(host).length);

    const mark = rec.mark();
    act(() => bumpParent?.());
    act(() => bumpParent?.());
    // The whole widget re-rendered twice — `children` alone is a new element
    // each time — and not one object was asked to draw itself again.
    expect(rec.since(mark).size).toBe(0);

    await act(async () => root.unmount());
  });

  it('a zoom step re-renders no object: it moves a transform, not the objects', async () => {
    stubs.prefersReduced = true;
    const rec = recorder();
    const { root } = await mountPlain({ renderObject: rec.renderObject });

    const mark = rec.mark();
    // IN, not out: a tighter frame reveals nothing new, so the only thing that
    // changes is the zoom layer's scale — nothing an object renders from.
    act(() => currentApi().zoomIn());
    landTimeline();
    expect(rec.since(mark).size).toBe(0);

    await act(async () => root.unmount());
  });

  it('opening the detail re-renders only the copies of the entity it is about', async () => {
    stubs.prefersReduced = true;
    const rec = recorder();
    const { root, host } = await mountPlain({ renderObject: rec.renderObject });

    const origin = objectsOf(host).find((el) => el.hasAttribute('data-vitrina-revealed'));
    if (!origin) throw new Error('nothing revealed to click');
    const entityId = entityOf(origin);

    const mark = rec.mark();
    act(() => origin.click());
    landTimeline();

    // `isActive` flips for every copy of that entity, and the clicked one is
    // also hidden for the panel's copy — those, and nothing else. The panel's
    // own copies report under the active instance's id, which is already in the
    // set, so the plane's answer is what this measures.
    const expected = new Set(objectsOf(host).filter((el) => entityOf(el) === entityId).map(idOf));
    expect(expected.size).toBeGreaterThan(1); // several copies, or this proves little
    expect(rec.since(mark)).toEqual(expected);

    await act(async () => root.unmount());
  });

  it('a batch of reveal pops re-renders only the objects that popped', async () => {
    // With motion: the intro pops, then a wider frame pops the next batch. This
    // is the path that used to re-render all 114 objects several times a second
    // in the middle of a drag.
    const rec = recorder();
    const { root, host } = await mountPlain({ renderObject: rec.renderObject });
    landTimeline();

    const before = revealedIds(host);
    const mark = rec.mark();
    // Zoom OUT: a wider frame, so objects that were off-frame enter and pop.
    act(() => currentApi().zoomOut());
    landTimeline();
    landTimeline();

    const after = revealedIds(host);
    const popped = new Set([...after].filter((id) => !before.has(id)));
    expect(popped.size).toBeGreaterThan(0); // otherwise this asserts nothing
    expect(rec.since(mark)).toEqual(popped);

    await act(async () => root.unmount());
  });
});
