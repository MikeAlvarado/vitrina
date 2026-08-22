import { createContext, useContext } from 'react';
import type { VitrinaApi } from './types';

/** Internal: the provider lives inside `<Vitrina>`; consumers read via `useVitrina()`. */
export const VitrinaContext = createContext<VitrinaApi | null>(null);

/**
 * The library's state, for building chrome on. The library renders no buttons —
 * chrome is opt-in — so this hook is how zoom (and, in later steps, view and the
 * active item) gets triggered. Resolves only under `<Vitrina>`: pass controls as
 * its children.
 */
export function useVitrina(): VitrinaApi {
  const api = useContext(VitrinaContext);
  if (api === null) {
    throw new Error('useVitrina() must be called from a descendant of <Vitrina> — pass controls as its children');
  }
  return api;
}
