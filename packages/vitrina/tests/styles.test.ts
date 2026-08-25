// @vitest-environment node
/*
 * The shipped stylesheets, as text — the contracts that make base.css safe to
 * require and the themes safe to swap:
 *
 *  · base.css is structural and theme-blind: no color literal anywhere (the
 *    only color words it may utter are `transparent` and `currentColor`, both
 *    of them theme-neutral by construction);
 *  · NO `will-change` in any stylesheet: promotion is the interaction code's,
 *    put on when a gesture/tween starts and taken off when it settles — a
 *    permanently promoted layer squats on GPU memory;
 *  · every rule that declares overflow declares BOTH axes (an unset axis
 *    couples to the other and becomes a scroll container a native
 *    scroll-into-view can write to);
 *  · reduced motion is keyed on the root ATTRIBUTE, never a media query — the
 *    `reducedMotion` prop arbitrates and 'ignore' must animate with the
 *    preference on;
 *  · the motion tokens the runtime reads at mount all exist;
 *  · the two themes define the SAME token set, scoped to data attributes only
 *    (no classes, no bare element selectors), so swapping is a one-line change.
 */
import { describe, expect, it } from 'vitest';

import { baseCss, cssBodies, cssDecl, paperCss, voidCss } from './css';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensOf = (css: string): string[] =>
  Array.from(stripComments(css).matchAll(/--vitrina-[\w-]+(?=\s*:)/g), (m) => m[0]).sort();

describe('base.css is structural and theme-blind', () => {
  it('contains no color literal', () => {
    const source = stripComments(baseCss);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|color-mix)\(/);
    // Wherever base.css must touch a color-valued property (the button reset,
    // the focus ring), the value is theme-neutral: inherit, transparent, or a
    // theme token with a currentColor fallback. Nothing else qualifies.
    const colorValues = source.match(/(?:^|;|\{)\s*[\w-]*color\s*:\s*([^;}]+)/gm) ?? [];
    for (const decl of colorValues) {
      expect(decl).toMatch(/inherit|transparent|currentColor|var\(--vitrina-/);
    }
    expect(source).not.toMatch(/\b(?:box-shadow|filter|background-image)\s*:/);
  });

  it('never declares will-change — promotion is the interaction code’s, per gesture', () => {
    for (const css of [baseCss, paperCss, voidCss]) {
      expect(stripComments(css)).not.toMatch(/will-change/);
    }
  });

  it('every overflow declaration comes with BOTH axes explicit', () => {
    const source = stripComments(baseCss);
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let scrollers = 0;
    for (let m = rule.exec(source); m; m = rule.exec(source)) {
      const body = m[2] ?? '';
      if (!/overflow/.test(body)) continue;
      scrollers++;
      expect(body, `selector ${m[1]?.trim()}`).toMatch(/overflow-x\s*:/);
      expect(body, `selector ${m[1]?.trim()}`).toMatch(/overflow-y\s*:/);
    }
    // The viewport, the grid, and the panel card at least — the check must not
    // pass by matching nothing.
    expect(scrollers).toBeGreaterThanOrEqual(3);
  });

  it('gates reduced motion on the root attribute, never on the media query', () => {
    expect(baseCss).not.toMatch(/prefers-reduced-motion/);
    const gated = cssDecl(
      '[data-vitrina-root][data-vitrina-reduced] [data-vitrina-panel-card]',
      'animation',
    );
    expect(gated).toBe('none');
  });

  it('centres and caps the content of every object copy — renderObject gets a ready-sized box', () => {
    for (const selector of [
      '[data-vitrina-object-content]',
      '[data-vitrina-slot]',
      '[data-vitrina-flight]',
      '[data-vitrina-relay]',
    ]) {
      const body = cssBodies(selector).join(';');
      expect(body, selector).toMatch(/place-items\s*:\s*center/);
      // A size container: text content takes its size from the box (cqmin).
      expect(body, selector).toMatch(/container-type\s*:\s*size/);
      expect(cssDecl(`${selector} > *`, 'max-width'), selector).toBe('100%');
      expect(cssDecl(`${selector} > *`, 'max-height'), selector).toBe('100%');
      expect(cssDecl(`${selector} > *`, 'font-size'), selector).toBe(
        'var(--vitrina-object-font-size)',
      );
      // The real case — an image — fills the box with no work from the consumer.
      for (const child of ['img', 'svg'] as const) {
        expect(cssDecl(`${selector} > ${child}`, 'width'), selector).toBe('100%');
        expect(cssDecl(`${selector} > ${child}`, 'height'), selector).toBe('100%');
        expect(cssDecl(`${selector} > ${child}`, 'object-fit'), selector).toBe('contain');
      }
    }
    // The default is relative to the box, not an absolute size.
    expect(cssDecl('[data-vitrina-root]', '--vitrina-object-font-size')).toMatch(/cqmin$/);
  });

  it('the object button never clips its content node — the pop ease overshoots past the box', () => {
    // The content node fills the button; the pop animates IT, never the button.
    expect(cssDecl('[data-vitrina-object-content]', 'width')).toBe('100%');
    expect(cssDecl('[data-vitrina-object-content]', 'height')).toBe('100%');
    // And the button declares nothing that could clip or contain the overshoot
    // frame: no overflow, no contain, no container-type. The overshoot getting
    // clipped to the content-box was a real bug.
    const body = cssBodies('[data-vitrina-object]').join(';');
    expect(body).not.toMatch(/overflow/);
    expect(body).not.toMatch(/contain/);
  });

  it('paints no button surface — the object is a cut-out, the shadow follows the silhouette', () => {
    const body = cssBodies('[data-vitrina-object]').join(';');
    // `appearance: auto` alone lets some engines paint the native button face.
    expect(body).toMatch(/appearance\s*:\s*none/);
    expect(cssDecl('[data-vitrina-object]', 'background')).toBe('transparent');
    // And the themes repeat it where they attach the drop-shadow: a theme owns
    // ALL paint, so the transparent ground is part of its contract too.
    for (const css of [paperCss, voidCss]) {
      for (const selector of [
        '[data-vitrina-object]',
        '[data-vitrina-slot]',
        '[data-vitrina-flight]',
        '[data-vitrina-relay]',
      ]) {
        expect(cssDecl(selector, 'background', css), selector).toBe('transparent');
      }
    }
  });

  it('the root fills its container — a sized host is all the README example needs', () => {
    expect(cssDecl('[data-vitrina-root]', 'width')).toBe('100%');
    expect(cssDecl('[data-vitrina-root]', 'height')).toBe('100%');
  });

  it('defines every motion token the runtime reads at mount', () => {
    const required = [
      '--vitrina-dur-micro',
      '--vitrina-dur-ui',
      '--vitrina-dur-flight',
      '--vitrina-dur-panel',
      '--vitrina-ease-micro',
      '--vitrina-ease-flight',
      '--vitrina-stagger-line',
      '--vitrina-stagger-line-exit',
    ];
    for (const token of required) {
      expect(cssDecl('[data-vitrina-root]', token), token).not.toBeNull();
    }
  });
});

describe('the composable panel', () => {
  const SIDES = ['left', 'right', 'top', 'bottom'] as const;
  const panelAt = (side: string) => `[data-vitrina-panel][data-vitrina-panel-side='${side}']`;

  it('sizes each side with --vitrina-panel-size on the axis the side dictates, and aims the wipe with the clip variable', () => {
    for (const side of SIDES) {
      const horizontal = side === 'left' || side === 'right';
      expect(cssDecl(panelAt(side), horizontal ? 'width' : 'height'), side).toBe(
        'var(--vitrina-panel-size)',
      );
      // The cross axis is pinned by the insets, not sized by the token.
      expect(cssDecl(panelAt(side), horizontal ? 'height' : 'width'), side).toBeNull();
      // Each side declares the hidden clip the keyframes consume: changing the
      // side re-aims the mask without touching the animation.
      expect(cssDecl(panelAt(side), '--vitrina-panel-clip'), side).toMatch(/^inset\(/);
    }
    // One pair of keyframes serves all four sides, off the variable.
    expect(baseCss).toMatch(/@keyframes vitrina-panel-reveal[\s\S]*?var\(--vitrina-panel-clip/);
    expect(baseCss).toMatch(/@keyframes vitrina-panel-cover[\s\S]*?var\(--vitrina-panel-clip/);
    // The tokens themselves exist with usable defaults.
    expect(cssDecl('[data-vitrina-root]', '--vitrina-panel-size')).not.toBeNull();
    expect(cssDecl('[data-vitrina-root]', '--vitrina-panel-fixed-inset')).not.toBeNull();
  });

  it('the content column is a flex column with min-height 100% — the slack margin-top: auto pushes against', () => {
    expect(cssDecl('[data-vitrina-panel-content]', 'display')).toBe('flex');
    expect(cssDecl('[data-vitrina-panel-content]', 'flex-direction')).toBe('column');
    expect(cssDecl('[data-vitrina-panel-content]', 'min-height')).toBe('100%');
    // The content reserves the fixed region's band through the token, not a guess.
    expect(cssDecl('[data-vitrina-panel-content]', 'padding')).toBe(
      'var(--vitrina-panel-fixed-inset)',
    );
  });

  it('the slot can shrink beside renderBeside (min-width: 0), and the row too', () => {
    expect(cssDecl('[data-vitrina-slot]', 'min-width')).toBe('0');
    expect(cssDecl('[data-vitrina-panel-row]', 'display')).toBe('flex');
    expect(cssDecl('[data-vitrina-panel-row]', 'min-width')).toBe('0');
  });

  it('the fixed region overlays the card without scrolling or eating its pointer', () => {
    // Absolute within the wrapper — outside the card, which is the ONLY scroll
    // container, so it can never scroll away; and it declares no overflow of
    // its own (nothing to hand a scroll offset to).
    expect(cssDecl('[data-vitrina-panel-fixed]', 'position')).toBe('absolute');
    expect(cssDecl('[data-vitrina-panel-fixed]', 'inset')).toBe('0');
    expect(cssBodies('[data-vitrina-panel-fixed]').join(';')).not.toMatch(/overflow/);
    // The region spans the card but must not block it: none on the region, auto
    // on what the consumer mounts in it.
    expect(cssDecl('[data-vitrina-panel-fixed]', 'pointer-events')).toBe('none');
    expect(cssDecl('[data-vitrina-panel-fixed] > *', 'pointer-events')).toBe('auto');
  });

  it('both themes seam the card on whichever edge faces the plane', () => {
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;
    for (const css of [paperCss, voidCss]) {
      for (const side of SIDES) {
        const selector = `[data-vitrina-panel-side='${side}'] [data-vitrina-panel-card]`;
        expect(cssDecl(selector, `border-${opposite[side]}`, css), side).toMatch(
          /var\(--vitrina-seam\)/,
        );
      }
    }
  });
});

describe('the themes', () => {
  it('define the same token set — swapping themes is a one-line change', () => {
    expect(tokensOf(paperCss)).toEqual(tokensOf(voidCss));
    expect(tokensOf(paperCss)).toContain('--vitrina-page');
    expect(tokensOf(paperCss)).toContain('--vitrina-focus');
    expect(tokensOf(paperCss)).toContain('--vitrina-object-shadow');
  });

  it('scope every rule to a data-vitrina attribute — no classes, no bare elements', () => {
    for (const css of [paperCss, voidCss]) {
      const rule = /([^{}]+)\{[^{}]*\}/g;
      const source = stripComments(css);
      for (let m = rule.exec(source); m; m = rule.exec(source)) {
        for (const selector of (m[1] ?? '').split(',')) {
          expect(selector.trim(), selector).toMatch(/^\[data-vitrina-/);
        }
      }
    }
  });

  it('paper drops a dark diffuse shadow; void carries a centred halo instead', () => {
    const paperShadow = cssDecl('[data-vitrina-root]', '--vitrina-object-shadow', paperCss) ?? '';
    const voidShadow = cssDecl('[data-vitrina-root]', '--vitrina-object-shadow', voidCss) ?? '';
    // Paper: offset downward (a shadow BELOW the object), dark ink.
    expect(paperShadow).toMatch(/drop-shadow\(0 \d+px/);
    // Void: zero-offset (a halo around the object), no downward offset at all.
    expect(voidShadow).toMatch(/drop-shadow\(0 0 /);
    expect(voidShadow).not.toMatch(/drop-shadow\(0 \d+px/);
    // Both themes paint the same set of copies: every visible copy of an object
    // carries the same treatment, so nothing changes weight mid-flight.
    for (const css of [paperCss, voidCss]) {
      for (const selector of [
        '[data-vitrina-object]',
        '[data-vitrina-slot]',
        '[data-vitrina-flight]',
        '[data-vitrina-relay]',
      ]) {
        expect(cssDecl(selector, 'filter', css)).toBe('var(--vitrina-object-shadow)');
      }
    }
  });

  it('base.css consumes the z tokens on the four competing nodes', () => {
    expect(cssDecl('[data-vitrina-viewport]', 'z-index')).toBe('var(--vitrina-z-plane)');
    expect(cssDecl('[data-vitrina-grid]', 'z-index')).toBe('var(--vitrina-z-plane)');
    expect(cssDecl('[data-vitrina-controls]', 'z-index')).toBe('var(--vitrina-z-controls)');
    expect(cssDecl('[data-vitrina-detail]', 'z-index')).toBe('var(--vitrina-z-panel)');
    expect(cssDecl('[data-vitrina-flight-portal]', 'z-index')).toBe('var(--vitrina-z-flight)');
    // And on nothing else: one rung per layer, nothing rises per-object.
    expect(cssBodies('[data-vitrina-object]').join(';')).not.toMatch(/z-index/);
  });
});
