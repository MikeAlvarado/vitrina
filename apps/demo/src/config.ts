import type { VitrinaPanelSide } from 'vitrina';

/**
 * What the config panel edits. Every field is a prop or a documented CSS token
 * of the library — the panel sets props on a fixed component and does nothing
 * else. It is not an editor, it exports nothing, and it produces no embeddable
 * artefact; GSAP's licence draws that line and the panel stays well behind it.
 */
export interface PlaneConfig {
  /** layout.count — how many instances the generator fills the world with. */
  count: number;
  /** layout.columns — the generator's grid width. */
  columns: number;
  /** layout.sizeJitter — ±fraction on each instance's size. */
  sizeJitter: number;
  /** layout.minSeparation — grid cells that must separate two copies of one entity. */
  minSeparation: number;
  /** layout.seed — same seed, same plane, on the server and on every client. */
  seed: string;
  /** Which theme stylesheet paints the widget (and, here, the page around it). */
  theme: 'void' | 'paper';
  /** panelSide — which edge the detail panel occupies. */
  panelSide: VitrinaPanelSide;
}

export const DEFAULT_CONFIG: PlaneConfig = {
  count: 114,
  columns: 14,
  sizeJitter: 0.15,
  minSeparation: 2,
  seed: 'vitrina',
  theme: 'void',
  panelSide: 'right',
};

/** One line for the "this went to the plane" bar. */
export const summarise = (config: PlaneConfig): string =>
  `${config.count} objects · ${config.columns} columns · seed “${config.seed}”`;
