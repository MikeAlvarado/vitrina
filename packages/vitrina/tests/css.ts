/*
 * Assertions against the SHIPPED stylesheet. From step 7 base.css owns the
 * structure (positioning, stacking, overflow, focus geometry), so the DOM tests
 * can no longer read those as inline styles — and jsdom's getComputedStyle does
 * not cascade attribute-selector rules reliably enough to assert through it.
 * Instead the tests assert the stylesheet TEXT itself: the exact rule the
 * browser will apply to the attribute the component stamps.
 *
 * The parser is deliberately naive (strip comments, split on braces): base.css
 * is ours, written in plain `selector { prop: value; }` blocks. @keyframes
 * bodies surface as unmatched selectors ('from', 'to') and never collide with
 * an attribute selector.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Not `new URL(..., import.meta.url)`: Vite rewrites that exact pattern into an
// asset reference resolved against the (jsdom) page origin, and the read lands
// on a phantom http URL instead of the repository file.
const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(resolve(here, '../src/styles', name), 'utf8');

export const baseCss = load('base.css');
export const paperCss = load('paper.css');
export const voidCss = load('void.css');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (selector: string) => selector.replace(/\s+/g, ' ').trim();

/** Every declaration body whose rule's selector list contains `selector` exactly. */
export function cssBodies(selector: string, css = baseCss): string[] {
  const wanted = normalize(selector);
  const bodies: string[] = [];
  const source = stripComments(css);
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(source); m; m = rule.exec(source)) {
    const selectors = (m[1] ?? '').split(',').map(normalize);
    if (selectors.includes(wanted)) bodies.push(m[2] ?? '');
  }
  return bodies;
}

/**
 * The value the stylesheet gives `prop` under `selector` (the last declaration
 * wins, like the cascade), or null when no matching rule declares it.
 */
export function cssDecl(selector: string, prop: string, css = baseCss): string | null {
  let value: string | null = null;
  for (const body of cssBodies(selector, css)) {
    const decl = new RegExp(`(?:^|;)\\s*${prop.replace(/[-[\]]/g, '\\$&')}\\s*:\\s*([^;]+)`, 'g');
    for (let m = decl.exec(body); m; m = decl.exec(body)) {
      value = (m[1] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return value;
}
