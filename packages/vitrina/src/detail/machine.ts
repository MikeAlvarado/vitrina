/*
 * The detail as TWO decoupled lifecycles. PURE: no React, no GSAP, no DOM.
 *
 * The panel is the container for "there is something active"; the object that
 * flies is the content. While something stays active the container does not
 * move — it is uncovered ONCE (nothing active → active) and covered ONCE
 * (active → nothing). Switching the active object never touches it: no
 * re-cover, no re-reveal, no resize jump.
 *
 *   panel:  closed ──▶ open ──▶ covering ──▶ closed
 *                       ▲__________|  (reopen mid-cover)
 *
 * The state machine governs the OBJECT, not the panel: where the active object
 * sits relative to the slot, and how one object is relayed out for the next.
 *
 *   flight: waiting ─▶ in ─▶ shown ─▶ out
 *
 *   · waiting — active, not yet flying, for one of two reasons that place it
 *     DIFFERENTLY (see `activeCopy`): on a FIRST open it is lifted onto the flight
 *     layer at once — parked over its origin, ABOVE the panel — so the panel
 *     wiping open behind it never covers it, and it flies when `revealed` fires;
 *     on a serialize relay it genuinely sits ON THE PLANE (visible there) until
 *     the outgoing object has flown home (`relayLanded`).
 *   · in      — flying plane → slot.
 *   · shown   — settled in the slot: the one visible copy is the panel's.
 *   · out     — flying slot → plane (closing).
 *
 * `relaying` is the PREVIOUS object flying home while the next takes its place —
 * a second flight layer, always a different entity from the active one, so no
 * frame ever shows two copies of the same object. `openCollision` decides only
 * how a relay runs inside an ALREADY-OPEN panel:
 *
 *   · serialize — the outgoing flies home FIRST (active waits), then the new one
 *     flies in. One copy visible at any moment.
 *   · crossfade — both fly at once, opposite directions. Two layers.
 *   · none      — no flight and no relay: the outgoing is back on the plane and
 *     the incoming is in the slot in the SAME commit. `flight` goes straight to
 *     `shown`, `relaying` stays null (a relay with no flight would leave a
 *     `relayLanded` nobody ever fires).
 *
 * The initial open's choreography is a machine fact, not a timer: the object is
 * `waiting` while the panel reveals, and flies in only once `revealed` fires —
 * it lands in a card that has already stopped growing.
 */

export type PanelPhase = 'closed' | 'open' | 'covering';
/*
 * The object's phases, and the open/close symmetry that keeps the flight above
 * the panel at both ends:
 *   waiting — parked on the flight layer at the ORIGIN while the panel reveals;
 *   in      — flying origin → slot;
 *   shown   — settled in the slot (the panel's copy is the visible one);
 *   leaving — parked on the flight layer at the SLOT while the panel COVERS (the
 *             mirror of `waiting`): the object floats above the closing panel and
 *             keeps its z until the cover finishes;
 *   out     — flying slot → origin (only after the cover is done).
 */
export type FlightPhase = 'waiting' | 'in' | 'shown' | 'leaving' | 'out';

export type OpenCollision = 'serialize' | 'crossfade' | 'none';

/** A request to open — kept verbatim when it has to wait its turn in `queued`. */
export interface OpenRequest {
  entityId: string;
  instanceId: string | null;
  animate: boolean;
  collision: OpenCollision;
}

/** What the panel is about: content entity, and the plane instance it flies from / returns to. */
export interface ActiveObject {
  entityId: string;
  instanceId: string | null;
}

/** The previous object flying home during a relay; its instance always exists. */
export interface RelayObject {
  entityId: string;
  instanceId: string;
}

export interface DetailState {
  panel: PanelPhase;
  /** The active object — null exactly when the panel is closed. Drives content and slot. */
  active: ActiveObject | null;
  /** Where the active object sits relative to the slot. */
  flight: FlightPhase;
  /** The previous object flying back to the plane (the relay layer), or null. */
  relaying: RelayObject | null;
  /** One open request parked until the relay clears. Replaced, never stacked. */
  queued: OpenRequest | null;
}

export type DetailAction =
  | { type: 'open'; entityId: string; instanceId: string | null; animate: boolean; collision: OpenCollision }
  | { type: 'close'; animate: boolean }
  /** The panel's reveal wipe finished: a waiting first-open object may fly in. */
  | { type: 'revealed' }
  /** The active object's flight (in or out) completed. */
  | { type: 'landed' }
  /** The relaying object reached the plane. */
  | { type: 'relayLanded' }
  /** The cover wipe finished: the panel may unmount. */
  | { type: 'coverDone' }
  /** The view changed: origins are gone. Keep the panel, drop the flights. */
  | { type: 'detach' }
  /** The active entity left the list: nothing to show. */
  | { type: 'abandon' };

/** Which copy of the ACTIVE object is the visible one. `plane` while it waits or after it flies home. */
export type DetailCopy = 'plane' | 'flight' | 'panel';

export const CLOSED: DetailState = Object.freeze({
  panel: 'closed',
  active: null,
  flight: 'shown',
  relaying: null,
  queued: null,
});

const S = (
  panel: PanelPhase,
  active: ActiveObject | null,
  flight: FlightPhase,
  relaying: RelayObject | null = null,
  queued: OpenRequest | null = null,
): DetailState => ({ panel, active, flight, relaying, queued });

export function initialDetail(entityId: string | null | undefined): DetailState {
  return entityId ? S('open', { entityId, instanceId: null }, 'shown') : CLOSED;
}

const reqOf = (a: Extract<DetailAction, { type: 'open' }>): OpenRequest => ({
  entityId: a.entityId,
  instanceId: a.instanceId,
  animate: a.animate,
  collision: a.collision,
});

/**
 * Does a request opened INTO an already-open panel move anything? 'none' says no
 * — the swap is a commit, not a choreography — and so does a request with no
 * origin or no motion.
 */
const relayFlies = (r: OpenRequest): boolean =>
  r.animate && r.instanceId !== null && r.collision !== 'none';

/** Starts a relay INTO an already-open panel from a clean slot. */
function relayInto(state: DetailState, r: OpenRequest): DetailState {
  const active: ActiveObject = { entityId: r.entityId, instanceId: r.instanceId };
  const flies = relayFlies(r);
  // 'none' keeps `relaying` null: the outgoing object is simply on the plane
  // again from this commit — there is no second visual, and no landing to await.
  const outgoing: RelayObject | null =
    r.collision !== 'none' && state.active && state.active.instanceId !== null
      ? { entityId: state.active.entityId, instanceId: state.active.instanceId }
      : null;
  if (!flies) return S('open', active, 'shown', outgoing);
  // serialize with an outgoing origin: the new one waits until it has flown home.
  if (r.collision === 'serialize' && outgoing) return S('open', active, 'waiting', outgoing);
  // crossfade, or nothing to relay: both move at once.
  return S('open', active, 'in', outgoing);
}

/** Begins a request into an already-open panel with NO relay (the slot is empty). */
function beginInOpen(r: OpenRequest): DetailState {
  // Still `relayFlies`: the panel is open, so this is a swap of content inside
  // it — a 'none' request queued while a serialize relay finished lands settled.
  return S('open', { entityId: r.entityId, instanceId: r.instanceId }, relayFlies(r) ? 'in' : 'shown');
}

/** Fires a parked request once the slot is clean: relay gone AND the active object settled. */
function drain(state: DetailState): DetailState {
  if (state.relaying === null && state.flight === 'shown' && state.queued !== null) {
    return relayInto(state, state.queued);
  }
  return state;
}

/**
 * Returns the SAME object when nothing changes, so a reducer built on this lets
 * React bail out of the render.
 */
export function transition(state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case 'open': {
      const r = reqOf(action);
      const flies = r.animate && r.instanceId !== null;
      const active: ActiveObject = { entityId: r.entityId, instanceId: r.instanceId };
      // From closed (or reopening a covering panel): the panel reveals, the object
      // waits on the plane and flies in when `revealed` fires — into a settled card.
      if (state.panel !== 'open') return S('open', active, flies ? 'waiting' : 'shown');
      // panel === 'open'. Clicking the object already shown, flying in, or waiting
      // to is nothing new.
      if (state.active && state.active.entityId === r.entityId && state.flight !== 'out') {
        return state;
      }
      // Reopening the SAME object mid-fly-out reverses it: back in, no relay.
      if (state.active && state.active.entityId === r.entityId && state.flight === 'out') {
        return S('open', active, flies ? 'in' : 'shown');
      }
      // A relay against a different entity.
      if (!flies) return S('open', active, 'shown');
      // A relay or first-open flight is still in progress: park it, drain later.
      const busy = state.relaying !== null || state.flight === 'waiting' || state.flight === 'in';
      if (busy) return { ...state, queued: r };
      return relayInto(state, r);
    }

    case 'close': {
      if (state.panel !== 'open') return state;
      // Mirror of the open: the object lifts off the slot onto the flight layer
      // (`leaving`, above the panel, keeping its z) and the panel COVERS at the
      // same time; only when the cover finishes does the object fly home. It must
      // be settled in the slot to lift from there.
      const canFlyHome = action.animate && state.active?.instanceId != null && state.flight === 'shown';
      if (canFlyHome) return S('covering', state.active, 'leaving');
      if (action.animate) return S('covering', state.active, 'shown'); // nothing in the slot to lift
      return CLOSED;
    }

    case 'revealed': {
      // Release a first-open object once the panel has finished revealing.
      if (state.flight === 'waiting' && state.relaying === null) return S('open', state.active, 'in');
      return state;
    }

    case 'landed': {
      if (state.flight === 'in') return drain(S('open', state.active, 'shown', state.relaying, state.queued));
      // Flew home after the cover: the object is back on the plane, panel gone.
      if (state.flight === 'out') return CLOSED;
      return state;
    }

    case 'relayLanded': {
      if (state.relaying === null) return state;
      if (state.flight === 'waiting') {
        // Serialize handoff: the outgoing is home. A newer request replaced the
        // waiting one → it begins fresh (the waiting object never left the plane,
        // so there is nothing to relay). Otherwise the waiting active flies in.
        if (state.queued) return beginInOpen(state.queued);
        return S('open', state.active, 'in');
      }
      // Crossfade: the relay finished while the active object may still be flying.
      // Clear the relay; drain only once the active has settled.
      return drain(S('open', state.active, state.flight, null, state.queued));
    }

    case 'coverDone': {
      if (state.panel !== 'covering') return state;
      // The panel has finished covering. If the object was floating above it
      // (`leaving`), NOW it flies home — the panel stays `covering` (already
      // invisible, the wipe will not re-run) so `Detail` and the flight visual
      // remain mounted for the trip; `landed` from `out` closes. Otherwise the
      // panel simply closes.
      if (state.flight === 'leaving') return S('covering', state.active, 'out');
      return CLOSED;
    }

    case 'detach': {
      if (state.panel === 'closed') return state;
      if (state.panel === 'covering') return CLOSED;
      if (
        state.active &&
        state.active.instanceId === null &&
        state.relaying === null &&
        state.queued === null &&
        state.flight === 'shown'
      ) {
        return state;
      }
      return S('open', state.active ? { entityId: state.active.entityId, instanceId: null } : null, 'shown');
    }

    case 'abandon':
      return state.panel === 'closed' ? state : CLOSED;
  }
}

/**
 * Which copy of the active object shows — driven by the flight phase, so the
 * open and close ends are exact mirrors and the object keeps the flight layer
 * (above the panel) for the whole float+fly at BOTH ends.
 *
 *  · waiting — first open (`relaying === null`, has an origin): lifted onto the
 *    flight layer at once, parked over its origin ABOVE the panel, so it wins the
 *    stacking from the click and the panel wiping open never covers it. A
 *    serialize relay's waiter (`relaying !== null`) genuinely sits on the plane.
 *  · in / leaving / out — on the flight layer (in = flying to the slot; leaving =
 *    parked at the slot above the covering panel; out = flying home). The origin-
 *    less cases (no instance to fly from/to) fall back to the panel copy.
 *  · shown — the panel's copy.
 */
export function activeCopy(state: DetailState): DetailCopy {
  if (state.active === null) return 'plane';
  const hasOrigin = state.active.instanceId !== null;
  switch (state.flight) {
    case 'waiting':
      return state.relaying === null && hasOrigin ? 'flight' : 'plane';
    case 'in':
    case 'leaving':
    case 'out':
      return hasOrigin ? 'flight' : 'panel';
    case 'shown':
      return 'panel';
  }
}

/**
 * The instances to hide on the plane: the active one whenever its copy is
 * elsewhere, and the relaying one throughout its flight. At most two, always of
 * different entities.
 */
export function hiddenInstancesOf(state: DetailState): Set<string> {
  const set = new Set<string>();
  if (state.active?.instanceId != null && activeCopy(state) !== 'plane') set.add(state.active.instanceId);
  if (state.relaying !== null) set.add(state.relaying.instanceId);
  return set;
}

/** The active object is in flight (in or out). */
export const inFlight = (state: DetailState): boolean => activeCopy(state) === 'flight';

/** The panel exists (open or covering). */
export const panelPresent = (state: DetailState): boolean => state.panel !== 'closed';
