/*
 * The entire public surface of `vitrina`. If it is not exported here, it does not
 * exist to consumers.
 */

export type {
  VitrinaEntity,
  VitrinaInstance,
  VitrinaLayout,
  VitrinaView,
  VitrinaDetailPhase,
  VitrinaOpenCollision,
  VitrinaObjectContext,
  VitrinaDetailContext,
  VitrinaLabels,
  VitrinaApi,
  VitrinaProps,
} from './types';

export { Vitrina } from './Vitrina';
export { VitrinaControls } from './VitrinaControls';
export type { VitrinaControlsProps } from './VitrinaControls';
export { useVitrina } from './context';
export { generateInstances } from './layout/generate';
export { DEFAULT_LAYOUT, resolveLayout } from './defaults';
