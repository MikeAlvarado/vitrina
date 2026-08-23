// @vitest-environment jsdom
/*
 * The detail — panel container + object machine — wired to the DOM. The machine
 * itself is pinned in machine.test.ts; this checks what the root DOES with it:
 *
 *  · the panel is uncovered ONCE and covered ONCE, and does NOT move while the
 *    active object changes underneath it (the decoupling);
 *  · exactly one copy of the active object is visible at every step (plane while
 *    it waits/returns, flight while it flies, panel once shown);
 *  · no frame shows two copies of the SAME object — serialize relays one at a
 *    time, crossfade flies two of DIFFERENT entities;
 *  · the flight is a real tween on the fixed visual with the measured geometry;
 *  · the panel is a shell (dialog named by objectLabel, no text beyond
 *    renderDetail's, scroll+mask on the card not the wrapper, z-index on layers);
 *  · Escape closes and focus returns to the EXACT origin; controlled activeId
 *    follows the same machine.
 *
 * Motion is driven by hand on the global timeline (the panel's reveal/cover are
 * `gsap.delayedCall`s there, the flights are tweens). `landTimeline()` fires
 * whatever is due; `landUntilSettled` runs it to a resting state. What jsdom
 * cannot say: that it LOOKS deliberate. Real browser, `pnpm preview`.
 */
import { act } from 'react';
import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VitrinaDetailContext, VitrinaObjectContext } from '../src';
import { DETAIL_LINE_STAGGER_EXIT_SECONDS, DETAIL_PANEL_SECONDS } from '../src/defaults';
import {
  Probe,
  SLOT,
  currentApi,
  detailOf,
  entities,
  labels,
  landTimeline,
  landUntilSettled,
  mountStrict,
  objectsOf,
  pressEscape,
  rerender,
  revealedObjectsOf,
  settle,
  stubDom,
  tweensOn,
} from './harness';
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

const hidden = (el: HTMLElement | null) => el?.style.visibility === 'hidden';
const hiddenObjectsOf = (host: HTMLElement) => objectsOf(host).filter((el) => hidden(el));
const entityOf = (el: Element) => el.getAttribute('data-vitrina-entity') ?? '';
const panelEntity = (host: HTMLElement) => detailOf(host).panel?.getAttribute('aria-label') ?? null;

/** Mounts with motion and lands the intro; returns revealed plane objects. */
async function mountRevealed(extra: Parameters<typeof mountStrict>[0] = {}) {
  const mounted = await mountStrict({ children: <Probe />, ...extra });
  landTimeline();
  const revealed = revealedObjectsOf(mounted.host);
  expect(revealed.length).toBeGreaterThan(1);
  return { ...mounted, revealed };
}

/** Three plane objects of three distinct entities, by id — opens never collapse into no-ops. */
function origins(host: HTMLElement): [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement] {
  const one = (id: string) => {
    const el = host.querySelector<HTMLButtonElement>(`[data-vitrina-object][data-vitrina-entity="${id}"]`);
    if (!el) throw new Error(`no object for ${id}`);
    return el;
  };
  return [one('e0'), one('e1'), one('e2')];
}

/**
 * The "never two copies of one object" invariant. The plane legitimately holds
 * many OTHER instances of an entity; what must never double up is a copy shown in
 * the panel area against its own plane instance. So: at most ONE of slot/flight
 * is visible (one copy of the active object in the panel area), and every hidden
 * set the machine produced is reflected — the callers already assert which
 * instances are hidden, this pins the panel side.
 */
function noDuplicateCopies(host: HTMLElement) {
  const { slot, flight } = detailOf(host);
  const panelCopies = [slot, flight].filter((el) => el && !hidden(el)).length;
  expect(panelCopies).toBeLessThanOrEqual(1);
}

describe('a single open: panel reveals, then the object flies in', () => {
  it('waiting (panel up, clone parked above it) → revealed → in (flight) → shown (panel copy)', async () => {
    const renderDetail = vi.fn(() => <em>detail</em>);
    const { host, root, revealed } = await mountRevealed({ props: { renderDetail } });
    const origin = revealed[0] as HTMLButtonElement;
    const entityId = entityOf(origin);
    expect(detailOf(host).layer).toBeNull();
    expect(currentApi().detailPhase).toBe('idle');

    act(() => origin.click());

    // The panel is up and revealing; the object is PARKED on the flight layer,
    // above the panel, at its origin's box — so the panel never covers it. Its
    // plane instance is hidden, the slot is hidden, and there is no tween yet.
    const { layer, panel, card, slot, flight, flightLayer, relayLayer, content } = detailOf(host);
    expect(detailOf(host).panelPhase).toBe('open');
    expect(detailOf(host).panelAnim).toBe('reveal');
    expect(currentApi().activeId).toBe(entityId);
    expect(hidden(origin)).toBe(true); // lifted to the flight layer, plane copy hidden
    expect(hiddenObjectsOf(host)).toEqual([origin]);
    expect(hidden(slot)).toBe(true);
    expect(hidden(flight)).toBe(false); // the parked clone is what shows
    expect(tweensOn(flight as Element)).toHaveLength(0); // parked, not flying
    // Parked exactly over the origin: identity transform, box = origin's rect
    // (GSAP rounds the px it writes).
    expect(gsap.getProperty(flight as Element, 'x')).toBe(0);
    expect(gsap.getProperty(flight as Element, 'scaleX')).toBe(1);
    expect(Math.abs(parseFloat((flight as HTMLElement).style.left) - parseFloat(origin.style.left))).toBeLessThan(1);

    // The shell: a non-modal dialog named after the entity, focused, its only text
    // the consumer's; pointer-events none on the layers, auto on the panel.
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.hasAttribute('aria-modal')).toBe(false);
    expect(panel?.getAttribute('aria-label')).toBe(labels.objectLabel({ id: entityId }));
    expect(content?.textContent).toBe('detail');
    expect(document.activeElement).toBe(panel);
    expect(layer?.style.pointerEvents).toBe('none');
    expect(flightLayer?.style.pointerEvents).toBe('none');
    expect(relayLayer?.style.pointerEvents).toBe('none');
    expect(panel?.style.pointerEvents).toBe('auto');
    // Stacking scale, all tokens (no bare numbers): the plane on the floor, the
    // panel above it, the flight above the panel. The flight token lives on the
    // PORTAL WRAPPER — the node that competes against the panel in the document's
    // root context — while the inner flight/relay layers carry none.
    const viewport = host.querySelector<HTMLElement>('[data-vitrina-viewport]');
    const flightPortal = document.querySelector<HTMLElement>('[data-vitrina-flight-portal]');
    expect(viewport?.style.zIndex).toContain('var(--vitrina-z-plane');
    expect(layer?.style.zIndex).toContain('var(--vitrina-z-panel');
    expect(flightPortal?.style.zIndex).toContain('var(--vitrina-z-flight');
    expect(flightLayer?.style.zIndex).toBe('');
    expect(relayLayer?.style.zIndex).toBe('');
    // The flying visuals themselves carry no z-index either — ranking never rides
    // on Flip's transient boost.
    expect(flight?.style.zIndex).toBe('');
    expect(detailOf(host).relay?.style.zIndex).toBe('');
    // Scroll + mask on the card, not the wrapper.
    expect(card?.style.overflowY).toBe('auto');
    expect(card?.style.overflowX).toBe('hidden');
    expect(panel?.style.overflowY).toBe('');

    // The reveal delayedCall fires → the object flies into a card that has stopped
    // growing. Now the flight is live and the instance is hidden.
    landTimeline();
    expect(detailOf(host).flight && tweensOn(detailOf(host).flight as Element)).toHaveLength(1);
    expect(hidden(origin)).toBe(true);
    expect(hidden(detailOf(host).flight)).toBe(false);
    const fl = detailOf(host).flight as HTMLElement;
    expect(fl.style.position).toBe('fixed');
    expect(fl.style.left).toBe(`${SLOT.x}px`);
    const originLeft = parseFloat(origin.style.left);
    const originSize = parseFloat(origin.style.width);
    expect(gsap.getProperty(fl, 'x')).toBeCloseTo(originLeft - SLOT.x, 2);
    expect(gsap.getProperty(fl, 'scaleX')).toBeCloseTo(originSize / SLOT.size, 3);
    noDuplicateCopies(host);

    // Landed: the panel's copy is the one; instance stays hidden; panel never re-wiped.
    landTimeline();
    expect(currentApi().detailPhase).toBe('open');
    expect(hidden(detailOf(host).slot)).toBe(false);
    expect(hidden(detailOf(host).flight)).toBe(true);
    expect(detailOf(host).slot?.textContent).toBe(entityId);
    noDuplicateCopies(host);

    await act(async () => root.unmount());
  });

  it('the flight layers are portalled to document.body (out of the transformed root), ranked plane < panel < flight, cleaned up on unmount', async () => {
    const { host, root, revealed } = await mountRevealed();
    const origin = revealed[0] as HTMLButtonElement;
    act(() => origin.click());
    landUntilSettled(host);

    // The fix is structural: the flight lives on `body`, OUTSIDE the Vitrina root
    // and its transformed plane layers, so no ancestor stacking context/containing
    // block can trap it beneath the panel. The panel stays inside the root.
    const portal = document.querySelector<HTMLElement>('[data-vitrina-flight-portal]');
    expect(portal).not.toBeNull();
    expect(portal?.parentElement).toBe(document.body);
    expect(host.contains(portal)).toBe(false);
    expect(host.contains(detailOf(host).flight)).toBe(false);
    expect(host.contains(detailOf(host).panel)).toBe(true);
    expect(portal?.style.position).toBe('fixed'); // resolved against the viewport, no transformed ancestor

    // The z-index that decides panel-vs-flight lives on the nodes that actually
    // COMPETE in the document's root stacking context: the panel LAYER (inside the
    // no-context root, so it emerges) and the PORTAL WRAPPER (fixed, on body). The
    // token must sit on those, not on an inner layer that could never escape its
    // parent's level. Assert the token AND its numeric fallback so the ranking
    // holds even with no stylesheet loaded.
    const zVar = (el: HTMLElement | null) => {
      const m = /var\(--vitrina-z-(\w+),\s*(\d+)\)/.exec(el?.style.zIndex ?? '');
      if (!m) throw new Error(`no z token on ${el?.outerHTML.slice(0, 60)}`);
      return { name: m[1], fallback: Number(m[2]) };
    };
    const plane = zVar(host.querySelector<HTMLElement>('[data-vitrina-viewport]'));
    const panel = zVar(detailOf(host).layer);
    const flight = zVar(portal); // the wrapper carries --vitrina-z-flight
    expect([plane.name, panel.name, flight.name]).toEqual(['plane', 'panel', 'flight']);
    expect(plane.fallback).toBeLessThan(panel.fallback);
    // The flight beats the panel from the first frame — this is the whole fix.
    expect(panel.fallback).toBeLessThan(flight.fallback);

    // The inner flight/relay layers and the flying visuals carry NO z-index of
    // their own — the wrapper owns it — so Flip's transient during-flip boost on
    // an element can never reorder anything. And nothing on the plane raises
    // itself: the active object is hidden while its clone flies, never a layer up.
    expect(detailOf(host).flightLayer?.style.zIndex).toBe('');
    expect(detailOf(host).relayLayer?.style.zIndex).toBe('');
    expect(detailOf(host).flight?.style.zIndex).toBe('');
    expect(detailOf(host).relay?.style.zIndex).toBe('');
    for (const el of objectsOf(host)) expect(el.style.zIndex).toBe('');
    expect(hidden(origin)).toBe(true);

    // The portal is removed with the widget — no orphan left on body.
    await act(async () => root.unmount());
    expect(document.querySelector('[data-vitrina-flight-portal]')).toBeNull();
  });

  it('Escape → panel covers FIRST (object floating above it), THEN the object flies home and lands on the plane', async () => {
    const { host, root, revealed } = await mountRevealed();
    const origin = revealed[1] as HTMLButtonElement;
    act(() => origin.click());
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    pressEscape();
    // The mirror of open: the object lifts to the flight layer (above the panel),
    // the panel COVERS — no flight yet, no aterrizaje first.
    expect(detailOf(host).panelPhase).toBe('covering');
    expect(detailOf(host).panelAnim).toBe('cover');
    expect(hidden(detailOf(host).flight)).toBe(false); // floating above, parked
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(0); // not flying yet
    expect(hidden(origin)).toBe(true); // still lifted off the plane
    expect(currentApi().activeId).toBeNull(); // covering: no longer active for chrome
    expect(document.activeElement).not.toBe(origin);
    noDuplicateCopies(host);

    landTimeline(); // cover delayedCall fires → the object flies home
    expect(detailOf(host).panelPhase).toBe('covering'); // stays covered for the trip
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);
    expect(hidden(origin)).toBe(true); // not home yet — still flying, above

    landTimeline(); // flight lands → closed, object back on the plane, loses its z
    expect(detailOf(host).layer).toBeNull();
    expect(currentApi().detailPhase).toBe('idle');
    expect(hidden(origin)).toBe(false); // back on the plane
    expect(document.activeElement).toBe(origin); // exact instance
    expect(hiddenObjectsOf(host)).toHaveLength(0);

    pressEscape(); // nothing open: no-op
    expect(detailOf(host).layer).toBeNull();

    await act(async () => root.unmount());
  });

  it('under reduced motion: no flight, no wipe delay — open at once, focus still returns', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ children: <Probe /> });
    const origin = revealedObjectsOf(host)[0] as HTMLButtonElement;
    expect(detailOf(host).flight).toBeNull();

    act(() => origin.click());
    expect(currentApi().detailPhase).toBe('open');
    expect(hidden(detailOf(host).slot)).toBe(false);
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(0);
    expect(document.activeElement).toBe(detailOf(host).panel);
    expect(hidden(origin)).toBe(true);

    pressEscape();
    expect(detailOf(host).layer).toBeNull();
    expect(hidden(origin)).toBe(false);
    expect(document.activeElement).toBe(origin);

    await act(async () => root.unmount());
  });
});

describe('the panel stays put while the object changes (the decoupling)', () => {
  it('A, then B without closing, then C: the panel reveals ONCE and covers ONCE', async () => {
    const { host, root } = await mountRevealed();
    const [a, b, c] = origins(host);
    const wipes: string[] = [];
    const recordWipe = () => {
      const anim = detailOf(host).panelAnim;
      if (anim && anim !== 'none' && wipes[wipes.length - 1] !== anim) wipes.push(anim);
    };

    act(() => a.click());
    recordWipe();
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    expect(panelEntity(host)).toBe('e0');

    // Swap to B: the panel does NOT re-wipe (anim stays 'none'), stays 'open'.
    act(() => b.click());
    recordWipe();
    expect(detailOf(host).panelPhase).toBe('open');
    expect(detailOf(host).panelAnim).toBe('none');
    expect(panelEntity(host)).toBe('e1'); // content crossed over immediately, no wait
    noDuplicateCopies(host);
    landUntilSettled(host);

    // Swap to C mid or after: still one panel, still 'open', still no wipe.
    act(() => c.click());
    recordWipe();
    expect(detailOf(host).panelPhase).toBe('open');
    expect(detailOf(host).panelAnim).toBe('none');
    noDuplicateCopies(host);
    landUntilSettled(host);
    expect(panelEntity(host)).toBe('e2');

    // Close: covers once.
    act(() => currentApi().closeDetail());
    recordWipe();
    landTimeline();
    recordWipe();
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();

    // Exactly one reveal, at the start, and one cover, at the end.
    expect(wipes).toEqual(['reveal', 'cover']);

    await act(async () => root.unmount());
  });

  it('serialize: A relays home before B flies in — one copy at every step; ends C open, A & B on the plane', async () => {
    const { host, root } = await mountRevealed({ props: { openCollision: 'serialize' } });
    const [a, b, c] = origins(host);

    act(() => a.click());
    landUntilSettled(host);
    expect(panelEntity(host)).toBe('e0');

    // Open B: content is B at once; the SLOT copy is B's, A relays home. B waits on
    // the plane (still visible there) until A lands. One flight at a time.
    act(() => b.click());
    expect(panelEntity(host)).toBe('e1');
    expect(hidden(a)).toBe(true); // A flying home (relay)
    expect(hidden(b)).toBe(false); // B still on the plane, waiting
    expect(hiddenObjectsOf(host)).toHaveLength(1);
    expect(tweensOn(detailOf(host).relay as Element)).toHaveLength(1);
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(0); // B not flying yet
    noDuplicateCopies(host);

    // C during the relay (B still waiting): C is parked. The panel keeps showing B
    // until A's relay lands — serialize never has two objects mid-flight.
    act(() => c.click());
    noDuplicateCopies(host);

    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    expect(panelEntity(host)).toBe('e2'); // C won: it replaced the waiting B
    // A and B are back on the plane; only C's instance is hidden.
    expect(hidden(a)).toBe(false);
    expect(hidden(b)).toBe(false);
    expect(hiddenObjectsOf(host).every((el) => entityOf(el) === 'e2')).toBe(true);

    await act(async () => root.unmount());
  });

  it('crossfade: A and B fly opposite ways at once (two layers, different entities) — no duplicate copies', async () => {
    const { host, root } = await mountRevealed({ props: { openCollision: 'crossfade' } });
    const [a, b, c] = origins(host);

    act(() => a.click());
    landUntilSettled(host);
    expect(panelEntity(host)).toBe('e0');

    // Open B: B flies IN and A relays home AT ONCE. Both visuals live, different
    // entities, both plane instances hidden.
    act(() => b.click());
    expect(panelEntity(host)).toBe('e1');
    expect(hidden(detailOf(host).flight)).toBe(false); // B flying in
    expect(hidden(detailOf(host).relay)).toBe(false); // A flying home
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);
    expect(tweensOn(detailOf(host).relay as Element)).toHaveLength(1);
    // A's instance (relaying home) and B's (flying in) are both hidden on the plane.
    expect(new Set(hiddenObjectsOf(host).map(entityOf))).toEqual(new Set(['e0', 'e1']));
    noDuplicateCopies(host);

    // C during the swap: parked, drains once the slot is clean.
    act(() => c.click());
    noDuplicateCopies(host);

    landUntilSettled(host);
    expect(panelEntity(host)).toBe('e2');
    expect(hidden(a)).toBe(false);
    expect(hidden(b)).toBe(false);
    expect(hiddenObjectsOf(host).every((el) => entityOf(el) === 'e2')).toBe(true);

    await act(async () => root.unmount());
  });
});

describe('the API and the consumer', () => {
  it('openDetail without an origin opens settled; next/prev relay to the showing copy nearest the centre', async () => {
    let ctx: VitrinaDetailContext | null = null;
    const renderDetail = (_: unknown, c: VitrinaDetailContext) => {
      ctx = c;
      return null;
    };
    const { host, root } = await mountRevealed({ props: { renderDetail } });

    act(() => currentApi().openDetail('e3'));
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    expect(currentApi().activeId).toBe('e3');
    expect(hiddenObjectsOf(host)).toHaveLength(0); // no origin: nothing to hide
    expect(panelEntity(host)).toBe('e3');
    expect((ctx as unknown as VitrinaDetailContext).view).toBe('plane');

    act(() => (ctx as unknown as VitrinaDetailContext).next());
    expect(currentApi().activeId).toBe('e4');
    landUntilSettled(host);
    expect(panelEntity(host)).toBe('e4');

    act(() => (ctx as unknown as VitrinaDetailContext).prev());
    landUntilSettled(host);
    expect(currentApi().activeId).toBe('e3');

    // Unknown entity: ignored.
    act(() => currentApi().openDetail('nope'));
    expect(currentApi().activeId).toBe('e3');

    act(() => currentApi().closeDetail());
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    expect(hiddenObjectsOf(host)).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it('controlled activeId: a click only reports; the prop opens from the clicked instance and closes', async () => {
    const onActiveChange = vi.fn();
    const { host, root, revealed } = await mountRevealed({ props: { activeId: null, onActiveChange } });
    const origin = revealed[1] as HTMLButtonElement;
    const entityId = entityOf(origin);

    act(() => origin.click());
    expect(onActiveChange).toHaveBeenCalledWith(entityId);
    expect(detailOf(host).layer).toBeNull(); // the parent has not followed yet
    expect(hidden(origin)).toBe(false);
    expect(currentApi().activeId).toBeNull();

    act(() => rerender(root, { props: { activeId: entityId, onActiveChange }, children: <Probe /> }));
    expect(detailOf(host).panelPhase).toBe('open');
    landTimeline(); // reveal → fly
    expect(hidden(origin)).toBe(true); // flies from the clicked instance
    expect(currentApi().activeId).toBe(entityId);
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    // Escape reports; the prop closing is what actually closes.
    pressEscape();
    expect(onActiveChange).toHaveBeenLastCalledWith(null);
    expect(detailOf(host).panelPhase).toBe('open');
    act(() => rerender(root, { props: { activeId: null, onActiveChange }, children: <Probe /> }));
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    expect(document.activeElement).toBe(origin);

    // A programmatic prop change, no click: open settled, nothing hidden.
    act(() => rerender(root, { props: { activeId: 'e7', onActiveChange }, children: <Probe /> }));
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    expect(hiddenObjectsOf(host)).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it('defaultActiveId mounts open without a flight and without stealing focus', async () => {
    const { root } = await mountStrict({ props: { defaultActiveId: 'e5' }, children: <Probe /> });
    expect(currentApi().detailPhase).toBe('open');
    expect(currentApi().activeId).toBe('e5');
    expect(document.activeElement).toBe(document.body);
    await act(async () => root.unmount());
  });

  it('every copy of the active entity reports isActive — plane instances and the panel copy', async () => {
    const seen = new Map<string, boolean>();
    const renderObject = vi.fn((_: unknown, ctx: VitrinaObjectContext) => {
      seen.set(`${ctx.view}:${ctx.instanceId}:${ctx.isActive}`, true);
      return null;
    });
    const { host, root, revealed } = await mountRevealed({ props: { renderObject } });
    const origin = revealed[0] as HTMLButtonElement;
    const entityId = entityOf(origin);
    seen.clear();
    act(() => origin.click());
    for (const el of objectsOf(host)) {
      const id = el.getAttribute('data-vitrina-instance') ?? '';
      const active = entityOf(el) === entityId;
      expect(seen.has(`plane:${id}:${active}`)).toBe(true);
      expect(seen.has(`plane:${id}:${!active}`)).toBe(false);
    }
    await act(async () => root.unmount());
  });

  it('a view change keeps the panel but drops the flight: nothing hidden in the new view, close falls back to the root', async () => {
    const { host, root, revealed } = await mountRevealed();
    const origin = revealed[0] as HTMLButtonElement;
    act(() => origin.click());
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    act(() => currentApi().toggleView());
    await settle();
    expect(currentApi().view).toBe('grid');
    expect(currentApi().detailPhase).toBe('open'); // panel stayed
    expect(hiddenObjectsOf(host)).toHaveLength(0);
    expect(detailOf(host).panel).not.toBeNull();

    // Nowhere to fly back to: closes, focus inside the root.
    act(() => currentApi().closeDetail());
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-vitrina-root]'));

    // From the grid a card opens too, hidden under the instance it stands for.
    const card = host.querySelector<HTMLButtonElement>('[data-vitrina-card]') as HTMLButtonElement;
    act(() => card.click());
    landTimeline(); // reveal → fly
    expect(hidden(card)).toBe(true);
    expect(hiddenObjectsOf(host)).toEqual([card]);
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    pressEscape();
    landUntilSettled(host);
    expect(document.activeElement).toBe(card);

    await act(async () => root.unmount());
  });

  it('the entity leaving the list abandons the detail', async () => {
    const { host, root, revealed } = await mountRevealed();
    const origin = revealed[0] as HTMLButtonElement;
    const entityId = entityOf(origin);
    act(() => origin.click());
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    const without = entities.filter((e) => e.id !== entityId);
    act(() => rerender(root, { props: { entities: without }, children: <Probe /> }));
    expect(detailOf(host).layer).toBeNull();
    expect(hiddenObjectsOf(host)).toHaveLength(0);

    await act(async () => root.unmount());
  });
});

describe('content lines: data-vitrina-line enters staggered, exits mirrored, gates the unmount', () => {
  /*
   * Five marked blocks, so the exit total ((n − 1) × exit step + line duration)
   * is longer than the wipe alone and the derived unmount is tellable from a
   * hard-coded one. All timings below are the jsdom fallbacks of the CSS
   * variables — the same numbers the component reads.
   */
  const renderLines = () => (
    <div>
      <h3 data-vitrina-line="">a</h3>
      <p data-vitrina-line="">b</p>
      <p data-vitrina-line="">c</p>
      <p data-vitrina-line="">d</p>
      <p data-vitrina-line="">e</p>
    </div>
  );
  const linesOf = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('[data-vitrina-panel] [data-vitrina-line]'));
  /** Jumps the global timeline to an ABSOLUTE time — partial advances, unlike landTimeline's +5. */
  const at = (t: number) => act(() => void gsap.globalTimeline.time(t));

  it('open: lines held at 0 from the click (lazy: false), released after the wipe at multiples of the step, WITH the flight', async () => {
    const { host, root, revealed } = await mountRevealed({ props: { renderDetail: renderLines } });
    const origin = revealed[0] as HTMLButtonElement;
    const t0 = gsap.globalTimeline.time();
    act(() => origin.click());

    // The from-state lands in the click's own commit — never a frame of settled
    // text before the entrance.
    const lines = linesOf(host);
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line.style.opacity).toBe('0');

    // The card uncovers FIRST: while the wipe runs, no line has moved.
    at(t0 + DETAIL_PANEL_SECONDS - 0.05);
    for (const line of linesOf(host)) expect(line.style.opacity).toBe('0');

    // Wipe done: the flight is live AND the lines are entering — together, in
    // document order. Starts at multiples of the step (0.07): at wipe + 0.10 the
    // third line (start 0.14) has not begun, the first two have, in order.
    at(t0 + DETAIL_PANEL_SECONDS + 0.1);
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);
    const [l0, l1, l2] = linesOf(host) as [HTMLElement, HTMLElement, HTMLElement];
    expect(parseFloat(l0.style.opacity)).toBeGreaterThan(parseFloat(l1.style.opacity));
    expect(parseFloat(l1.style.opacity)).toBeGreaterThan(0);
    expect(l2.style.opacity).toBe('0');

    landUntilSettled(host);
    for (const line of linesOf(host)) expect(parseFloat(line.style.opacity)).toBe(1);
    await act(async () => root.unmount());
  });

  it('a relay re-arms the content entrance (the second context): no re-wipe, incoming lines from 0 in the swap commit', async () => {
    const { host, root } = await mountRevealed({ props: { renderDetail: renderLines } });
    const [a, b] = origins(host);
    act(() => a.click());
    landUntilSettled(host);
    for (const line of linesOf(host)) expect(parseFloat(line.style.opacity)).toBe(1);

    act(() => b.click());
    // The panel itself does not move — no wipe — but the content re-arms: the
    // incoming lines are held at 0 in the very commit the text flips.
    expect(detailOf(host).panelAnim).toBe('none');
    expect(panelEntity(host)).toBe('e1');
    for (const line of linesOf(host)) expect(line.style.opacity).toBe('0');
    landUntilSettled(host);
    for (const line of linesOf(host)) expect(parseFloat(line.style.opacity)).toBe(1);
    await act(async () => root.unmount());
  });

  it('close: exit inverted (last line first, tighter step) and coverDone waits for the REAL exit total, not the wipe', async () => {
    const { host, root, revealed } = await mountRevealed({ props: { renderDetail: renderLines } });
    const origin = revealed[0] as HTMLButtonElement;
    act(() => origin.click());
    landUntilSettled(host);

    const t0 = gsap.globalTimeline.time();
    pressEscape();
    expect(detailOf(host).panelPhase).toBe('covering');

    // Inverted stagger: at +0.10 the LAST line (start 0) is already fading, the
    // first (start 4 × 0.04 = 0.16) has not started — its style is untouched.
    at(t0 + 0.1);
    const lines = linesOf(host);
    const last = lines[lines.length - 1] as HTMLElement;
    expect(parseFloat(last.style.opacity)).toBeLessThan(1);
    const first = lines[0] as HTMLElement;
    expect(first.style.opacity === '' || parseFloat(first.style.opacity) === 1).toBe(true);

    // The wipe alone (0.45) is NOT what gates the close: the exit's real total is
    // 4 × 0.04 + 0.45 = 0.61, so past the wipe the object still floats, parked.
    at(t0 + DETAIL_PANEL_SECONDS + 0.05);
    expect(detailOf(host).panelPhase).toBe('covering');
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(0);

    // Past the last line's end, coverDone releases the flight home.
    at(t0 + 4 * DETAIL_LINE_STAGGER_EXIT_SECONDS + DETAIL_PANEL_SECONDS + 0.05);
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);

    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    expect(document.activeElement).toBe(origin);
    await act(async () => root.unmount());
  });

  it('without any data-vitrina-line the timings collapse to the wipe alone', async () => {
    const { host, root, revealed } = await mountRevealed();
    const origin = revealed[0] as HTMLButtonElement;
    act(() => origin.click());
    landUntilSettled(host);
    const t0 = gsap.globalTimeline.time();
    pressEscape();
    act(() => void gsap.globalTimeline.time(t0 + DETAIL_PANEL_SECONDS + 0.05));
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1); // coverDone at the wipe
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    await act(async () => root.unmount());
  });

  it('reduced motion: lines never animate — no held opacity, open and close settle at once', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ props: { renderDetail: renderLines }, children: <Probe /> });
    const origin = revealedObjectsOf(host)[0] as HTMLButtonElement;
    act(() => origin.click());
    expect(currentApi().detailPhase).toBe('open');
    for (const line of linesOf(host)) {
      expect(line.style.opacity).toBe('');
      expect(tweensOn(line)).toHaveLength(0);
    }
    pressEscape();
    expect(detailOf(host).layer).toBeNull(); // no exit total to wait out
    await act(async () => root.unmount());
  });
});
