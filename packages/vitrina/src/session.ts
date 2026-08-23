/*
 * What the plane keeps across its own unmounts.
 *
 * The view toggle unmounts the plane entirely — Flip needs its objects to leave
 * the DOM so the grid's cards can take their place — and coming back must land
 * where the visitor was, with the same objects already revealed and no second
 * intro. Pan changes on every frame of a drag, so this is a ref-like object,
 * never React state: nothing in here may cause a render.
 *
 * Read freely, write through the methods: the writer is the owner. Internal.
 */

import type { Flip } from 'gsap/Flip';

import type { Pan } from './plane/geometry';
import type { VitrinaView } from './types';

/** What the leaving view hands the arriving one, so the objects can Flip between them. */
export interface ViewFlipRecord {
  from: VitrinaView;
  /** Flip's own capture of the leaving objects, matched to the arriving ones by `data-flip-id`. */
  state: Flip.FlipState;
  /** Screen rect of each captured object by instance id — the grid pairs its cards with these. */
  rects: Map<string, DOMRect>;
  /** Screen rect of the viewport at capture: "closest to the centre" needs a centre. */
  viewport: DOMRect;
}

export interface SessionState {
  /** Pan in WORLD units, or null until the plane has been placed once. */
  pan: Pan | null;
  /**
   * Ids the visibility pass has claimed — queued for a pop, or shown. Handed to
   * `framePass` as its revealed set so an id is never re-emitted while it waits
   * its turn in a stagger.
   */
  claimed: Set<string>;
  /** Ids whose pop has started. THIS is the permanent revealed set. */
  shown: Set<string>;
  /** The first batch has popped: later arrivals are reveals, not the intro. */
  introDone: boolean;
  /** Pending Flip hand-off between views, consumed by whichever view mounts next. */
  flip: ViewFlipRecord | null;
}

export interface Session {
  /** Only outside render — it is a ref: effects, callbacks, tween updates. */
  read(): SessionState;
  savePan(pan: Pan): void;
  claim(ids: Iterable<string>): void;
  /** Drops claimed ids that never showed — their pops were reverted before starting. */
  unclaimPending(): void;
  markShown(id: string): void;
  markIntroDone(): void;
  /** Nothing has ever shown: the next batch is the intro again. */
  resetIntro(): void;
  storeFlip(record: ViewFlipRecord | null): void;
  /** Returns the pending hand-off and clears it. */
  takeFlip(): ViewFlipRecord | null;
}

export function createSession(): Session {
  const state: SessionState = {
    pan: null,
    claimed: new Set(),
    shown: new Set(),
    introDone: false,
    flip: null,
  };
  return {
    read: () => state,
    savePan(pan) {
      state.pan = pan;
    },
    claim(ids) {
      for (const id of ids) state.claimed.add(id);
    },
    unclaimPending() {
      for (const id of state.claimed) {
        if (!state.shown.has(id)) state.claimed.delete(id);
      }
    },
    markShown(id) {
      state.shown.add(id);
    },
    markIntroDone() {
      state.introDone = true;
    },
    resetIntro() {
      state.introDone = false;
    },
    storeFlip(record) {
      state.flip = record;
    },
    takeFlip() {
      const record = state.flip;
      state.flip = null;
      return record;
    },
  };
}
