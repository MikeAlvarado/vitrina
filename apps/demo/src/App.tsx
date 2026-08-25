/*
 * One page, one <Vitrina>. The sections below the fold set props on the mount
 * up here — that is the whole architecture, and it is also the demo's argument:
 * everything a visitor can change is a prop, and none of it needs the library's
 * source.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Vitrina, VitrinaControls } from 'vitrina';
import type { VitrinaLayout } from 'vitrina';

/*
 * base.css is MANDATORY and imported normally — it owns the structure: layer
 * positioning, the stacking scale, overflow on both axes, transform-origin,
 * touch-action, the focus-ring geometry, the panel wipe, every token.
 *
 * void.css is the theme, also imported normally: the documented contract is
 * EXACTLY ONE theme import, and this is what a real consumer writes. The config
 * panel's paper option is the exception, and it is handled the only way a live
 * switch can be handled — the alternative theme is pulled in as text (?inline)
 * and injected into a <style> when it is selected. Importing both for real
 * would leave the outcome to file order, and a CSS minifier that noticed the
 * two sheets set identical selectors would be free to drop one entirely.
 */
import 'vitrina/styles.css';
import 'vitrina/themes/void.css';
import paperTheme from 'vitrina/themes/paper.css?inline';

import './styles.css';

import { DEFAULT_CONFIG, type PlaneConfig } from './config';
import { DATASETS, type DatasetId } from './datasets';
import { Accessible } from './sections/Accessible';
import { Colophon, Footline } from './sections/Colophon';
import { Configure } from './sections/Configure';
import { Datasets } from './sections/Datasets';
import { Install } from './sections/Install';

/*
 * The consumer's half of the `modal` contract, and the reason it exists as a
 * prop rather than a default: under 860px `--vitrina-panel-size` is 100% (see
 * styles.css), the panel covers the plane completely, and free focus would send
 * Tab into a plane nobody can see. Above it the panel is 46%, the plane is alive
 * beside it, and a focus trap would be wrong. The breakpoint is declared ONCE —
 * here and in the stylesheet — because the two must agree.
 */
const COMPACT = '(max-width: 859.98px)';

function useCompact(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia(COMPACT);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => matchMedia(COMPACT).matches,
    // Server snapshot: the panel is inert in server output, so either answer is
    // correct — `false` keeps the markup identical to the desktop first paint.
    () => false,
  );
}

export function App() {
  const [config, setConfig] = useState<PlaneConfig>(DEFAULT_CONFIG);
  const [datasetId, setDatasetId] = useState<DatasetId>('minerals');
  const patch = (p: Partial<PlaneConfig>) => setConfig((c) => ({ ...c, ...p }));

  const dataset = DATASETS[datasetId];
  const compact = useCompact();

  /*
   * By value, not by identity: the library memoises the generated instances on
   * the `layout` object, so a fresh object every render would regenerate 114
   * instances on every keystroke in the seed field.
   */
  const { count, columns, sizeJitter, minSeparation, seed } = config;
  const layout = useMemo<VitrinaLayout>(
    () => ({ count, columns, sizeJitter, minSeparation, seed }),
    // `theme` and `panelSide` are deliberately absent: neither belongs to the
    // layout, and either one in this list would regenerate 114 instances on a
    // theme switch.
    [count, columns, sizeJitter, minSeparation, seed],
  );

  // The page's palette follows the widget's theme. The two stylesheets define
  // the same tokens; the page mirrors them so the widget never looks like a
  // component dropped onto a background that nearly matches it.
  useEffect(() => {
    document.documentElement.dataset.demoTheme = config.theme;
  }, [config.theme]);

  return (
    <>
      {/* Later in the document than the imported void.css, so it wins while it
          is mounted and reverts the instant it is not. */}
      {config.theme === 'paper' ? <style>{paperTheme}</style> : null}

      <a className="skip" href="#install">
        Skip the plane
      </a>

      {/*
        Full bleed, above the fold, nothing written over it. The first thing a
        visitor does here should be to drag, not to read; the section below
        peeks under the fold and is the only scroll cue.
      */}
      <header className="hero" id="plane">
        <Vitrina
          entities={dataset.entities}
          labels={dataset.labels}
          layout={layout}
          panelSide={config.panelSide}
          modal={compact}
          renderObject={dataset.renderObject}
          renderAbove={dataset.renderAbove}
          renderDetail={dataset.renderDetail}
          renderBelow={dataset.renderBelow}
          renderClose={(ctx) => (
            <button
              type="button"
              className="panel-close"
              onClick={ctx.close}
              aria-label={dataset.labels.closeDetail}
            >
              ×
            </button>
          )}
        >
          <VitrinaControls />
        </Vitrina>
      </header>

      <main>
        <Install />
        <Configure config={config} onChange={patch} />
        <Datasets current={datasetId} onChange={setDatasetId} />
        <Accessible />
        <Colophon />
      </main>

      <Footline />
    </>
  );
}
