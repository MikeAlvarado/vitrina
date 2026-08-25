/*
 * The live config panel. Every row is one prop; moving a control re-renders the
 * plane at the top of the page with a new value, and nothing else happens.
 *
 * It is a config panel and it stays one. A panel that grew an export button —
 * something you could paste into your own site — would be a no-code animation
 * builder, which GSAP's licence does not permit to be built on top of it. The
 * boundary is easy to hold because it is also the more useful thing: the
 * question a visitor actually has is "does this survive MY numbers", and the
 * answer is a slider, not a file.
 */

import type { VitrinaPanelSide } from 'vitrina';

import { DEFAULT_CONFIG, summarise, type PlaneConfig } from '../config';
import { AppliesToPlane, Control, Pill, Section, Slider } from '../ui';

const SIDES: VitrinaPanelSide[] = ['right', 'left', 'top', 'bottom'];
const SEEDS = ['vitrina', 'granite', 'tsumeb', 'kashmir', 'agrigento'];

export function Configure({
  config,
  onChange,
}: {
  config: PlaneConfig;
  onChange: (patch: Partial<PlaneConfig>) => void;
}) {
  const atDefaults = (Object.keys(DEFAULT_CONFIG) as Array<keyof PlaneConfig>).every(
    (k) => config[k] === DEFAULT_CONFIG[k],
  );

  return (
    <Section
      id="configure"
      index="02"
      kicker="Configure"
      title="Your numbers, on the plane above"
      lede={
        <>
          The measured defaults come off a 4645×3044 world with 114 objects in 14 columns.
          They are defaults, not requirements. Move anything here and the plane at the top
          of the page regenerates — <strong>deterministically</strong>: the same seed
          produces the same plane on the server and on every client, which is what makes
          the whole thing safe to render server-side.
        </>
      }
    >
      <div className="controls" style={{ marginTop: 28 }}>
        <Control
          htmlFor="cfg-count"
          name="layout.count"
          note="Instances generated to fill the world."
          value={String(config.count)}
        >
          <Slider
            id="cfg-count"
            min={24}
            max={220}
            step={1}
            value={config.count}
            onChange={(count) => onChange({ count })}
          />
        </Control>

        <Control
          htmlFor="cfg-columns"
          name="layout.columns"
          note="Columns in the generator's grid."
          value={String(config.columns)}
        >
          <Slider
            id="cfg-columns"
            min={6}
            max={24}
            step={1}
            value={config.columns}
            onChange={(columns) => onChange({ columns })}
          />
        </Control>

        <Control
          htmlFor="cfg-jitter"
          name="layout.sizeJitter"
          note="± fraction applied to every instance's size."
          value={`±${Math.round(config.sizeJitter * 100)}%`}
        >
          <Slider
            id="cfg-jitter"
            min={0}
            max={0.5}
            step={0.01}
            value={config.sizeJitter}
            onChange={(sizeJitter) => onChange({ sizeJitter })}
          />
        </Control>

        <Control
          htmlFor="cfg-separation"
          name="layout.minSeparation"
          note="Cells that must separate two copies of one object."
          value={`${config.minSeparation} cells`}
        >
          <Slider
            id="cfg-separation"
            min={0}
            max={5}
            step={1}
            value={config.minSeparation}
            onChange={(minSeparation) => onChange({ minSeparation })}
          />
        </Control>

        <Control
          htmlFor="cfg-seed"
          name="layout.seed"
          note="Same seed, same plane — every time, everywhere."
          value={`“${config.seed}”`}
        >
          <input
            id="cfg-seed"
            type="text"
            value={config.seed}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onChange({ seed: e.target.value })}
            aria-describedby="cfg-seed-presets"
          />
          <span className="pill-group" id="cfg-seed-presets">
            {SEEDS.map((seed) => (
              <Pill key={seed} value={seed} current={config.seed} onSelect={(s) => onChange({ seed: s })} />
            ))}
          </span>
        </Control>

        <Control
          name="theme"
          note="One stylesheet import. Both define the same tokens."
          value={`themes/${config.theme}.css`}
        >
          <span className="pill-group">
            {(['void', 'paper'] as const).map((theme) => (
              <Pill key={theme} value={theme} current={config.theme} onSelect={(t) => onChange({ theme: t })} />
            ))}
          </span>
        </Control>

        <Control
          name="panelSide"
          note="Which edge the detail panel takes. Changes with it open."
          value={config.panelSide}
        >
          <span className="pill-group">
            {SIDES.map((side) => (
              <Pill key={side} value={side} current={config.panelSide} onSelect={(s) => onChange({ panelSide: s })} />
            ))}
          </span>
        </Control>
      </div>

      <p style={{ display: 'flex', gap: 10, margin: '18px 0 0' }}>
        <button
          type="button"
          className="pill"
          disabled={atDefaults}
          style={atDefaults ? { opacity: 0.4, cursor: 'default' } : undefined}
          onClick={() => onChange(DEFAULT_CONFIG)}
        >
          Reset to the measured defaults
        </button>
      </p>

      <AppliesToPlane summary={summarise(config)} />

      <div className="body" style={{ marginTop: 32 }}>
        <p>
          Generation is a feature, not an internal:{' '}
          <code>generateInstances(entities, resolveLayout(layout))</code> is exported, so
          the same plane can be computed at build time and handed back through the{' '}
          <code>instances</code> prop. Balance beats separation — the generator guarantees{' '}
          <code>max(uses) − min(uses) ≤ 1</code> unconditionally, relaxes the separation
          radius only when the request is unsatisfiable, and never throws on input it
          cannot honour. Drag <code>minSeparation</code> to 5 with 24 objects and watch it
          degrade instead of fail.
        </p>
      </div>
    </Section>
  );
}
