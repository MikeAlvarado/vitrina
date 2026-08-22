/*
 * Instance generation. PURE: no React, no GSAP, no DOM, no side effects — fully
 * deterministic given its inputs. Public API: consumers may run it at build time and
 * paste the output, or run it, hand-edit three positions, and pass the array back in.
 *
 * The naive version — repeat entities to fill `count`, shuffle, place — puts two
 * copies of the same object side by side, repeatedly. Nobody reads that as density;
 * they read it as a bug. Hence the three phases below: assign (least-used walk with
 * deferral), repair (swap away residual separation violations), materialize
 * (positions, sizes, ids).
 */

import type { VitrinaEntity, VitrinaInstance, VitrinaLayout } from '../types';
import { resolveLayout } from '../defaults';
import { createRng } from './rng';

/**
 * Max per-column vertical offset, as a fraction of the grid step. Fixed per column,
 * so rows never line up across the plane.
 */
const COLUMN_STAGGER = 0.5;
/**
 * Per-cell position jitter, ± this fraction of the grid step on each axis. Palmer
 * runs a ~240 px cell inside a ~320 px step; the slack ((320 − 240) / 2 = 40 px)
 * is ~0.125 of the step.
 */
const CELL_JITTER = 0.125;
/**
 * Times a cell is requeued to wait for a friendlier least-used pool before the
 * separation radius is allowed to relax. Bounds assignment work at
 * (MAX_DEFERRALS + 1) × cells even when the constraint is unsatisfiable.
 */
const MAX_DEFERRALS = 8;

interface Cell {
  col: number;
  row: number;
}

interface Assignment {
  cell: Cell;
  entityId: string;
}

/** A generated instance plus its grid cell — exposed so tests can check separation. */
export interface PlacedInstance extends VitrinaInstance {
  col: number;
  row: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Round down to 2 decimals: keeps pasted output readable without ever crossing a bound. */
const floor2 = (v: number): number => Math.floor(v * 100) / 100;
const chebyshev = (a: Cell, b: Cell): number =>
  Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

/**
 * Greedy assignment dead-ends leave a handful of same-entity pairs closer than
 * `sep`. Swapping the entities of two cells removes such a violation whenever both
 * entities are clean at their new cells — and can never add one, so total violations
 * strictly decrease. Deterministic: canonical iteration order, no RNG.
 */
function repairSeparation(assignments: Assignment[], sep: number): void {
  if (sep <= 0) return;

  const cleanAt = (entityId: string, cell: Cell, ignore: Assignment[]): boolean => {
    for (const other of assignments) {
      if (other.entityId !== entityId || ignore.includes(other)) continue;
      if (chebyshev(other.cell, cell) <= sep) return false;
    }
    return true;
  };

  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const a of assignments) {
      if (cleanAt(a.entityId, a.cell, [a])) continue;
      for (const b of assignments) {
        if (b.entityId === a.entityId) continue;
        if (cleanAt(a.entityId, b.cell, [a, b]) && cleanAt(b.entityId, a.cell, [a, b])) {
          const tmp = a.entityId;
          a.entityId = b.entityId;
          b.entityId = tmp;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
}

export function generatePlacedInstances(
  entities: VitrinaEntity[],
  layout: Required<VitrinaLayout>,
): PlacedInstance[] {
  // Forgiving for untyped callers: undefined fields fall back to the defaults.
  const { world, count, columns, baseSize, sizeJitter, minSeparation, seed } = resolveLayout(layout);

  if (entities.length === 0 || count <= 0 || world.w <= 0 || world.h <= 0) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  if (byId.size !== entities.length) {
    throw new TypeError('vitrina: entity ids must be unique');
  }

  const rng = createRng(seed);
  const cols = Math.max(1, Math.floor(columns));
  const step = world.w / cols;
  const rows = Math.max(1, Math.floor(world.h / step));
  const totalCells = cols * rows;
  const placeCount = Math.min(Math.floor(count), totalCells);

  // Fixed per-column vertical offsets stagger the columns.
  const colOffsets: number[] = [];
  for (let c = 0; c < cols; c++) colOffsets.push(rng() * step * COLUMN_STAGGER);

  // Evenly sample `placeCount` cells from the row-major sequence…
  const cells: Cell[] = [];
  for (let i = 0; i < placeCount; i++) {
    const idx = Math.floor((i * totalCells) / placeCount);
    cells.push({ col: idx % cols, row: Math.floor(idx / cols) });
  }
  // …then walk them in seeded-shuffled order. A row-major walk would place
  // consecutive uses of one entity in near-adjacent cells by construction
  // (least-used cycling revisits an entity every ~entities.length cells, which is
  // about one row down); shuffling decorrelates walk order from grid geometry.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cells[i]!;
    cells[i] = cells[j]!;
    cells[j] = tmp;
  }

  // ── Phase A: assign entities to cells ──────────────────────────────────────
  // Balance is the invariant, separation is best-effort: candidates come only from
  // the least-used entities. When none of them satisfies the full separation at a
  // cell, the cell is DEFERRED (requeued, bounded) — near the end of a round the
  // pool is one or two entities, and waiting for it to rotate resolves almost every
  // conflict that immediate relaxation would have baked in. Only once deferrals are
  // exhausted does the radius relax toward 0. So max(uses) − min(uses) ≤ 1 holds
  // unconditionally, and the generator never throws — with 3 entities and 90 cells
  // the constraint is unsatisfiable by construction, and the plane must still render.
  const fullSep = Math.max(0, Math.floor(minSeparation));
  const uses = new Map<string, number>();
  for (const e of entities) uses.set(e.id, 0);
  const placedCells = new Map<string, Cell[]>();
  const assignments: Assignment[] = [];

  const separated = (entityId: string, cell: Cell, sep: number): boolean => {
    const placed = placedCells.get(entityId);
    if (!placed) return true;
    for (const p of placed) {
      if (chebyshev(p, cell) <= sep) return false;
    }
    return true;
  };

  const queue: { cell: Cell; deferrals: number }[] = cells.map((cell) => ({
    cell,
    deferrals: 0,
  }));

  for (let qi = 0; qi < queue.length; qi++) {
    const { cell, deferrals } = queue[qi]!;

    let minUse = Infinity;
    for (const n of uses.values()) if (n < minUse) minUse = n;
    const pool = entities.filter((e) => uses.get(e.id) === minUse);

    let candidates = pool.filter((e) => separated(e.id, cell, fullSep));
    if (candidates.length === 0) {
      if (deferrals < MAX_DEFERRALS) {
        queue.push({ cell, deferrals: deferrals + 1 });
        continue;
      }
      for (let sep = fullSep - 1; sep >= 0; sep--) {
        candidates = pool.filter((e) => separated(e.id, cell, sep));
        if (candidates.length > 0) break;
      }
    }
    // At sep 0 the constraint only excludes this exact cell, which is empty, so
    // `candidates` cannot be empty here. Ties break by seeded RNG, never array order.
    const entity = candidates[Math.floor(rng() * candidates.length)]!;

    uses.set(entity.id, (uses.get(entity.id) ?? 0) + 1);
    let placed = placedCells.get(entity.id);
    if (!placed) {
      placed = [];
      placedCells.set(entity.id, placed);
    }
    placed.push(cell);
    assignments.push({ cell, entityId: entity.id });
  }

  // ── Phase B: repair residual violations by swapping ────────────────────────
  // Canonical (row-major) order first, so the repair walk — and everything after
  // it — is independent of the shuffled assignment order.
  assignments.sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
  // Cascade downward: when the full radius is unsatisfiable (too few entities),
  // later passes still trade far violations for near ones — an adjacent duplicate
  // is what reads as a bug. For satisfiable inputs the lower passes are no-ops.
  for (let sep = fullSep; sep >= 1; sep--) repairSeparation(assignments, sep);

  // ── Phase C: materialize positions, sizes, ids ─────────────────────────────
  const out: PlacedInstance[] = [];
  const counters = new Map<string, number>();

  for (const { cell, entityId } of assignments) {
    const jx = (rng() * 2 - 1) * step * CELL_JITTER;
    const jy = (rng() * 2 - 1) * step * CELL_JITTER;
    const entity = byId.get(entityId)!;

    const size = floor2(
      Math.min((entity.size ?? baseSize) * (1 + (rng() * 2 - 1) * sizeJitter), world.w, world.h),
    );
    const cx = (cell.col + 0.5) * step + jx;
    const cy = (cell.row + 0.5) * step + colOffsets[cell.col]! + jy;
    const x = floor2(clamp(cx - size / 2, 0, world.w - size));
    const y = floor2(clamp(cy - size / 2, 0, world.h - size));

    const n = (counters.get(entityId) ?? 0) + 1;
    counters.set(entityId, n);

    out.push({ id: `${entityId}-${n}`, entityId, x, y, size, col: cell.col, row: cell.row });
  }

  return out;
}

/**
 * Deterministic instance generation: same entities + same layout → the same plane,
 * always, on server and client alike. Instances come back in row-major reading order.
 */
export function generateInstances(
  entities: VitrinaEntity[],
  layout: Required<VitrinaLayout>,
): VitrinaInstance[] {
  return generatePlacedInstances(entities, layout).map((p) => ({
    id: p.id,
    entityId: p.entityId,
    x: p.x,
    y: p.y,
    size: p.size,
  }));
}
