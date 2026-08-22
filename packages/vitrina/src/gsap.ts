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
import type { Observer } from 'gsap/Observer';

/**
 * The plugin classes the plane needs, handed back from the loader so no component
 * ever imports a plugin module statically (type-only imports are erased).
 */
export interface InteractionPlugins {
  Draggable: typeof Draggable;
  Observer: typeof Observer;
}

let pluginsPromise: Promise<InteractionPlugins> | null = null;

/**
 * Loads and registers Draggable, InertiaPlugin, and Observer, exactly once no
 * matter how many components call it — the promise is the cache. InertiaPlugin
 * has no direct call sites; registering it is what makes `inertia: true` work.
 * Flip joins this list when the grid toggle and the detail flight need it.
 */
export function loadInteractionPlugins(): Promise<InteractionPlugins> {
  pluginsPromise ??= Promise.all([
    import('gsap/Draggable'),
    import('gsap/InertiaPlugin'),
    import('gsap/Observer'),
  ]).then(([draggable, inertia, observer]) => {
    gsap.registerPlugin(draggable.Draggable, inertia.InertiaPlugin, observer.Observer);
    return { Draggable: draggable.Draggable, Observer: observer.Observer };
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
