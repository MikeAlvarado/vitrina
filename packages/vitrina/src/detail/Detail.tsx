/*
 * The detail panel shell and the two flight layers. Render-only: the machine and
 * the tweens live in the orchestrator (`Vitrina.tsx`), which hands the refs down
 * and reads the phase. Internal.
 *
 * The panel is the container for "there is something active"; it is uncovered
 * once and covered once, and does not move while the active object changes
 * underneath it. `data-vitrina-panel-anim` (reveal | cover | none), keyed off the
 * PANEL phase (not the object's), plays the wipe: `none` on a relay, so a swap
 * never re-wipes.
 *
 * Two families of layers, and the split is structural, not a z-index tweak:
 *
 *  · the PANEL layer lives inside the Vitrina root (`--vitrina-z-panel`). Only
 *    the panel inside takes `pointer-events: auto`; the layer is `none`. No
 *    overlay — darkening the other half turns the plane into a backdrop and eats
 *    the pointerdown that starts a drag; the plane stays alive beside the panel.
 *  · the FLIGHT layers (the active clone flying in/out, and the relay flying
 *    home) are PORTALLED to `document.body`, OUTSIDE the Vitrina root and every
 *    transformed ancestor. This is the fix for "the flying object sits under the
 *    panel": the plane's two transform layers each establish a stacking context
 *    AND become the containing block of any `position: fixed` descendant, so a
 *    flight layer rendered inside the root competes within a context the panel
 *    already outranks — a static z-index cannot climb out of it. Rendered on
 *    `body` the flight is a sibling of the whole widget: `position: fixed` is
 *    resolved against the viewport again, and `--vitrina-z-flight` (> the
 *    panel's) puts it above the panel in EVERY state, so it never ducks behind a
 *    panel still revealing and then jumps forward when the wipe ends. The layer
 *    carries the z-index; the flying visual is its only child and needs none, so
 *    the order never rides on the transient z-index GSAP's Flip stamps on an
 *    element during a flip and strips when it ends.
 *
 * The portal mounts only after the first client effect (`useIsomorphicLayoutEffect`
 * runs post-mount), and renders nothing on the server or the first paint — SSR
 * emits the panel alone, which is inert markup, and the flight is a client-only
 * concern anyway (there is no flight without an interaction).
 *
 * The panel is three nested boxes (§ panel entrance): the panel WRAPPER (stable,
 * `pointer-events: auto`, holds any chrome that sticks past the edge), the CARD
 * (the surface — it carries the wipe and IS the only scroll container), and the
 * slot + content. The mask and the scroll both live on the card: a clip-path on
 * the wrapper would cut a sticking-out sibling into a crescent, and declaring
 * `overflow-y` couples `overflow-x` to `auto` and clips it too.
 *
 * The content is `renderDetail`'s, rendered for the ACTIVE entity and NEVER keyed
 * by id: a remount would kill any crossfade the consumer runs on it (the old text
 * would vanish in the same commit the new arrives). `active` flips to the new
 * entity the moment a relay starts, so the content crosses over on its own, not
 * waiting for the object to land.
 */

import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import type {
  VitrinaDetailContext,
  VitrinaEntity,
  VitrinaLabels,
  VitrinaProps,
  VitrinaView,
} from '../types';
import type { DetailCopy, PanelPhase } from './machine';

/** reveal → the entrance wipe plays; cover → the exit wipe; none → static (a relay, or settled). */
export type PanelAnim = 'reveal' | 'cover' | 'none';

export interface DetailProps {
  entity: VitrinaEntity;
  /** The active origin instance — what the panel's copy stands for. Null when opened without one. */
  instanceId: string | null;
  panel: PanelPhase;
  /** Which copy of the active object is the visible one right now. */
  copy: DetailCopy;
  /** Whether the panel plays its entrance/exit wipe this commit. */
  panelAnim: PanelAnim;
  view: VitrinaView;
  /** The previous object flying home (the relay layer), or null. */
  relayEntity: VitrinaEntity | null;
  relayInstanceId: string | null;
  /** Whether the relay visual is currently mid-flight (shown) or parked (hidden). */
  relayFlying: boolean;
  /**
   * The body portal may be created (client, post-first-effect). Owned by the
   * orchestrator, which never unmounts — so it is already true when the panel
   * opens, and the flight layer exists in the SAME commit as the click, not a
   * frame later. False on the server and the very first client render (SSR-safe).
   */
  portalReady: boolean;
  renderObject: VitrinaProps['renderObject'];
  renderDetail: VitrinaProps['renderDetail'];
  labels: VitrinaLabels;
  detailContext: VitrinaDetailContext;
  panelRef: RefObject<HTMLDivElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
  slotRef: RefObject<HTMLDivElement | null>;
  flightRef: RefObject<HTMLDivElement | null>;
  relayRef: RefObject<HTMLDivElement | null>;
}

/*
 * All structure — the panel layer's position and stacking, the wrapper, the
 * card's scroll+mask, the slot's box, the portal wrapper (the ONE element that
 * carries `--vitrina-z-flight`: the node that competes against the panel in the
 * document's root stacking context), the inner layers and the flight visuals —
 * lives in base.css, keyed on these data attributes. Inline here is only what
 * the machine computes per commit: which copy is visible.
 */

export function Detail({
  entity,
  instanceId,
  panel,
  copy,
  panelAnim,
  view,
  relayEntity,
  relayInstanceId,
  relayFlying,
  portalReady,
  renderObject,
  renderDetail,
  labels,
  detailContext,
  panelRef,
  cardRef,
  slotRef,
  flightRef,
  relayRef,
}: DetailProps) {
  const objectContext = {
    instanceId: instanceId ?? entity.id,
    isActive: true,
    isRevealed: true,
    view,
  };

  const flightLayers = (
    /*
     * Stamped `data-vitrina-root` so the stacking tokens and any theme custom
     * properties (all scoped to `[data-vitrina-root]`) resolve here too — this
     * subtree lives on `body`, outside the widget's own root. `pointer-events:
     * none`, `aria-hidden`: it is decoration, and the panel/plane keep the
     * hit-test. Both the active clone and the relay are FLYING objects on the
     * flight rung; two layers only so they can move independently (crossfade).
     */
    <div data-vitrina-root="" data-vitrina-flight-portal="" aria-hidden="true">
      <div data-vitrina-relay-layer="">
        <div
          ref={relayRef}
          data-vitrina-relay=""
          style={{ visibility: relayFlying ? 'visible' : 'hidden' }}
        >
          {relayEntity &&
            renderObject(relayEntity, {
              instanceId: relayInstanceId ?? relayEntity.id,
              isActive: true,
              isRevealed: true,
              view,
            })}
        </div>
      </div>

      <div data-vitrina-flight-layer="">
        <div
          ref={flightRef}
          data-vitrina-flight=""
          style={{ visibility: copy === 'flight' ? 'visible' : 'hidden' }}
        >
          {renderObject(entity, objectContext)}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div data-vitrina-detail="" data-vitrina-panel-phase={panel}>
        <div
          ref={panelRef}
          data-vitrina-panel=""
          data-vitrina-panel-phase={panel}
          data-vitrina-panel-anim={panelAnim}
          // Same reason as the plane viewport: a nested scroller Lenis does not
          // know about loses its wheel. Inert without Lenis.
          data-lenis-prevent=""
          role="dialog"
          aria-label={labels.objectLabel(entity)}
          tabIndex={-1}
        >
          <div ref={cardRef} data-vitrina-panel-card="">
            {/*
              The active object's copy is always in the DOM so the slot can be
              measured as the flight's destination (a `display: none` box has no
              rect); shown only while it is the one visible copy.
            */}
            <div
              ref={slotRef}
              data-vitrina-slot=""
              style={{ visibility: copy === 'panel' ? 'visible' : 'hidden' }}
            >
              {renderObject(entity, objectContext)}
            </div>
            <div data-vitrina-detail-content="">{renderDetail?.(entity, detailContext)}</div>
          </div>
        </div>
      </div>

      {portalReady ? createPortal(flightLayers, document.body) : null}
    </>
  );
}
