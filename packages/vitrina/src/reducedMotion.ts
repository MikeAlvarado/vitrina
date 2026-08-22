import { useSyncExternalStore } from 'react';

/*
 * Resolved as a live subscription, not a one-time read: flipping the OS setting
 * mid-session re-renders and rebuilds the interaction with the right physics.
 * SSR-safe: `window` is only touched inside subscribe/snapshot, which never run on
 * the server — the server snapshot reports "no preference" so the static HTML is
 * identical for everyone and corrects itself on hydrate.
 */
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const snapshot = (): boolean => window.matchMedia(REDUCE_QUERY).matches;
const serverSnapshot = (): boolean => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
