/*
 * The motion tokens, read from the stylesheet ONCE at mount — one
 * getComputedStyle call on the root, never a read per interaction and never per
 * frame. The CSS custom properties in base.css are the single source of truth
 * for the choreography (the panel wipe consumes them directly; every GSAP tween
 * consumes them through here), so no animation number lives in a component.
 * Retuning a token applies on the next mount.
 *
 * The duration tokens are CSS times (`0.6s`, `450ms`). The EASE tokens hold
 * GSAP ease strings (`power3.inOut`) — they drive tweens, and GSAP core does
 * not parse CSS timing functions; the wipe's own eases stay real
 * cubic-bezier()s in base.css.
 *
 * The constants in defaults.ts back every field when the stylesheet cannot
 * answer: SSR, jsdom, or a mount that raced the stylesheet.
 */

import {
  DETAIL_FLIGHT_EASE,
  DETAIL_FLIGHT_SECONDS,
  DETAIL_LINE_STAGGER_EXIT_SECONDS,
  DETAIL_LINE_STAGGER_SECONDS,
  DETAIL_PANEL_SECONDS,
  WHEEL_CHASE_EASE,
  WHEEL_CHASE_SECONDS,
  ZOOM_TWEEN_SECONDS,
} from './defaults';

export interface MotionTokens {
  /** `--vitrina-dur-micro` — the wheel chase. */
  durMicro: number;
  /** `--vitrina-dur-ui` — one discrete zoom step, and its pan re-clamp. */
  durUi: number;
  /** `--vitrina-dur-flight` — the detail flight, and the relay home. */
  durFlight: number;
  /** `--vitrina-dur-panel` — the wipe, each content line, the height tween. */
  durPanel: number;
  /** `--vitrina-ease-micro` — GSAP ease string for the wheel chase. */
  easeMicro: string;
  /** `--vitrina-ease-flight` — GSAP ease string for the flights and the view Flip. */
  easeFlight: string;
  /** `--vitrina-stagger-line` — gap between content-line starts on the way in. */
  staggerLine: number;
  /** `--vitrina-stagger-line-exit` — the tighter gap on the way out. */
  staggerLineExit: number;
}

export const FALLBACK_MOTION: MotionTokens = {
  durMicro: WHEEL_CHASE_SECONDS,
  durUi: ZOOM_TWEEN_SECONDS,
  durFlight: DETAIL_FLIGHT_SECONDS,
  durPanel: DETAIL_PANEL_SECONDS,
  easeMicro: WHEEL_CHASE_EASE,
  easeFlight: DETAIL_FLIGHT_EASE,
  staggerLine: DETAIL_LINE_STAGGER_SECONDS,
  staggerLineExit: DETAIL_LINE_STAGGER_EXIT_SECONDS,
};

/** A CSS time (`0.6s` / `450ms`) in seconds, or the fallback when absent/invalid. */
function seconds(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return fallback;
  return raw.endsWith('ms') ? value / 1000 : value;
}

function ease(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = style.getPropertyValue(name).trim();
  return raw || fallback;
}

/** All tokens in one getComputedStyle call. SSR/jsdom-safe: falls back whole. */
export function readMotionTokens(root: Element | null): MotionTokens {
  if (!root || typeof getComputedStyle !== 'function') return FALLBACK_MOTION;
  const style = getComputedStyle(root);
  return {
    durMicro: seconds(style, '--vitrina-dur-micro', FALLBACK_MOTION.durMicro),
    durUi: seconds(style, '--vitrina-dur-ui', FALLBACK_MOTION.durUi),
    durFlight: seconds(style, '--vitrina-dur-flight', FALLBACK_MOTION.durFlight),
    durPanel: seconds(style, '--vitrina-dur-panel', FALLBACK_MOTION.durPanel),
    easeMicro: ease(style, '--vitrina-ease-micro', FALLBACK_MOTION.easeMicro),
    easeFlight: ease(style, '--vitrina-ease-flight', FALLBACK_MOTION.easeFlight),
    staggerLine: seconds(style, '--vitrina-stagger-line', FALLBACK_MOTION.staggerLine),
    staggerLineExit: seconds(style, '--vitrina-stagger-line-exit', FALLBACK_MOTION.staggerLineExit),
  };
}

/** The read-once contract, as a type the components share: call it lazily, never per frame. */
export type GetMotion = () => MotionTokens;
