/*
 * The grid view: the same objects, one card per entity, laid out as a grid that
 * scrolls natively. It is the plane's list with another layout, and the
 * accessible alternative to it (every card is in the tab order, revealed or
 * not), which is why it has two composition holes of its own — a grid of
 * unnamed objects says nothing, and under `reducedMotion: 'grid'` this view IS
 * the catalogue. Internal — consumers mount `<Vitrina>`.
 *
 * The library still ships no copy: `renderCard` fills each card beside the
 * object, `renderGridHeader` fills a full-row header INSIDE the scroll
 * container (`children` mounts outside it, so a heading there would stay pinned
 * over a catalogue scrolling under it).
 *
 * THREE nodes per card, and the middle one is the reason `renderCard` is not a
 * `ctx.view` branch of `renderObject`: the item is the grid cell, the BUTTON
 * inside it is the object's box — exactly `--vitrina-grid-cell`, and the
 * element that Flips to and from the plane — and the card content is a SIBLING
 * of that button. Rendered inside it, a caption would sit on the object and
 * travel with it into the plane.
 *
 * Each card Flips from the plane object it stands for: the SHOWN instance of its
 * entity closest to the viewport centre at the moment of the toggle. An entity
 * with no shown instance fades in. Going back, the card flies to that same
 * instance (exact `data-flip-id`, never a per-entity prefix — with a dozen
 * instances per entity a prefix match always resolves to the first in the DOM).
 */

import { useMemo, useRef } from 'react';
import { gsap } from 'gsap';

import type {
  VitrinaEntity,
  VitrinaInstance,
  VitrinaLabels,
  VitrinaLayout,
  VitrinaProps,
} from '../types';
import { VIEW_FLIP_SECONDS } from '../defaults';
import { generateInstances } from '../layout/generate';
import { getInteractionPlugins, useIsomorphicLayoutEffect } from '../gsap';
import type { GetMotion } from '../motion';
import type { Session, ViewFlipRecord } from '../session';

export interface GridProps {
  entities: VitrinaEntity[];
  instances?: VitrinaInstance[];
  layout: Required<VitrinaLayout>;
  renderObject: VitrinaProps['renderObject'];
  /** The card's content beside the object — a sibling of the flying button. */
  renderCard?: VitrinaProps['renderCard'];
  /** A full-row header inside the scroll container, above the cards. */
  renderGridHeader?: VitrinaProps['renderGridHeader'];
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
  /** The motion tokens, read once at the root's mount. */
  motion: GetMotion;
}

/*
 * All structure — the container's grid layout, BOTH overflow axes (leaving X
 * unset would couple it to Y and make this a valid horizontal scroller that a
 * native scroll-into-view can hand a real scrollLeft), the scrollbar gutter,
 * the stacking rung, the item's column, the card's cell box and the header's
 * full-row span — lives in base.css, keyed on the data attributes; cell, gap
 * and the item's own gap are custom properties a theme can retune, under media
 * queries too. Inline here is only the per-commit visibility.
 */

export function Grid({
  entities,
  instances,
  layout,
  renderObject,
  renderCard,
  renderGridHeader,
  labels,
  reduced,
  session,
  hiddenIds,
  activeEntityId,
  onOpen,
  onNode,
  motion,
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
        ease: motion().easeFlight,
        /*
         * Cards with no shown object to come from. The card's COPY fades with
         * its object — a caption already sitting there under an object still
         * fading in reads as two unrelated arrivals. The object node stays in
         * the target list (it is the one Flip handed us); the caption joins it.
         * Not the item wrapper: keeping both nodes explicit keeps the fade off
         * a box whose only job is layout, and keeps the OBJECT in the target
         * list, which is what the view test can still see. (The pairing of the
         * copy is only observable in a real browser: under StrictMode this
         * context is built, reverted and rebuilt, and by the second run there
         * are no entering elements left to call this.)
         */
        onEnter: (elements) =>
          gsap.fromTo(
            elements.flatMap((el) => {
              const copy = el.parentElement?.querySelector('[data-vitrina-card-content]');
              return copy ? [el, copy] : [el];
            }),
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
    >
      {/* The header scrolls WITH the cards: it is inside this container, spanning
          the full row. Nothing of the library's is rendered when the hole is
          empty — not even the wrapper. */}
      {renderGridHeader && <div data-vitrina-grid-header="">{renderGridHeader()}</div>}
      {entities.map((entity) => {
        const instanceId = representative(entity.id);
        const ctx = {
          instanceId,
          isActive: entity.id === activeEntityId,
          isRevealed: true,
          view: 'grid' as const,
        };
        return (
          // The grid cell. The button inside it keeps the object's exact box (it
          // is what flies); the card content sits beneath it, out of the flight.
          <div key={entity.id} data-vitrina-grid-item="">
            <button
              ref={cardRef(entity.id)}
              type="button"
              data-vitrina-object=""
              data-vitrina-card=""
              data-vitrina-instance={instanceId}
              data-vitrina-entity={entity.id}
              data-flip-id={instanceId}
              aria-label={labels.objectLabel(entity)}
              onClick={() => onOpen(entity.id, instanceId)}
              // React owns `visibility`; GSAP owns opacity/scale. Structure is base.css's.
              style={{ visibility: hiddenIds.has(instanceId) ? 'hidden' : undefined }}
            >
              {/* Same two-node structure as the plane instance: the button is the
                  box, the content node centres renderObject's return (cards never
                  pop, but the content rules key on this node). */}
              <span data-vitrina-object-content="">{renderObject(entity, ctx)}</span>
            </button>
            {/* The card's own content: the entity's, once per card — the grid is
                the list of what exists, not of the copies. It carries no control
                of its own; the object above it is the card's button. */}
            {renderCard && <div data-vitrina-card-content="">{renderCard(entity, ctx)}</div>}
          </div>
        );
      })}
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
