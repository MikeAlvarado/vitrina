/*
 * The grid view: the same objects, one card per entity, laid out as a grid that
 * scrolls natively. No chrome — no heading, no copy, no controls: it is the
 * plane's list with another layout, and the accessible alternative to it (every
 * card is in the tab order, revealed or not). Internal — consumers mount
 * `<Vitrina>`.
 *
 * Each card Flips from the plane object it stands for: the SHOWN instance of its
 * entity closest to the viewport centre at the moment of the toggle. An entity
 * with no shown instance fades in. Going back, the card flies to that same
 * instance (exact `data-flip-id`, never a per-entity prefix — with a dozen
 * instances per entity a prefix match always resolves to the first in the DOM).
 */

import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { gsap } from 'gsap';

import type {
  VitrinaEntity,
  VitrinaInstance,
  VitrinaLabels,
  VitrinaLayout,
  VitrinaProps,
} from '../types';
import { VIEW_FLIP_EASE, VIEW_FLIP_SECONDS } from '../defaults';
import { generateInstances } from '../layout/generate';
import { getInteractionPlugins, useIsomorphicLayoutEffect } from '../gsap';
import type { Session, ViewFlipRecord } from '../session';

export interface GridProps {
  entities: VitrinaEntity[];
  instances?: VitrinaInstance[];
  layout: Required<VitrinaLayout>;
  renderObject: VitrinaProps['renderObject'];
  labels: VitrinaLabels;
  reduced: boolean;
  session: Session;
  /** Instances whose copies are in flight, in the panel, or dissolving — their cards are hidden. */
  hiddenIds: ReadonlySet<string>;
  /** The entity the panel shows: its card reports `isActive`. */
  activeEntityId: string | null;
  onOpen: (entityId: string, instanceId: string) => void;
  /** Registers each card with the root, under the instance it stands for. */
  onNode: (instanceId: string, el: HTMLElement | null) => void;
}

/*
 * Structural, inline, like the plane's. Cell and gap are custom properties so a
 * theme can retune them — under a media query too, which inline styles cannot.
 *
 * Both overflow axes are declared. Leaving `overflow-x` unset couples it to
 * `overflow-y: auto` (if one axis stops being `visible`, so does the other),
 * which makes the container a valid HORIZONTAL scroller as well: any native
 * scroll-into-view — a programmatic `.focus()`, a tab to a card — could then
 * hand it a real `scrollLeft` and shove every card sideways. Hidden on purpose.
 * `scrollbar-gutter: stable` keeps the content width constant whether or not a
 * classic scrollbar is showing, so nothing shifts when the card count crosses
 * the fold.
 */
const GRID_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarGutter: 'stable',
  overscrollBehavior: 'contain',
  boxSizing: 'border-box',
  padding: 'var(--vitrina-grid-gap, 80px)',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, var(--vitrina-grid-cell, 240px))',
  gap: 'var(--vitrina-grid-gap, 80px)',
  justifyContent: 'center',
  alignContent: 'start',
  // Same floor as the plane: the whole card layer sits below the panel and the
  // flight, on one rung, the active card hidden (visibility) while its clone flies.
  zIndex: 'var(--vitrina-z-plane, 10)',
};

const CARD_STYLE: CSSProperties = {
  display: 'block',
  width: 'var(--vitrina-grid-cell, 240px)',
  height: 'var(--vitrina-grid-cell, 240px)',
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};

export function Grid({
  entities,
  instances,
  layout,
  renderObject,
  labels,
  reduced,
  session,
  hiddenIds,
  activeEntityId,
  onOpen,
  onNode,
}: GridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** Entity id → its card. Filled by stable callback refs. */
  const cardsRef = useRef(new Map<string, HTMLButtonElement>());
  const cardRefsRef = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());
  const reducedRef = useRef(reduced);
  const onNodeRef = useRef(onNode);

  /** Instance ids per entity, in plane order — the candidates a card can pair with. */
  const instancesByEntity = useMemo(() => {
    const placed = instances ?? generateInstances(entities, layout);
    const map = new Map<string, string[]>();
    for (const inst of placed) {
      const list = map.get(inst.entityId);
      if (list) list.push(inst.id);
      else map.set(inst.entityId, [inst.id]);
    }
    return map;
  }, [instances, entities, layout]);

  /** The instance a card stands for when nothing better is known: the entity's first. */
  const representative = (entityId: string) => instancesByEntity.get(entityId)?.[0] ?? entityId;

  useIsomorphicLayoutEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useIsomorphicLayoutEffect(() => {
    onNodeRef.current = onNode;
  }, [onNode]);

  const cardRef = (entityId: string) => {
    let ref = cardRefsRef.current.get(entityId);
    if (!ref) {
      ref = (el) => {
        // Registered under the instance the card stands for — the id the root
        // hides and flies from; the Flip pairing (`data-flip-id`) is separate.
        onNodeRef.current(representative(entityId), el);
        if (el) cardsRef.current.set(entityId, el);
        else cardsRef.current.delete(entityId);
      };
      cardRefsRef.current.set(entityId, ref);
    }
    return ref;
  };

  /*
   * Hand-off, capture side. Declared FIRST so its cleanup runs before the flight
   * context below reverts: a Flip still in flight is captured where it is, and
   * the plane starts its own flight from there. The cards' `data-flip-id`s are
   * the instances they paired with, so the plane matches them exactly.
   */
  useIsomorphicLayoutEffect(() => {
    return () => {
      const root = rootRef.current;
      const plugins = getInteractionPlugins();
      if (!root || !plugins || reducedRef.current) return;
      const targets = Array.from(cardsRef.current.values());
      if (targets.length === 0) return;
      const state = plugins.Flip.getState(targets);
      const rects = new Map<string, DOMRect>();
      for (const es of state.elementStates) {
        const id = es.element.getAttribute('data-flip-id');
        if (id) rects.set(id, es.bounds);
      }
      session.storeFlip({ from: 'grid', state, rects, viewport: root.getBoundingClientRect() });
    };
  }, []);

  /*
   * Hand-off, arrival side: cards Flip from the plane objects. Pairing happens
   * here, with the record in hand. Mount-only: the grid has no measurement to
   * wait for. Under StrictMode the first run's flight is reverted, but the
   * capture above stored the cards mid-flight (at their plane positions), so the
   * second run flies the same flight from that record.
   */
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const record = session.takeFlip();
    const plugins = getInteractionPlugins();
    if (!record || !plugins || reducedRef.current) return;
    const cards = cardsRef.current;
    if (cards.size === 0) return;

    if (record.from === 'plane') pairCards(record, cards, instancesByEntity, representative);

    const ctx = gsap.context(() => {
      /*
       * Cards fly in from anywhere on screen, and a transformed element extends
       * its scroll container's scrollable area: clip both axes for the flight so
       * the scrollbar does not flicker, then hand vertical scrolling back.
       */
      gsap.set(root, { overflowY: 'hidden' });
      plugins.Flip.from(record.state, {
        targets: Array.from(cards.values()),
        scale: true,
        prune: true,
        duration: VIEW_FLIP_SECONDS,
        ease: VIEW_FLIP_EASE,
        // Cards with no shown object to come from.
        onEnter: (elements) =>
          gsap.fromTo(
            elements,
            { opacity: 0 },
            { opacity: 1, duration: VIEW_FLIP_SECONDS, ease: 'power2.out' },
          ),
        onComplete: () => gsap.set(root, { overflowY: 'auto' }),
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      data-vitrina-grid=""
      // Same reason as the plane viewport: Lenis would hijack the wheel of a
      // nested scroller it does not know about. Inert without Lenis.
      data-lenis-prevent=""
      role="region"
      aria-label={labels.grid ?? labels.viewport}
      style={GRID_STYLE}
    >
      {entities.map((entity) => (
        <button
          key={entity.id}
          ref={cardRef(entity.id)}
          type="button"
          data-vitrina-object=""
          data-vitrina-card=""
          data-vitrina-instance={representative(entity.id)}
          data-vitrina-entity={entity.id}
          data-flip-id={representative(entity.id)}
          aria-label={labels.objectLabel(entity)}
          onClick={() => onOpen(entity.id, representative(entity.id))}
          style={{
            ...CARD_STYLE,
            visibility: hiddenIds.has(representative(entity.id)) ? 'hidden' : undefined,
          }}
        >
          {renderObject(entity, {
            instanceId: representative(entity.id),
            isActive: entity.id === activeEntityId,
            isRevealed: true,
            view: 'grid',
          })}
        </button>
      ))}
    </div>
  );
}

/**
 * Gives every card the `data-flip-id` of the shown instance of its entity that
 * sat closest to the viewport centre when the plane left. Cards whose entity had
 * nothing shown keep their representative id, which the record does not contain:
 * Flip treats them as entering.
 */
function pairCards(
  record: ViewFlipRecord,
  cards: Map<string, HTMLButtonElement>,
  instancesByEntity: Map<string, string[]>,
  representative: (entityId: string) => string,
) {
  const cx = record.viewport.left + record.viewport.width / 2;
  const cy = record.viewport.top + record.viewport.height / 2;
  for (const [entityId, card] of cards) {
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const id of instancesByEntity.get(entityId) ?? []) {
      const r = record.rects.get(id);
      if (!r) continue;
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    card.setAttribute('data-flip-id', best ?? representative(entityId));
  }
}
