/*
 * The detail machine, exhaustively. Pure: no DOM.
 *
 * Two decoupled lifecycles. The PANEL is uncovered once and covered once; the
 * machine governs the OBJECT. The properties under test:
 *  · while something stays active the panel does not re-open or re-cover — no
 *    `open → covering → open` on a swap (that was the old coupling);
 *  · exactly one copy of the active object is visible (plane while waiting/home,
 *    flight while in/out, panel while shown);
 *  · no reachable state shows two copies of the SAME object (active and relaying
 *    are always different entities);
 *  · serialize never flies the new object until the old is home; crossfade flies
 *    both at once.
 * Every transition is pinned; then seeded random walks in each mode assert the
 * invariant on every reachable state.
 */
import { describe, expect, it } from 'vitest';

import { createRng } from '../src/layout/rng';
import {
  CLOSED,
  activeCopy,
  hiddenInstancesOf,
  inFlight,
  initialDetail,
  panelPresent,
  transition,
} from '../src/detail/machine';
import type { DetailAction, DetailState, OpenCollision } from '../src/detail/machine';

const open = (
  entityId: string,
  instanceId: string | null = `${entityId}-0`,
  collision: OpenCollision = 'serialize',
  animate = true,
): DetailAction => ({ type: 'open', entityId, instanceId, animate, collision });
const close = (animate = true): DetailAction => ({ type: 'close', animate });
const revealed: DetailAction = { type: 'revealed' };
const landed: DetailAction = { type: 'landed' };
const relayLanded: DetailAction = { type: 'relayLanded' };
const coverDone: DetailAction = { type: 'coverDone' };
const detach: DetailAction = { type: 'detach' };
const abandon: DetailAction = { type: 'abandon' };

const run = (actions: DetailAction[], from: DetailState = CLOSED) => actions.reduce(transition, from);

/** A first open flown to settled: closed → open (waiting) → reveal → in → shown. */
const openSettled = (e = 'a', i = `${e}-0`, collision: OpenCollision = 'serialize') =>
  run([open(e, i, collision), revealed, landed]);

/** What every reachable state must satisfy. */
function assertWellFormed(state: DetailState) {
  if (state.panel === 'closed') {
    expect(state).toEqual(CLOSED);
    expect(activeCopy(state)).toBe('plane');
    expect(hiddenInstancesOf(state).size).toBe(0);
    return;
  }
  expect(state.active).not.toBeNull();
  if (state.flight === 'in' || state.flight === 'out') expect(state.active?.instanceId).not.toBeNull();
  if (state.relaying) {
    expect(state.relaying.entityId).not.toBe(state.active?.entityId);
    expect(state.relaying.instanceId).not.toBe(state.active?.instanceId);
  }
  const hidden = hiddenInstancesOf(state);
  if (activeCopy(state) !== 'plane' && state.active?.instanceId != null) {
    expect(hidden.has(state.active.instanceId)).toBe(true);
  }
  if (state.relaying) expect(hidden.has(state.relaying.instanceId)).toBe(true);
}

describe('initial state', () => {
  it('closed, or open+settled (no flight) when given an entity', () => {
    expect(initialDetail(null)).toBe(CLOSED);
    expect(initialDetail('')).toBe(CLOSED);
    expect(initialDetail('a')).toEqual({ panel: 'open', active: { entityId: 'a', instanceId: null }, flight: 'shown', relaying: null, queued: null });
  });
});

describe('first open — the panel reveals, the object waits then flies in', () => {
  it('closed → open with the object WAITING, already lifted onto the flight layer (not flying yet)', () => {
    const s = run([open('a', 'a-3')]);
    expect(s).toMatchObject({ panel: 'open', active: { entityId: 'a', instanceId: 'a-3' }, flight: 'waiting' });
    // A first-open waiter is parked on the flight layer — ABOVE the panel — from
    // the click, so the panel wiping open never covers it. Its plane copy hides.
    expect(activeCopy(s)).toBe('flight');
    expect(hiddenInstancesOf(s)).toEqual(new Set(['a-3']));
  });
  it('revealed releases it: it flies in', () => {
    const s = run([open('a', 'a-3'), revealed]);
    expect(s.flight).toBe('in');
    expect(activeCopy(s)).toBe('flight');
    expect(hiddenInstancesOf(s)).toEqual(new Set(['a-3']));
  });
  it('landed settles it in the panel', () => {
    expect(activeCopy(openSettled())).toBe('panel');
  });
  it('without an origin: open and settled at once, no flight, no wait', () => {
    expect(run([open('a', null)])).toMatchObject({ panel: 'open', flight: 'shown' });
  });
  it('without motion: settled at once, origin still recorded (focus returns to it)', () => {
    const s = run([open('a', 'a-3', 'serialize', false)]);
    expect(s).toMatchObject({ panel: 'open', active: { instanceId: 'a-3' }, flight: 'shown' });
  });
});

describe('the panel stays put across a swap (the decoupling)', () => {
  it('open → open never passes through covering', () => {
    let state = openSettled('a');
    const seen: string[] = [];
    for (const action of [open('b'), relayLanded, open('c'), relayLanded]) {
      state = transition(state, action);
      seen.push(state.panel);
    }
    expect(seen.every((p) => p === 'open')).toBe(true);
  });
});

describe('open collision — serialize (default)', () => {
  it('opening B while A is shown: A relays home, B WAITS (has not flown yet)', () => {
    const s = transition(openSettled('a'), open('b'));
    expect(s).toMatchObject({
      panel: 'open',
      active: { entityId: 'b', instanceId: 'b-0' },
      flight: 'waiting',
      relaying: { entityId: 'a', instanceId: 'a-0' },
    });
    expect(activeCopy(s)).toBe('plane'); // B still on the plane, visible there
    // Only A (flying home) is hidden; B stays visible on the plane until it flies.
    expect(hiddenInstancesOf(s)).toEqual(new Set(['a-0']));
  });
  it('relayLanded then hands off: A home, B flies in', () => {
    const s = run([open('a'), revealed, landed, open('b'), relayLanded]);
    expect(s).toMatchObject({ flight: 'in', active: { entityId: 'b' }, relaying: null });
  });
  it('a third click replaces the parked one; the waiting B never flies', () => {
    const s = run([open('a'), revealed, landed, open('b'), open('c')]);
    expect(s).toMatchObject({ active: { entityId: 'b' }, flight: 'waiting', queued: { entityId: 'c' } });
    // A lands → C takes over, flying in from its own origin (B, which only ever
    // waited, stays on the plane — nothing to relay).
    const next = transition(s, relayLanded);
    expect(next).toMatchObject({ active: { entityId: 'c' }, flight: 'in', relaying: null });
  });
  it('one object relays at a time: only the outgoing is hidden while the new one waits', () => {
    const s = transition(openSettled('a'), open('b'));
    expect(hiddenInstancesOf(s)).toEqual(new Set(['a-0'])); // just A flying home
  });
});

describe('open collision — crossfade', () => {
  const x = (e: string, i?: string) => open(e, i ?? `${e}-0`, 'crossfade');

  it('opening B while A is shown: B flies IN and A relays home AT ONCE', () => {
    const s = transition(openSettled('a', 'a-0', 'crossfade'), x('b'));
    expect(s).toMatchObject({ active: { entityId: 'b' }, flight: 'in', relaying: { entityId: 'a', instanceId: 'a-0' } });
    expect(activeCopy(s)).toBe('flight'); // both moving
  });
  it('both completions drain any parked request, in either order', () => {
    const mid = run([x('a'), revealed, landed, x('b'), x('c')]);
    expect(mid).toMatchObject({ active: { entityId: 'b' }, flight: 'in', relaying: { entityId: 'a' }, queued: { entityId: 'c' } });
    // relay lands first, then B lands → C crossfades in from B.
    const afterRelay = transition(mid, relayLanded);
    expect(afterRelay).toMatchObject({ flight: 'in', relaying: null, queued: { entityId: 'c' } });
    const afterLand = transition(afterRelay, landed);
    expect(afterLand).toMatchObject({ active: { entityId: 'c' }, flight: 'in', relaying: { entityId: 'b' } });
  });
});

describe('close — the mirror of open: panel covers FIRST, then the object flies home', () => {
  it('from shown with an origin: the object lifts to the flight layer (leaving) and the panel covers', () => {
    const s = transition(openSettled('a'), close());
    expect(s).toMatchObject({ panel: 'covering', flight: 'leaving', active: { entityId: 'a' } });
    // Still on the flight layer, above the covering panel, keeping its z.
    expect(activeCopy(s)).toBe('flight');
    expect(hiddenInstancesOf(s)).toEqual(new Set(['a-0'])); // plane copy hidden
  });
  it('coverDone releases it: it flies home (out), panel stays covering for the trip', () => {
    const s = run([open('a'), revealed, landed, close(), coverDone]);
    expect(s).toMatchObject({ panel: 'covering', flight: 'out', active: { entityId: 'a' } });
    expect(activeCopy(s)).toBe('flight'); // flying home, still above
  });
  it('landed after out → closed (object back on the plane, panel gone)', () => {
    const s = run([open('a'), revealed, landed, close(), coverDone, landed]);
    expect(s).toBe(CLOSED);
  });
  it('no origin, or no motion: covers (or closes) at once', () => {
    expect(run([open('a', null), close()])).toMatchObject({ panel: 'covering', flight: 'shown' });
    expect(run([open('a', null), close(), coverDone])).toBe(CLOSED);
    expect(run([open('a'), revealed, landed, close(false)])).toBe(CLOSED);
  });
  it('close during a relay drops the relay; nothing in the slot to lift → straight cover', () => {
    const s = run([open('a'), revealed, landed, open('b'), close()]);
    // b is still waiting (serialize), the slot is empty → cover without a lift.
    expect(s.panel).toBe('covering');
    expect(s.flight).toBe('shown');
    expect(s.relaying).toBeNull();
  });
  it('reopening a covering panel uncovers it again', () => {
    const s = run([open('a'), revealed, landed, close(), coverDone, landed, open('b')]);
    expect(s).toMatchObject({ panel: 'open', active: { entityId: 'b' }, flight: 'waiting' });
  });
  it('from closed close is a no-op; while covering it is too', () => {
    expect(transition(CLOSED, close())).toBe(CLOSED);
    const covering = run([open('a'), revealed, landed, close()]);
    expect(transition(covering, close())).toBe(covering);
  });
});

describe('idempotent signals', () => {
  it('revealed/landed/relayLanded/coverDone that do not apply return the same reference', () => {
    const shown = openSettled('a');
    expect(transition(shown, revealed)).toBe(shown);
    expect(transition(shown, landed)).toBe(shown);
    expect(transition(shown, relayLanded)).toBe(shown);
    expect(transition(shown, coverDone)).toBe(shown);
  });
});

describe('detach (the view changed under the detail)', () => {
  it('open/relay → open without origins; relay and queue dropped', () => {
    expect(transition(openSettled('a'), detach)).toMatchObject({ panel: 'open', active: { instanceId: null }, relaying: null });
    const relaying = run([open('a', 'a-0', 'crossfade'), revealed, landed, open('b', 'b-0', 'crossfade')]);
    expect(transition(relaying, detach)).toMatchObject({ panel: 'open', active: { entityId: 'b', instanceId: null }, relaying: null });
  });
  it('covering → closed', () => {
    expect(run([open('a'), revealed, landed, close(), landed, detach])).toBe(CLOSED);
  });
  it('closed, or already origin-less open, is a no-op', () => {
    expect(transition(CLOSED, detach)).toBe(CLOSED);
    const originless = run([open('a', null)]);
    expect(transition(originless, detach)).toBe(originless);
  });
});

describe('abandon (the entity is gone)', () => {
  it('anything → closed; closed is a no-op', () => {
    expect(transition(openSettled('a'), abandon)).toBe(CLOSED);
    expect(transition(CLOSED, abandon)).toBe(CLOSED);
  });
});

describe('the invariant, under every sequence', () => {
  const walk = (collision: OpenCollision, onStep: (prev: DetailState, next: DetailState) => void) => {
    const rng = createRng(`machine:${collision}`);
    const entities = ['a', 'b', 'c'];
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T;
    const randomAction = (): DetailAction => {
      switch (Math.floor(rng() * 8)) {
        case 0: {
          const e = pick(entities);
          const i = rng() < 0.2 ? null : `${e}-${Math.floor(rng() * 8)}`;
          return open(e, i, collision, rng() < 0.85);
        }
        case 1:
          return close(rng() < 0.85);
        case 2:
          return revealed;
        case 3:
          return landed;
        case 4:
          return relayLanded;
        case 5:
          return coverDone;
        case 6:
          return detach;
        default:
          return abandon;
      }
    };
    let state: DetailState = CLOSED;
    for (let i = 0; i < 20_000; i++) {
      const next = transition(state, randomAction());
      assertWellFormed(next);
      onStep(state, next);
      state = next;
    }
  };

  it('serialize: well-formed throughout, one object flies at a time', () => {
    let relays = 0;
    walk('serialize', (prev, next) => {
      // A relay and the active object flying IN never run together in serialize:
      // the new object waits until the outgoing is home.
      if (next.relaying) expect(next.flight).not.toBe('in');
      if (next.relaying && next.relaying.instanceId !== prev.relaying?.instanceId) relays++;
    });
    expect(relays).toBeGreaterThan(40);
  });

  it('crossfade: well-formed throughout, and relays do run alongside the incoming flight', () => {
    let concurrent = 0;
    walk('crossfade', (_prev, next) => {
      if (next.relaying && next.flight === 'in') concurrent++;
    });
    expect(concurrent).toBeGreaterThan(50);
  });

  it('the full arc is reachable and symmetric: reveal→fly-in on open, cover→fly-home on close', () => {
    const seen: string[] = [];
    let state: DetailState = CLOSED;
    for (const action of [open('a'), revealed, landed, close(), coverDone, landed]) {
      state = transition(state, action);
      seen.push(`${state.panel}:${state.flight}`);
    }
    expect(seen).toEqual([
      'open:waiting', // parked at origin, panel reveals
      'open:in', //      flies to the slot
      'open:shown', //   settled
      'covering:leaving', // parked at slot, panel covers (mirror of waiting)
      'covering:out', //     flies home
      'closed:shown', //     back on the plane, panel gone
    ]);
  });
});

describe('helpers', () => {
  it('panelPresent tracks the container, not the object', () => {
    expect(panelPresent(CLOSED)).toBe(false);
    expect(panelPresent(run([open('a')]))).toBe(true); // waiting, but the panel is up
    expect(panelPresent(run([open('a'), revealed, landed, close(), landed]))).toBe(true); // covering
  });
  it('inFlight covers a first-open waiter (parked on the flight layer) and in/out', () => {
    expect(inFlight(run([open('a')]))).toBe(true); // waiting first open: parked ABOVE the panel
    expect(inFlight(run([open('a'), revealed]))).toBe(true); // in
    expect(inFlight(openSettled('a'))).toBe(false); // shown
    // A serialize relay's waiter genuinely sits on the plane, not in flight.
    const relayWaiting = run([open('a'), revealed, landed, open('b')]);
    expect(relayWaiting.flight).toBe('waiting');
    expect(inFlight(relayWaiting)).toBe(false);
  });
});
