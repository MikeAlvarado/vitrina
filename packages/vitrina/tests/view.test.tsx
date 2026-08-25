// @vitest-environment jsdom
/*
 * The grid view and the toggle. The grid is the plane's list with another
 * layout and no chrome; the toggle is controlled or uncontrolled; under
 * `reducedMotion: 'grid'` with the preference on, the view is locked. What must
 * survive a round trip: the pan and the revealed set — coming back from the
 * grid lands where the visitor was, with the same objects already shown and no
 * second intro. And the hand-off pairs cards with EXACT instance ids.
 */
import { act } from 'react';
import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VitrinaObjectContext } from '../src';
import { cssDecl } from './css';
import {
  Probe,
  currentApi,
  entities,
  labels,
  mountStrict,
  rerender,
  resizeSync,
  settle,
  stubDom,
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

const grid = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-vitrina-grid]');
const viewport = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-vitrina-viewport]');
const cards = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLButtonElement>('[data-vitrina-card]'));
const revealedIds = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[data-vitrina-revealed]'))
    .map((el) => el.getAttribute('data-vitrina-instance'))
    .sort();
const panOf = (host: HTMLElement) => {
  const pan = host.querySelector('[data-vitrina-pan]');
  if (!pan) throw new Error('no pan layer');
  return { x: gsap.getProperty(pan, 'x') as number, y: gsap.getProperty(pan, 'y') as number };
};

describe('grid view', () => {
  it('renders one card per entity and nothing else: no chrome, no copy, both overflow axes set', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ props: { defaultView: 'grid' } });
    const region = grid(host);
    expect(region).not.toBeNull();
    expect(viewport(host)).toBeNull();
    expect(host.querySelector('[data-vitrina-root]')?.getAttribute('data-vitrina-view')).toBe('grid');
    expect(region?.getAttribute('aria-label')).toBe(labels.grid);

    const all = cards(host);
    expect(all).toHaveLength(entities.length);
    expect(all.map((c) => c.getAttribute('data-vitrina-entity'))).toEqual(entities.map((e) => e.id));
    // Every card is in the tab order, revealed in the plane or not.
    for (const card of all) {
      expect(card.tabIndex).toBe(0);
      expect(card.getAttribute('aria-label')).toBe(labels.objectLabel({ id: card.getAttribute('data-vitrina-entity') ?? '' }));
    }
    // The only text is what renderObject rendered.
    expect(region?.textContent).toBe(entities.map((e) => e.id).join(''));

    // Decoupled overflow axes (base.css owns the structure since step 7): a
    // native scroll-into-view can never hand it a scrollLeft.
    expect(cssDecl('[data-vitrina-grid]', 'overflow-y')).toBe('auto');
    expect(cssDecl('[data-vitrina-grid]', 'overflow-x')).toBe('hidden');
    expect(cssDecl('[data-vitrina-grid]', 'scrollbar-gutter')).toBe('stable');

    await act(async () => root.unmount());
  });
});

describe("the grid's composition holes", () => {
  /*
   * The grid is the accessible alternative to the plane — and the default view
   * under `reducedMotion: 'grid'`, so for a visitor who cannot take the plane it
   * is the whole catalogue. A grid of unnamed objects tells that visitor
   * nothing, hence two holes of the library's own.
   *
   * What must hold structurally: the caption is a SIBLING of the object's
   * button, never inside it. The button measures the fixed cell and is the
   * element that Flips to and from the plane — a caption inside it would sit on
   * the object and travel with it.
   */
  it('renderCard mounts inside every card, beside the object button and outside the flying element', async () => {
    stubs.prefersReduced = true;
    // Keyed by entity, not appended: StrictMode renders twice and the question
    // here is what each card was handed, not how many passes React made.
    const seen = new Map<string, VitrinaObjectContext>();
    const { host, root } = await mountStrict({
      props: {
        defaultView: 'grid',
        renderCard: (entity, ctx) => {
          seen.set(entity.id, ctx);
          return <p data-test-card="">{`name:${entity.id}`}</p>;
        },
      },
    });

    const items = Array.from(host.querySelectorAll<HTMLElement>('[data-vitrina-grid-item]'));
    expect(items).toHaveLength(entities.length);
    // One card's content per entity, in entity order, each inside its own item.
    const contents = Array.from(host.querySelectorAll<HTMLElement>('[data-vitrina-card-content]'));
    expect(contents).toHaveLength(entities.length);
    expect(contents.map((el) => el.textContent)).toEqual(entities.map((e) => `name:${e.id}`));

    for (const [i, item] of items.entries()) {
      const entity = entities[i]!;
      const button = item.querySelector<HTMLButtonElement>('[data-vitrina-card]');
      const content = item.querySelector<HTMLElement>('[data-vitrina-card-content]');
      expect(button?.getAttribute('data-vitrina-entity')).toBe(entity.id);
      // Sibling of the button, not a descendant: the Flip element carries only
      // the object, so the caption cannot travel into the plane with it.
      expect(content?.parentElement).toBe(item);
      expect(button?.contains(content ?? null)).toBe(false);
      expect(button?.textContent).toBe(entity.id); // renderObject's output alone
      // The button is still the flight's element, and still the only control.
      expect(button?.getAttribute('data-flip-id')).toBe(`${entity.id}-1`);
      expect(item.querySelectorAll('button')).toHaveLength(1);
    }

    // The ctx is the object's, once per ENTITY — the grid lists what exists.
    expect([...seen.keys()]).toEqual(entities.map((e) => e.id));
    expect([...seen.values()].map((ctx) => ctx.instanceId)).toEqual(entities.map((e) => `${e.id}-1`));
    expect(
      [...seen.values()].every((ctx) => ctx.view === 'grid' && ctx.isRevealed && !ctx.isActive),
    ).toBe(true);

    await act(async () => root.unmount());
  });

  it('renderCard sees isActive while the panel is about its entity', async () => {
    stubs.prefersReduced = true;
    const active = new Set<string>();
    const { root } = await mountStrict({
      props: {
        defaultView: 'grid',
        renderCard: (entity, ctx) => {
          if (ctx.isActive) active.add(entity.id);
          return null;
        },
      },
      children: <Probe />,
    });
    active.clear();
    act(() => currentApi().openDetail('e3'));
    expect([...active]).toEqual(['e3']);

    active.clear();
    act(() => currentApi().closeDetail());
    expect([...active]).toEqual([]);

    await act(async () => root.unmount());
  });

  it('renderGridHeader mounts INSIDE the scroll container, above the cards — where children cannot', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({
      props: {
        defaultView: 'grid',
        renderGridHeader: () => <h2 data-test-header="">24 objects</h2>,
      },
      children: <p data-test-child="">chrome</p>,
    });

    const region = grid(host);
    const header = host.querySelector<HTMLElement>('[data-vitrina-grid-header]');
    expect(header?.parentElement).toBe(region);
    expect(header?.textContent).toBe('24 objects');
    // First child of the container, before every card: it scrolls WITH them.
    expect(region?.firstElementChild).toBe(header);
    const firstItem = host.querySelector('[data-vitrina-grid-item]');
    expect(header).not.toBeNull();
    expect(firstItem).not.toBeNull();
    // …and every card comes after it in document order.
    const order = header!.compareDocumentPosition(firstItem!);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The contrast that justifies the hole: `children` is a sibling of the view,
    // outside the box that scrolls.
    const child = host.querySelector('[data-test-child]');
    expect(region?.contains(child)).toBe(false);

    await act(async () => root.unmount());
  });

  it('both holes are grid-only, and with neither the grid renders exactly what it always did', async () => {
    stubs.prefersReduced = true;
    const renderCard = vi.fn(() => <span>caption</span>);
    const renderGridHeader = vi.fn(() => <h2>heading</h2>);
    const { host, root } = await mountStrict({
      props: { defaultView: 'plane', renderCard, renderGridHeader },
      children: <Probe />,
    });
    expect(renderCard).not.toHaveBeenCalled();
    expect(renderGridHeader).not.toHaveBeenCalled();
    expect(host.querySelector('[data-vitrina-card-content]')).toBeNull();

    // …and with the holes empty, the grid adds no node and no text of its own.
    act(() => rerender(root, { props: { defaultView: 'plane', view: 'grid' }, children: <Probe /> }));
    const region = grid(host);
    expect(region?.querySelector('[data-vitrina-grid-header]')).toBeNull();
    expect(region?.querySelector('[data-vitrina-card-content]')).toBeNull();
    expect(region?.textContent).toBe(entities.map((e) => e.id).join(''));

    await act(async () => root.unmount());
  });
});

describe('the toggle', () => {
  it('uncontrolled: defaultView, setView and toggleView drive the view; onViewChange reports each change', async () => {
    stubs.prefersReduced = true;
    const onViewChange = vi.fn();
    const { host, root } = await mountStrict({ props: { onViewChange }, children: <Probe /> });
    expect(currentApi().view).toBe('plane');
    expect(currentApi().viewLocked).toBe(false);

    act(() => currentApi().toggleView());
    expect(grid(host)).not.toBeNull();
    expect(currentApi().view).toBe('grid');
    expect(onViewChange).toHaveBeenLastCalledWith('grid');

    act(() => currentApi().setView('grid')); // no-op: same view
    expect(onViewChange).toHaveBeenCalledTimes(1);

    act(() => currentApi().setView('plane'));
    expect(viewport(host)).not.toBeNull();
    expect(onViewChange).toHaveBeenLastCalledWith('plane');
    expect(onViewChange).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('controlled: the view prop wins; the toggle only reports', async () => {
    stubs.prefersReduced = true;
    const onViewChange = vi.fn();
    const { host, root } = await mountStrict({ props: { view: 'grid', onViewChange }, children: <Probe /> });
    expect(grid(host)).not.toBeNull();

    act(() => currentApi().toggleView());
    expect(onViewChange).toHaveBeenCalledWith('plane');
    expect(grid(host)).not.toBeNull(); // the parent did not update the prop
    expect(currentApi().view).toBe('grid');

    act(() => rerender(root, { props: { view: 'plane', onViewChange }, children: <Probe /> }));
    await settle();
    expect(viewport(host)).not.toBeNull();
    expect(currentApi().view).toBe('plane');

    await act(async () => root.unmount());
  });

  it("reducedMotion 'grid' with the preference on locks the grid: no toggle, no zoom", async () => {
    stubs.prefersReduced = true;
    const onViewChange = vi.fn();
    const { host, root } = await mountStrict({
      props: { reducedMotion: 'grid', defaultView: 'plane', onViewChange },
      children: <Probe />,
    });
    expect(grid(host)).not.toBeNull();
    expect(currentApi().view).toBe('grid');
    expect(currentApi().viewLocked).toBe(true);

    const zoomIndex = currentApi().zoomIndex;
    act(() => currentApi().toggleView());
    act(() => currentApi().setView('plane'));
    act(() => currentApi().zoomIn());
    act(() => currentApi().zoomOut());
    act(() => currentApi().setZoomIndex(0));
    expect(grid(host)).not.toBeNull();
    expect(onViewChange).not.toHaveBeenCalled();
    expect(currentApi().zoomIndex).toBe(zoomIndex);

    await act(async () => root.unmount());
  });

  it("reducedMotion 'grid' without the preference is just the plane", async () => {
    stubs.prefersReduced = false;
    const { host, root } = await mountStrict({ props: { reducedMotion: 'grid' }, children: <Probe /> });
    expect(viewport(host)).not.toBeNull();
    expect(currentApi().viewLocked).toBe(false);
    await act(async () => root.unmount());
  });
});

describe('what survives the round trip', () => {
  it('pan and the revealed set come back intact, with no second intro', async () => {
    stubs.prefersReduced = true; // instant reveal: the sets are fully observable
    const seen = new Map<string, boolean>();
    const renderObject = vi.fn((_: unknown, ctx: VitrinaObjectContext) => {
      if (ctx.view === 'plane') seen.set(ctx.instanceId, ctx.isRevealed);
      return null;
    });
    const { host, root } = await mountStrict({
      props: { renderObject, zoomSteps: [0.5, 1], defaultZoomIndex: 1 },
      children: <Probe />,
    });

    // A pan that is NOT the centering pan of the current viewport: the plane keeps
    // its travelled pan across a resize, so the centre of 1200×800 is off-centre
    // for 1000×700.
    resizeSync(stubs, 1000, 700);
    await settle();
    act(() => currentApi().zoomOut());
    const pan = panOf(host);
    expect(pan).toEqual({ x: 600 - 4645 / 2, y: 400 - 3044 / 2 });
    const revealed = revealedIds(host);
    expect(revealed.length).toBeGreaterThan(2);

    act(() => currentApi().toggleView());
    expect(grid(host)).not.toBeNull();
    seen.clear();
    act(() => currentApi().toggleView());
    await settle();

    expect(viewport(host)).not.toBeNull();
    expect(panOf(host)).toEqual(pan);
    expect(revealedIds(host)).toEqual(revealed);
    // renderObject saw them as revealed from the very first render back.
    for (const id of revealed) expect(seen.get(id ?? '')).toBe(true);
    // …and nothing that was hidden came back revealed.
    for (const [id, isRevealed] of seen) expect(isRevealed).toBe(revealed.includes(id));

    await act(async () => root.unmount());
  });

  it('the hand-off pairs each card with a shown instance of its own entity, by exact id', async () => {
    stubs.prefersReduced = false;
    const { host, root } = await mountStrict({ children: <Probe /> });
    // Land the intro so some objects are shown.
    act(() => {
      gsap.globalTimeline.time(gsap.globalTimeline.time() + 5);
    });
    const shownBefore = new Set(revealedIds(host));
    expect(shownBefore.size).toBeGreaterThan(0);
    const shownEntities = new Set(
      Array.from(host.querySelectorAll('[data-vitrina-revealed]')).map((el) =>
        el.getAttribute('data-vitrina-entity'),
      ),
    );

    act(() => currentApi().toggleView());
    const all = cards(host);
    let paired = 0;
    for (const card of all) {
      const entity = card.getAttribute('data-vitrina-entity') ?? '';
      const flipId = card.getAttribute('data-flip-id') ?? '';
      expect(flipId.startsWith(`${entity}-`)).toBe(true); // its own entity, an instance id
      if (shownEntities.has(entity)) {
        expect(shownBefore.has(flipId)).toBe(true); // a shown instance, exactly
        paired++;
      }
    }
    expect(paired).toBe(shownEntities.size);
    // The flight exists: Flip tweens on the cards.
    const flying = gsap.globalTimeline
      .getChildren(true, true, false)
      .filter((t) => t.targets().some((x: unknown) => x instanceof HTMLElement && x.hasAttribute('data-vitrina-card')));
    expect(flying.length).toBeGreaterThan(0);

    // Back: the same objects are shown, and Flip flies them from the cards.
    act(() => currentApi().toggleView());
    expect(new Set(revealedIds(host))).toEqual(shownBefore);
    const flyingBack = gsap.globalTimeline
      .getChildren(true, true, false)
      .filter((t) => t.targets().some((x: unknown) => x instanceof HTMLElement && x.hasAttribute('data-vitrina-revealed')));
    expect(flyingBack.length).toBeGreaterThan(0);
    await settle();

    await act(async () => root.unmount());
  });
});
