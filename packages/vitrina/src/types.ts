import type { CSSProperties, ReactNode } from 'react';

/**
 * The two collections: entities are what exists, instances are where copies appear.
 * They are separate because a plane with 15 objects reads as empty and the fix is to
 * repeat each object a dozen times — but the detail panel must know that all copies
 * of an object are the same thing.
 */
export interface VitrinaEntity {
  /** Stable, unique. Used for Flip pairing and for the active-item URL. */
  id: string;
  /**
   * Reference diameter in px at zoom 1. Instances jitter around this.
   * Optional — falls back to `layout.baseSize`.
   */
  size?: number;
  /**
   * Anything the consumer wants. The library never reads inside this;
   * it hands it back to `renderObject` and `renderDetail` verbatim.
   */
  data?: unknown;
}

export interface VitrinaInstance {
  /** Unique per instance, not per entity. `${entityId}-${n}` is the generated convention. */
  id: string;
  entityId: string;
  /** Top-left in world coordinates, px. */
  x: number;
  y: number;
  /** Rendered diameter in px at zoom 1. */
  size: number;
}

export interface VitrinaLayout {
  /**
   * Fixed world size in px — NOT a multiple of the viewport.
   * A fixed world is what makes density constant: a wider screen shows MORE objects
   * rather than the same objects further apart. Palmer uses 4645×3044.
   */
  world?: { w: number; h: number };
  /** Same, for viewports below `compactBreakpoint`. */
  compactWorld?: { w: number; h: number };
  compactBreakpoint?: number;
  /** Target instance count. Generation fills up to this. */
  count?: number;
  columns?: number;
  /** Default entity diameter when an entity omits `size`. */
  baseSize?: number;
  /** ±fraction applied to each instance's size. 0.15 = ±15%. */
  sizeJitter?: number;
  /** Grid cells that must separate two instances of the same entity. */
  minSeparation?: number;
  /** Seed for all pseudo-randomness. Same seed → same plane, always. */
  seed?: string;
  /**
   * Below this factor of the viewport, objects shrink.
   * Applied to size and to grid step together.
   */
  compactSizeFactor?: number;
}

export type VitrinaView = 'plane' | 'grid';

/**
 * The detail flight, as the explicit state machine it is:
 * `idle → opening → open → closing → idle`. Exactly one copy of the active
 * object is visible in every phase — on the plane, in flight, or in the panel.
 */
export type VitrinaDetailPhase = 'idle' | 'opening' | 'open' | 'closing';

/**
 * What happens when an object is opened while another is already open.
 * - 'serialize' (default): the current object flies back, then the new one flies
 *   in. Exactly one copy visible at every moment — the machine's invariant intact.
 * - 'crossfade': the current object dissolves in the panel while the new one flies
 *   in. Faster; the two that animate are always different entities, so no frame
 *   ever shows two copies of the same object.
 */
export type VitrinaOpenCollision = 'serialize' | 'crossfade';

export interface VitrinaObjectContext {
  instanceId: string;
  isActive: boolean;
  isRevealed: boolean;
  view: VitrinaView;
}

export interface VitrinaDetailContext {
  close(): void;
  next(): void;
  prev(): void;
  view: VitrinaView;
}

/**
 * Every user-visible string. The library ships NO copy and NO default language.
 * These are aria-labels only; nothing here is rendered as visible text by the
 * library itself.
 */
export interface VitrinaLabels {
  /** aria-label for the plane viewport. e.g. "Explorable plane of objects" */
  viewport: string;
  /** aria-label for the grid region. Optional: falls back to `viewport`. */
  grid?: string;
  /** Given an entity, the accessible name of its button. */
  objectLabel: (entity: VitrinaEntity) => string;
  closeDetail: string;
  zoomIn: string;
  zoomOut: string;
  toGrid: string;
  toPlane: string;
}

/**
 * What `useVitrina()` returns: the state and transitions the library owns, for
 * consumers to build their own chrome on — the library renders no buttons.
 * Grows with the mechanic: view and active-item state join in later steps.
 */
export interface VitrinaApi {
  zoomSteps: readonly number[];
  zoomIndex: number;
  /** `zoomSteps[zoomIndex]` — the scale the zoom layer is heading to. */
  zoom: number;
  zoomIn(): void;
  zoomOut(): void;
  setZoomIndex(index: number): void;
  /** The current view. Plane objects Flip into grid cards and back. */
  view: VitrinaView;
  setView(view: VitrinaView): void;
  toggleView(): void;
  /**
   * True while `reducedMotion: 'grid'` is in effect (the visitor prefers reduced
   * motion): the view is fixed to the grid, and `setView`, `toggleView`, and the
   * zoom transitions are no-ops. Chrome should hide the toggle and the zoom.
   */
  viewLocked: boolean;
  /** The entity in the detail panel, or null. Mirrors the `activeId` prop when controlled. */
  activeId: string | null;
  detailPhase: VitrinaDetailPhase;
  /**
   * Opens an entity's detail. With `instanceId` — the instance the object flies
   * from and returns to, and where focus goes back on close — it is what a click
   * on that instance does. Without one there is no flight: the panel just opens.
   */
  openDetail(entityId: string, instanceId?: string | null): void;
  closeDetail(): void;
}

export interface VitrinaProps {
  entities: VitrinaEntity[];

  /** Omit and instances are generated. Provide and generation is skipped entirely. */
  instances?: VitrinaInstance[];
  layout?: VitrinaLayout;

  /** The object itself. Called once per instance. Must be pure and cheap. */
  renderObject: (entity: VitrinaEntity, ctx: VitrinaObjectContext) => ReactNode;

  /**
   * The contents of the detail panel. The library owns the panel shell and the
   * flight — and the slot the object lands in, drawn with `renderObject` — and
   * renders nothing else inside: no close button, no copy. `ctx.close()` is how
   * the consumer's own close control works; Escape always does.
   */
  renderDetail?: (entity: VitrinaEntity, ctx: VitrinaDetailContext) => ReactNode;

  /** Controlled active item. Omit for uncontrolled. */
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string | null) => void;

  /** How opening an object while another is open behaves. Defaults to 'serialize'. */
  openCollision?: VitrinaOpenCollision;

  /** Controlled view. Omit for uncontrolled. */
  view?: VitrinaView;
  defaultView?: VitrinaView;
  onViewChange?: (view: VitrinaView) => void;

  /** Discrete zoom steps, and which index is the resting state. */
  zoomSteps?: number[];
  defaultZoomIndex?: number;

  /**
   * 'respect' (default): no intro, no pops, no inertia; drag and wheel still work.
   * 'grid': lock to grid view, no toggle, no zoom.
   * 'ignore': animate regardless. This is an accessibility decision the consumer
   * is taking on themselves.
   */
  reducedMotion?: 'respect' | 'grid' | 'ignore';

  labels: VitrinaLabels;

  className?: string;
  style?: CSSProperties;

  /**
   * Optional chrome, rendered inside the root, above the plane — the subtree
   * where `useVitrina()` resolves. The library itself renders no controls.
   */
  children?: ReactNode;
}
