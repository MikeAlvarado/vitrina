/*
 * The entire public surface of `vitrina`. If it is not exported here, it does not
 * exist to consumers.
 */

export type {
  VitrinaEntity,
  VitrinaInstance,
  VitrinaLayout,
  VitrinaView,
  VitrinaObjectContext,
  VitrinaDetailContext,
  VitrinaLabels,
  VitrinaProps,
} from './types';

export { generateInstances } from './layout/generate';
export { DEFAULT_LAYOUT, resolveLayout } from './defaults';
