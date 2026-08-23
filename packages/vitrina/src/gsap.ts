/*
 * GSAP bootstrap: the one place plugins are registered and the one sanctioned way
 * to run GSAP inside a component.
 *
 * GSAP is a peer dependency, never bundled. The interaction plugins load via
 * dynamic `import()` inside an effect — never at module scope. That is an SSR
 * requirement (the server must be able to import this library without a DOM) and
 * keeps ~21 KB gzip of plugin code off the consumer's critical path.
 */

import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { gsap } from 'gsap';
import type { Draggable } from 'gsap/Draggable';
import type { Flip } from 'gsap/Flip';
import type { Observer } from 'gsap/Observer';

/**
 * The plugin classes the plane needs, handed back from the loader so no component
 * ever imports a plugin module statically (type-only imports are erased).
 */
export interface InteractionPlugins {
  Draggable: typeof Draggable;
  Observer: typeof Observer;
  Flip: typeof Flip;
}

let pluginsPromise: Promise<InteractionPlugins> | null = null;
let plugins: InteractionPlugins | null = null;

/**
 * The plugins if they have already arrived, else null. For code that runs
 * synchronously inside a layout effect and cannot wait — the view Flip, which
 * must read the DOM in the very commit that swaps the views — and degrades to an
 * instant swap on the rare toggle that beats the import.
 */
export const getInteractionPlugins = (): InteractionPlugins | null => plugins;

/**
 * Loads and registers Draggable, InertiaPlugin, and Observer, exactly once no
 * matter how many components call it — the promise is the cache, at module level,
 * so StrictMode's double mount (or any two planes) shares ONE import. That only
 * avoids duplicate work: the mount/unmount race is the caller's to handle, with a
 * cancellation flag checked after the await (see Plane.tsx). InertiaPlugin has no
 * direct call sites; registering it is what makes `inertia: true` work. Flip moves
 * objects between the views (and, later, into the detail panel).
 */
export function loadInteractionPlugins(): Promise<InteractionPlugins> {
  pluginsPromise ??= Promise.all([
    import('gsap/Draggable'),
    import('gsap/InertiaPlugin'),
    import('gsap/Observer'),
    import('gsap/Flip'),
  ]).then(([draggable, inertia, observer, flip]) => {
    gsap.registerPlugin(
      draggable.Draggable,
      inertia.InertiaPlugin,
      observer.Observer,
      flip.Flip,
    );
    plugins = { Draggable: draggable.Draggable, Observer: observer.Observer, Flip: flip.Flip };
    return plugins;
  });
  return pluginsPromise;
}

/** `useLayoutEffect` on the client; `useEffect` during SSR, where there is no layout. */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The one way to run GSAP in a component: a `gsap.context` scoped to `scopeRef`,
 * reverted on cleanup — which kills every tween, Draggable, and Observer created
 * inside and restores the inline styles they touched. If `setup` returns a
 * function, GSAP runs it on revert, AFTER reverting the context's tweens.
 */
export function useGsapContext(
  setup: (ctx: gsap.Context) => void | (() => void),
  scopeRef: RefObject<Element | null>,
  deps: readonly unknown[],
): void {
  useIsomorphicLayoutEffect(() => {
    // gsap.context runs its function DURING construction — the `ctx` binding on
    // the left is still in its temporal dead zone inside, so the callback must use
    // the `self` argument. Referencing `ctx` there passes lint, typecheck, and
    // build, and fails only at hydration.
    const ctx = gsap.context((self) => setup(self), scopeRef.current ?? undefined);
    return () => ctx.revert();
  }, deps);
}
