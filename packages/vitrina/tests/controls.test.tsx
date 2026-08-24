// @vitest-environment jsdom
/*
 * <VitrinaControls> — the optional chrome — and the three reducedMotion modes.
 *
 * The controls are three buttons over useVitrina(): zoom out, zoom in, view
 * toggle; their text is the consumer's labels (the ONE place the library
 * renders a label string visibly); under the 'grid' lock the strip renders
 * nothing. The reducedMotion modes: 'respect' shows everything at once (no
 * pops) but keeps drag/wheel/zoom/toggle working; 'grid' locks the view;
 * 'ignore' animates with the preference on. The tab-order pass runs identically
 * in all three — focus is not decoration. And will-change is put on and taken
 * off around the zoom tween, never permanent.
 */
import { act } from 'react';
import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VitrinaControls } from '../src';
import { cssDecl } from './css';
import {
  Probe,
  currentApi,
  labels,
  landTimeline,
  mountStrict,
  objectsOf,
  revealedObjectsOf,
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

const controls = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-vitrina-controls]');
const button = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLButtonElement>(`[data-vitrina-${name}]`);

describe('<VitrinaControls>', () => {
  it('renders three buttons named by labels, and drives zoom and view through the api', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({
      children: (
        <>
          <Probe />
          <VitrinaControls />
        </>
      ),
    });
    const strip = controls(host);
    expect(strip).not.toBeNull();
    // Three buttons, no text beyond the labels', no other chrome.
    expect(strip?.querySelectorAll('button')).toHaveLength(3);
    expect(button(host, 'zoom-out')?.textContent).toBe(labels.zoomOut);
    expect(button(host, 'zoom-in')?.textContent).toBe(labels.zoomIn);
    expect(button(host, 'view-toggle')?.textContent).toBe(labels.toGrid);

    // Zoom rides the api; the ends disable their button.
    expect(currentApi().zoomIndex).toBe(1);
    expect(button(host, 'zoom-in')?.disabled).toBe(false);
    act(() => button(host, 'zoom-in')?.click());
    expect(currentApi().zoomIndex).toBe(2);
    expect(button(host, 'zoom-in')?.disabled).toBe(true);
    act(() => button(host, 'zoom-out')?.click());
    act(() => button(host, 'zoom-out')?.click());
    expect(currentApi().zoomIndex).toBe(0);
    expect(button(host, 'zoom-out')?.disabled).toBe(true);

    // The toggle flips the view and renames itself from labels.
    act(() => button(host, 'view-toggle')?.click());
    expect(currentApi().view).toBe('grid');
    expect(host.querySelector('[data-vitrina-grid]')).not.toBeNull();
    expect(button(host, 'view-toggle')?.textContent).toBe(labels.toPlane);

    await act(async () => root.unmount());
  });

  it('sits on its own rung — above the plane, below the panel — and only its buttons take the pointer', async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ children: <VitrinaControls /> });
    const strip = controls(host);

    // The strip belongs to the PLANE, not the panel: base.css gives the
    // container the controls token (no inline z anywhere), and the token's
    // value ranks plane < controls < panel — a dragged object passes BEHIND
    // the buttons, and an open panel covers them where it overlaps.
    expect(cssDecl('[data-vitrina-controls]', 'z-index')).toBe('var(--vitrina-z-controls)');
    expect(strip?.style.zIndex).toBe('');
    const zToken = (name: string) => Number(cssDecl('[data-vitrina-root]', `--vitrina-z-${name}`));
    expect(zToken('plane')).toBeLessThan(zToken('controls'));
    expect(zToken('controls')).toBeLessThan(zToken('panel'));

    // The container eats no pointerdown: none on the box, auto only on the
    // buttons — a drag starting in the gap between them reaches the plane.
    expect(cssDecl('[data-vitrina-controls]', 'pointer-events')).toBe('none');
    expect(cssDecl('[data-vitrina-controls] button', 'pointer-events')).toBe('auto');

    await act(async () => root.unmount());
  });

  it("renders nothing under the 'grid' lock — every one of its buttons would be a no-op", async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({
      props: { reducedMotion: 'grid' },
      children: <VitrinaControls />,
    });
    expect(controls(host)).toBeNull();
    await act(async () => root.unmount());
  });
});

describe('the three reducedMotion modes', () => {
  it("'respect' (default): the root is stamped data-vitrina-reduced, objects appear at once, everything stays interactive", async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ children: <Probe /> });
    expect(host.querySelector('[data-vitrina-root]')?.hasAttribute('data-vitrina-reduced')).toBe(true);
    // No pops: whatever is in frame is already revealed, no timeline to land.
    expect(revealedObjectsOf(host).length).toBeGreaterThan(0);
    // The view toggle and zoom still work — only the motion is gone.
    expect(currentApi().viewLocked).toBe(false);
    act(() => currentApi().zoomIn());
    expect(currentApi().zoomIndex).toBe(2);
    await act(async () => root.unmount());
  });

  it("'ignore': no data-vitrina-reduced, and the reveal still animates with the preference on", async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({ props: { reducedMotion: 'ignore' } });
    expect(host.querySelector('[data-vitrina-root]')?.hasAttribute('data-vitrina-reduced')).toBe(false);
    // Animated reveal: real tweens on the objects (under 'respect' the same
    // query finds none — objects are shown with sets, not animated).
    const objectTweens = gsap.globalTimeline
      .getChildren(true, true, false)
      .filter((t) =>
        t.targets().some((x: unknown) => x instanceof HTMLElement && x.hasAttribute('data-vitrina-object')),
      );
    expect(objectTweens.length).toBeGreaterThan(0);
    landTimeline();
    expect(revealedObjectsOf(host).length).toBeGreaterThan(0);
    await act(async () => root.unmount());
  });

  it("'grid' with the preference stamps the attribute and locks the view", async () => {
    stubs.prefersReduced = true;
    const { host, root } = await mountStrict({
      props: { reducedMotion: 'grid' },
      children: <Probe />,
    });
    expect(host.querySelector('[data-vitrina-root]')?.hasAttribute('data-vitrina-reduced')).toBe(true);
    expect(currentApi().viewLocked).toBe(true);
    expect(host.querySelector('[data-vitrina-grid]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('the tab order is identical across modes: the pass writes tabindex whatever the motion', async () => {
    const tabbables = async (reducedMotion: 'respect' | 'ignore') => {
      stubs.prefersReduced = true;
      const { host, root } = await mountStrict({ props: { reducedMotion } });
      landTimeline(); // a no-op under respect; lands the intro under ignore
      const ids = objectsOf(host)
        .filter((el) => el.tabIndex === 0)
        .map((el) => el.getAttribute('data-vitrina-instance'))
        .sort();
      await act(async () => root.unmount());
      document.body.innerHTML = '';
      return ids;
    };
    const respectIds = await tabbables('respect');
    const ignoreIds = await tabbables('ignore');
    expect(respectIds.length).toBeGreaterThan(0);
    expect(ignoreIds).toEqual(respectIds);
  });
});

describe('will-change: put on, taken off', () => {
  it('nothing is promoted at rest; the zoom tween promotes the zoom layer and the landing demotes it', async () => {
    stubs.prefersReduced = false;
    const { host, root } = await mountStrict({ children: <Probe /> });
    const zoomLayer = host.querySelector<HTMLElement>('[data-vitrina-zoom]');
    const panLayer = host.querySelector<HTMLElement>('[data-vitrina-pan]');
    // At rest, nothing carries will-change — not inline, not from the stylesheet.
    expect(zoomLayer?.style.willChange ?? '').not.toBe('transform');
    expect(panLayer?.style.willChange ?? '').not.toBe('transform');

    act(() => currentApi().zoomIn());
    expect(zoomLayer?.style.willChange).toBe('transform');
    landTimeline();
    expect(zoomLayer?.style.willChange).not.toBe('transform');

    await act(async () => root.unmount());
  });
});
