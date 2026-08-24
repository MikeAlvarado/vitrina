// @vitest-environment jsdom
/*
 * The COMPOSABLE panel: the library owns the order and where the object lands;
 * the consumer fills the holes. What this file pins:
 *
 *  · the column's order is the library's, always: above → [beside][object] →
 *    detail → below; `besidePlacement` mirrors only the row;
 *  · every hole receives the same context — close(), step(delta), activeId,
 *    view, objectSettled — and objectSettled tracks the machine: false while
 *    the clone travels, true only once the panel's copy is the visible one;
 *  · renderClose mounts in the fixed region: a SIBLING of the card (outside the
 *    scroll container — it can never scroll away) whose lines enter with the
 *    panel but never re-arm on a relay (it is entity-blind);
 *  · `panelSide` stamps the wrapper and can change hot: the open panel keeps
 *    its phase, plays no wipe, and a flight mid-air retargets instead of dying;
 *  · `dismissOn` is explicit: escape only by default; 'outside' closes on
 *    clicks that are neither panel nor object; 'planeDrag' closes on the
 *    Draggable's own drag start;
 *  · `modal` traps focus (and stamps aria-modal); the ≥95%-coverage warning
 *    fires once, in development, only with modal={false}.
 */
import { act } from 'react';
import { Draggable } from 'gsap/Draggable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VitrinaDetailContext, VitrinaProps } from '../src';
import {
  Probe,
  currentApi,
  detailOf,
  landTimeline,
  landUntilSettled,
  mountStrict,
  pressEscape,
  rerender,
  revealedObjectsOf,
  stubDom,
  tweensOn,
} from './harness';
import type { DomStubs } from './harness';

let stubs: DomStubs;
let created: Draggable[] = [];

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

const hidden = (el: HTMLElement | null) => el?.style.visibility === 'hidden';

/** The full set of holes, each tagged so the column's order can be read back. */
const holes: Partial<VitrinaProps> = {
  renderAbove: (e) => <div data-test-above="">{`code-${e.id}`}</div>,
  renderBeside: () => <div data-test-beside="">rail</div>,
  renderDetail: (e) => <p data-test-detail="">{e.id}</p>,
  renderBelow: () => <footer data-test-below="">foot</footer>,
  renderClose: (ctx) => (
    <button type="button" data-test-close="" onClick={ctx.close}>
      ×
    </button>
  ),
};

async function mountOpen(extra: Partial<VitrinaProps> = {}) {
  const mounted = await mountStrict({ children: <Probe />, props: { ...holes, ...extra } });
  landTimeline();
  const revealed = revealedObjectsOf(mounted.host);
  expect(revealed.length).toBeGreaterThan(1);
  return { ...mounted, revealed };
}

describe('the column: order is the library’s, holes are the consumer’s', () => {
  it('renders above → row([beside][object]) → detail → below, as direct children of the flex column', async () => {
    const { host, root, revealed } = await mountOpen();
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);

    const { column, row, slot, fixed, card, panel } = detailOf(host);
    expect(column).not.toBeNull();
    expect(column?.parentElement).toBe(card);
    // The order, non-negotiable — and the holes' nodes are DIRECT children, so
    // a consumer's own flex tricks (margin-top: auto on below) have the column
    // itself to push against.
    const kids = Array.from(column?.children ?? []);
    expect(kids.map((el) => el.getAttribute('data-vitrina-panel-row') !== null || el.tagName)).toEqual([
      'DIV',
      true,
      'DIV',
      'FOOTER',
    ]);
    expect(kids[0]?.hasAttribute('data-test-above')).toBe(true);
    expect(kids[1]).toBe(row);
    expect(kids[2]?.hasAttribute('data-vitrina-detail-content')).toBe(true);
    expect(kids[2]?.querySelector('[data-test-detail]')).not.toBeNull();
    expect(kids[3]?.hasAttribute('data-test-below')).toBe(true);

    // The row, besidePlacement 'start' (default): beside first, then the slot.
    const rowKids = Array.from(row?.children ?? []);
    expect(rowKids).toHaveLength(2);
    expect(rowKids[0]?.hasAttribute('data-test-beside')).toBe(true);
    expect(rowKids[1]).toBe(slot);

    // renderClose is NOT in the column: it lives in the fixed region, a sibling
    // of the card inside the wrapper — outside the scroll container.
    expect(fixed).not.toBeNull();
    expect(fixed?.parentElement).toBe(panel);
    expect(fixed?.previousElementSibling).toBe(card);
    expect(fixed?.querySelector('[data-test-close]')).not.toBeNull();
    expect(column?.querySelector('[data-test-close]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('besidePlacement "end" mirrors only the row; omitted holes leave no empty boxes behind', async () => {
    const { host, root, revealed } = await mountOpen({
      besidePlacement: 'end',
      renderAbove: undefined,
      renderBelow: undefined,
      renderClose: undefined,
    });
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);

    const { column, row, slot, fixed } = detailOf(host);
    const rowKids = Array.from(row?.children ?? []);
    expect(rowKids[0]).toBe(slot);
    expect(rowKids[1]?.hasAttribute('data-test-beside')).toBe(true);
    // No above, no below: the column is row + detail box, nothing else.
    expect(Array.from(column?.children ?? [])).toHaveLength(2);
    // No renderClose → no fixed region at all.
    expect(fixed).toBeNull();

    await act(async () => root.unmount());
  });

  it('every hole receives the same context, and objectSettled tracks the flight end to end', async () => {
    const seen: Record<string, VitrinaDetailContext> = {};
    const grab = (name: string) => (_: unknown, ctx: VitrinaDetailContext) => {
      seen[name] = ctx;
      return null;
    };
    let closeCtx: VitrinaDetailContext | null = null;
    const { host, root } = await mountOpen({
      renderAbove: grab('above'),
      renderBeside: grab('beside'),
      renderDetail: grab('detail'),
      renderBelow: grab('below'),
      renderClose: (ctx) => {
        closeCtx = ctx;
        return <button type="button">×</button>;
      },
    });
    // Two revealed copies of DIFFERENT entities, so the relay is guaranteed a
    // real origin to fly from (step()'s pickOrigin may find the next entity
    // unrevealed and open it settled — legitimate, but not this test).
    const byEntity = new Map<string, HTMLButtonElement>();
    for (const el of revealedObjectsOf(host)) {
      const e = el.getAttribute('data-vitrina-entity') ?? '';
      if (!byEntity.has(e)) byEntity.set(e, el);
    }
    const [origin, second] = [...byEntity.values()] as [HTMLButtonElement, HTMLButtonElement];
    const entityId = origin.getAttribute('data-vitrina-entity') ?? '';

    act(() => origin.click());
    // One context object across all five holes, with the entity the panel is for.
    expect(seen.above).toBe(seen.detail);
    expect(seen.beside).toBe(seen.detail);
    expect(seen.below).toBe(seen.detail);
    expect(closeCtx).toBe(seen.detail);
    expect(seen.detail?.activeId).toBe(entityId);
    expect(seen.detail?.view).toBe('plane');
    // The clone is parked, then flying: the consumer's own copy stays hidden.
    expect(seen.detail?.objectSettled).toBe(false);
    landTimeline(); // reveal → the flight is live
    expect(seen.detail?.objectSettled).toBe(false);
    landUntilSettled(host);
    expect(seen.detail?.objectSettled).toBe(true);

    // A relay (a click on another entity's copy): settled drops while the swap flies.
    act(() => second.click());
    expect(seen.detail?.objectSettled).toBe(false);
    landUntilSettled(host);
    expect(seen.detail?.objectSettled).toBe(true);
    const secondEntity = second.getAttribute('data-vitrina-entity') ?? '';
    expect(currentApi().activeId).toBe(secondEntity);

    // step(delta) relays in `entities` order, circular.
    act(() => seen.detail?.step(1));
    landUntilSettled(host);
    expect(seen.detail?.objectSettled).toBe(true);
    expect(currentApi().activeId).not.toBe(secondEntity);
    expect(seen.detail?.activeId).toBe(currentApi().activeId);

    // Closing lifts the object off the slot: settled is false for the whole exit.
    pressEscape();
    expect(seen.detail?.objectSettled).toBe(false);
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();

    await act(async () => root.unmount());
  });

  it('the fixed region’s lines enter with the panel but never re-arm on a relay; the column’s do', async () => {
    const { host, root } = await mountOpen({
      renderDetail: (e) => <p data-vitrina-line="">{e.id}</p>,
      renderAbove: (e) => <div data-vitrina-line="">{`code-${e.id}`}</div>,
      renderClose: (ctx) => (
        <button type="button" data-vitrina-line="" onClick={ctx.close}>
          ×
        </button>
      ),
    });
    const byEntity = new Map<string, HTMLButtonElement>();
    for (const el of revealedObjectsOf(host)) {
      const e = el.getAttribute('data-vitrina-entity') ?? '';
      if (!byEntity.has(e)) byEntity.set(e, el);
    }
    const [a, b] = [...byEntity.values()];
    act(() => (a as HTMLButtonElement).click());
    landUntilSettled(host);
    const lineIn = (scope: HTMLElement | null) =>
      scope?.querySelector<HTMLElement>('[data-vitrina-line]') ?? null;
    expect(parseFloat(lineIn(detailOf(host).fixed)?.style.opacity ?? '')).toBe(1);
    expect(parseFloat(lineIn(detailOf(host).column)?.style.opacity ?? '')).toBe(1);

    // Relay: the column's lines (above AND detail) are re-held at 0 in the swap
    // commit; the close, entity-blind, does not blink.
    act(() => (b as HTMLButtonElement).click());
    const column = detailOf(host).column;
    const columnLines = Array.from(column?.querySelectorAll<HTMLElement>('[data-vitrina-line]') ?? []);
    expect(columnLines.length).toBe(2);
    for (const line of columnLines) expect(line.style.opacity).toBe('0');
    expect(parseFloat(lineIn(detailOf(host).fixed)?.style.opacity ?? '')).toBe(1);
    landUntilSettled(host);
    for (const line of columnLines) expect(parseFloat(line.style.opacity)).toBe(1);

    await act(async () => root.unmount());
  });
});

describe('panelSide', () => {
  it('defaults to right, stamps the wrapper, and a hot change keeps the panel open with no re-wipe', async () => {
    const { host, root, revealed } = await mountOpen();
    act(() => (revealed[0] as HTMLButtonElement).click());
    expect(detailOf(host).panelSide).toBe('right');
    landUntilSettled(host);

    act(() => rerender(root, { children: <Probe />, props: { ...holes, panelSide: 'left' } }));
    expect(detailOf(host).panelSide).toBe('left');
    expect(detailOf(host).panelPhase).toBe('open');
    expect(detailOf(host).panelAnim).toBe('none'); // the side is not a reopen
    expect(hidden(detailOf(host).slot)).toBe(false);

    await act(async () => root.unmount());
  });

  it('a side change mid-flight retargets the flight instead of killing it, and it still lands', async () => {
    const { host, root, revealed } = await mountOpen();
    const origin = revealed[0] as HTMLButtonElement;
    act(() => origin.click());
    landTimeline(); // reveal → flying in
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);

    act(() => rerender(root, { children: <Probe />, props: { ...holes, panelSide: 'bottom' } }));
    // Retargeted: exactly one live tween on the visual (the old one was
    // reverted, the new one aims at the slot where it now is), origin still
    // lifted, panel still open.
    expect(tweensOn(detailOf(host).flight as Element)).toHaveLength(1);
    expect(hidden(origin)).toBe(true);
    expect(detailOf(host).panelPhase).toBe('open');

    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');
    expect(hidden(detailOf(host).slot)).toBe(false);
    expect(hidden(detailOf(host).flight)).toBe(true);

    await act(async () => root.unmount());
  });
});

describe('dismissOn — an explicit array', () => {
  const clickAt = (el: Element) =>
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

  it('default ["escape"]: outside clicks and plane drags do NOT close', async () => {
    const { host, root, revealed } = await mountOpen();
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);

    clickAt(host.querySelector('[data-vitrina-viewport]') as Element);
    expect(currentApi().detailPhase).toBe('open');
    // The Draggable's own drag-start hook fires; without 'planeDrag' it is inert.
    const drag = created[created.length - 1] as Draggable;
    act(() => (drag.vars.onDragStart as () => void)?.());
    expect(currentApi().detailPhase).toBe('open');

    pressEscape();
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();
    await act(async () => root.unmount());
  });

  it('["outside"]: an outside click closes, an object click switches, Escape no longer closes', async () => {
    const { host, root } = await mountOpen({ dismissOn: ['outside'] });
    const byEntity = new Map<string, HTMLButtonElement>();
    for (const el of revealedObjectsOf(host)) {
      const e = el.getAttribute('data-vitrina-entity') ?? '';
      if (!byEntity.has(e)) byEntity.set(e, el);
    }
    const [a, b] = [...byEntity.values()];
    act(() => (a as HTMLButtonElement).click());
    landUntilSettled(host);

    // Escape is not in the array: nothing happens.
    pressEscape();
    expect(currentApi().detailPhase).toBe('open');

    // A click on ANOTHER object is a switch, never a dismissal.
    act(() => (b as HTMLButtonElement).click());
    expect(currentApi().detailPhase).toBe('open');
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    // Clicks INSIDE the panel do not close it.
    clickAt(detailOf(host).card as Element);
    expect(currentApi().detailPhase).toBe('open');

    // A click on the bare plane does.
    clickAt(host.querySelector('[data-vitrina-viewport]') as Element);
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();

    await act(async () => root.unmount());
  });

  it('["planeDrag"]: the drag that starts a pan closes the panel', async () => {
    const { host, root, revealed } = await mountOpen({ dismissOn: ['escape', 'planeDrag'] });
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);
    expect(currentApi().detailPhase).toBe('open');

    const drag = created[created.length - 1] as Draggable;
    act(() => (drag.vars.onDragStart as () => void)?.());
    landUntilSettled(host);
    expect(detailOf(host).layer).toBeNull();

    await act(async () => root.unmount());
  });
});

describe('modal and the coverage warning', () => {
  const pressTab = (shift = false) =>
    act(() => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }),
      );
    });

  it('modal traps Tab inside the panel and stamps aria-modal; non-modal does neither', async () => {
    const { host, root, revealed } = await mountOpen({ modal: true });
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);
    const { panel, fixed } = detailOf(host);
    expect(panel?.getAttribute('aria-modal')).toBe('true');

    // The panel's one focusable is the ✕ in the fixed region. From the panel
    // (focused on open), Tab lands on it and cycles there.
    const close = fixed?.querySelector('button') as HTMLButtonElement;
    expect(document.activeElement).toBe(panel);
    pressTab();
    expect(document.activeElement).toBe(close);
    pressTab();
    expect(document.activeElement).toBe(close);
    pressTab(true);
    expect(document.activeElement).toBe(close);

    // Focus escaped somehow (a click on the plane): the next Tab pulls it back.
    const outside = revealedObjectsOf(host)[1] as HTMLButtonElement;
    act(() => outside.focus());
    pressTab();
    expect(document.activeElement).toBe(close);

    await act(async () => root.unmount());
  });

  it('warns ONCE in development when the panel covers ≥95% with modal={false}, never with modal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubs.panel = { width: 1180, height: 790 }; // 0.97 of the 1200×800 root
    const { host, root, revealed } = await mountOpen();
    act(() => (revealed[0] as HTMLButtonElement).click());
    landUntilSettled(host);
    const vitrinaWarnings = () =>
      warn.mock.calls.filter((c) => String(c[0]).includes('[vitrina]')).length;
    expect(vitrinaWarnings()).toBe(1);

    // Close, reopen: still once.
    pressEscape();
    landUntilSettled(host);
    act(() => (revealedObjectsOf(host)[0] as HTMLButtonElement).click());
    landUntilSettled(host);
    expect(vitrinaWarnings()).toBe(1);
    await act(async () => root.unmount());

    // With modal={true} the combination is fine: no warning at all.
    warn.mockClear();
    const second = await mountOpen({ modal: true });
    act(() => (second.revealed[0] as HTMLButtonElement).click());
    landUntilSettled(second.host);
    expect(vitrinaWarnings()).toBe(0);
    await act(async () => second.root.unmount());
  });
});
