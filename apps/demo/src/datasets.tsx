/*
 * The two datasets, each as one object: entities, labels, and the render props
 * that draw them. `<Vitrina>` is mounted ONCE in App.tsx and receives whichever
 * of these is selected — the toggle swaps data and render props, never the
 * component. That is the claim the second dataset exists to make, and the only
 * honest way to make it is to have a single mount site.
 *
 * Note what is NOT here: nothing about panning, zooming, revealing, flying or
 * stacking. Those are the library's. What the consumer owns is the content, the
 * copy, and every string a person can read.
 */

import type { ReactNode } from 'react';
import type { VitrinaDetailContext, VitrinaEntity, VitrinaLabels } from 'vitrina';

import { GLYPHS, glyphImage, type Glyph } from './data/emoji';
import { RECORD_BASE, SPECIMENS, specimenImage, type Specimen } from './data/minerals';

export type DatasetId = 'minerals' | 'emoji';

export interface Dataset {
  id: DatasetId;
  /** The label on the toggle. */
  name: string;
  /** One line, for the toggle's card. */
  blurb: string;
  entities: VitrinaEntity[];
  labels: VitrinaLabels;
  renderObject: (entity: VitrinaEntity) => ReactNode;
  /** The grid card's copy, under the object. The grid is the catalogue view. */
  renderCard: (entity: VitrinaEntity) => ReactNode;
  /** The catalogue's heading, inside the grid's own scroll container. */
  renderGridHeader: () => ReactNode;
  renderAbove: (entity: VitrinaEntity) => ReactNode;
  renderDetail: (entity: VitrinaEntity) => ReactNode;
  renderBelow: (entity: VitrinaEntity, ctx: VitrinaDetailContext) => ReactNode;
  /** The body of `renderObject`, verbatim, for the section that compares them. */
  source: string;
}

const CONTROL_LABELS = {
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid',
  toPlane: 'Plane',
} as const;

/** Shared by both panels: the ← → pair and the position in the collection. */
const stepper = (ctx: VitrinaDetailContext, index: number, total: number): ReactNode => (
  <footer className="panel-foot" data-vitrina-line="">
    <button type="button" className="panel-step" onClick={() => ctx.step(-1)} aria-label="Previous">
      ←
    </button>
    <button type="button" className="panel-step" onClick={() => ctx.step(1)} aria-label="Next">
      →
    </button>
    <span className="count">
      {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </span>
  </footer>
);

/*
 * Shared by both catalogues. It renders INSIDE the grid's scroll container
 * (`renderGridHeader`), so it scrolls away with the cards instead of sitting
 * pinned over them — which is exactly what it would do as `children`.
 */
const catalogueHead = (title: string, count: number): ReactNode => (
  <div className="grid-head">
    <h2>{title}</h2>
    <p>{count} objects · one card per object, named</p>
  </div>
);

const spec = (term: string, value: ReactNode): ReactNode => (
  <div key={term}>
    <dt>{term}</dt>
    <dd>{value}</dd>
  </div>
);

// --- Minerals ---------------------------------------------------------------

const specimenOf = (entity: VitrinaEntity) => entity.data as Specimen;

const MINERAL_SOURCE = `renderObject={(entity) => {
  const specimen = entity.data as Specimen;
  return <img src={specimenImage(specimen.id)} alt="" draggable={false} />;
}}`;

export const minerals: Dataset = {
  id: 'minerals',
  name: 'Mineral specimens',
  blurb:
    '24 cut-out photographs from the Smithsonian’s Mineral Sciences collection. ' +
    'Every line in the panel is transcribed from the museum record.',
  entities: SPECIMENS.map((specimen) => ({
    id: specimen.id,
    size: specimen.size,
    data: specimen,
  })),
  labels: {
    ...CONTROL_LABELS,
    viewport: 'Mineral collection — drag to explore, click an object for its record',
    grid: 'Mineral collection, as a grid',
    objectLabel: (entity) => {
      const s = specimenOf(entity);
      return `${s.name}, ${s.locality}`;
    },
  },
  renderObject: (entity) => (
    // An image fills the box on its own (base.css sets object-fit: contain);
    // draggable={false} because a native image drag would eat the plane's.
    <img src={specimenImage(specimenOf(entity).id)} alt="" draggable={false} />
  ),
  /*
   * The grid is the plane's accessible alternative — and the view a visitor who
   * prefers reduced motion can be locked to. Twenty-four unnamed photographs
   * are a puzzle there; the name and the locality are what make it a catalogue.
   * It cannot be a branch of `renderObject`: that node is the card's button, at
   * a fixed cell, and it is what flies to and from the plane.
   */
  renderCard: (entity) => {
    const s = specimenOf(entity);
    return (
      <>
        <p className="card-name">{s.name}</p>
        <p className="card-sub">{s.locality}</p>
      </>
    );
  },
  renderGridHeader: () => catalogueHead('Mineral specimens', SPECIMENS.length),
  renderAbove: (entity) => {
    const s = specimenOf(entity);
    return (
      <header data-vitrina-line="">
        <p className="panel-eyebrow">
          <span>{s.collection}</span>
          <span>{s.catalogue}</span>
        </p>
        <h2 className="panel-title">{s.name}</h2>
        <p className="panel-sub">{s.locality}</p>
      </header>
    );
  },
  renderDetail: (entity) => {
    const s = specimenOf(entity);
    return (
      <>
        <dl className="panel-specs" data-vitrina-line="">
          {s.site ? spec('Site', s.site) : null}
          {s.cut ? spec('Cut', s.cut) : null}
          {s.weight ? spec('Weight', s.weight) : null}
          {s.color ? spec('Colour', s.color) : null}
          {s.modifier ? spec('Modifier', s.modifier) : null}
          {s.associated?.length ? spec('Associated', s.associated.join(', ')) : null}
          {spec('Catalogue', s.catalogue)}
        </dl>
        <p data-vitrina-line="" style={{ margin: 0 }}>
          <a className="panel-link" href={`${RECORD_BASE}${s.recordId}`} target="_blank" rel="noreferrer">
            Museum record ↗
          </a>
        </p>
      </>
    );
  },
  renderBelow: (entity, ctx) =>
    stepper(
      ctx,
      SPECIMENS.findIndex((s) => s.id === entity.id),
      SPECIMENS.length,
    ),
  source: MINERAL_SOURCE,
};

// --- Emoji ------------------------------------------------------------------

const glyphOf = (entity: VitrinaEntity) => entity.data as Glyph;

const EMOJI_SOURCE = `renderObject={(entity) => {
  const glyph = entity.data as Glyph;
  return <img src={glyphImage(glyph.character)} alt="" draggable={false} />;
}}`;

export const emoji: Dataset = {
  id: 'emoji',
  name: 'Emoji',
  blurb:
    'The same component with vector glyphs instead of photographs — no props ' +
    'changed, no styles overridden, nothing about the mechanic retuned.',
  entities: GLYPHS.map((glyph) => ({ id: glyph.id, size: 170, data: glyph })),
  labels: {
    ...CONTROL_LABELS,
    viewport: 'Emoji — drag to explore, click a glyph for its code point',
    grid: 'Emoji, as a grid',
    objectLabel: (entity) => glyphOf(entity).name,
  },
  renderObject: (entity) => (
    <img src={glyphImage(glyphOf(entity).character)} alt="" draggable={false} />
  ),
  renderCard: (entity) => {
    const g = glyphOf(entity);
    return (
      <>
        <p className="card-name">{g.name}</p>
        <p className="card-sub">{g.codePoint}</p>
      </>
    );
  },
  renderGridHeader: () => catalogueHead('Emoji', GLYPHS.length),
  renderAbove: (entity) => {
    const g = glyphOf(entity);
    return (
      <header data-vitrina-line="">
        <p className="panel-eyebrow">
          <span>Twemoji</span>
          <span>CC-BY 4.0</span>
        </p>
        <h2 className="panel-title">{g.name}</h2>
        <p className="panel-sub">{g.codePoint}</p>
      </header>
    );
  },
  renderDetail: (entity) => {
    const g = glyphOf(entity);
    return (
      <>
        <dl className="panel-specs" data-vitrina-line="">
          {spec('Code point', g.codePoint)}
          {spec('Block', g.block)}
          {spec('Since', g.since)}
          {spec('As text', <span className="glyph-text">{g.character}</span>)}
        </dl>
        <p className="panel-note" data-vitrina-line="">
          The plane draws the vector file, not the character above. On macOS,
          Chrome renders emoji text from a bitmap font with fixed-size strikes:
          under an animated scale the glyph snaps between strikes, which looks
          exactly like a broken animation and is not one. Vector art scales.
        </p>
      </>
    );
  },
  renderBelow: (entity, ctx) =>
    stepper(
      ctx,
      GLYPHS.findIndex((g) => g.id === entity.id),
      GLYPHS.length,
    ),
  source: EMOJI_SOURCE,
};

export const DATASETS: Record<DatasetId, Dataset> = { minerals, emoji };
