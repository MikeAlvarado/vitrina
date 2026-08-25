/*
 * Credits. Two things that both have to be exact: where the interaction came
 * from, and where every pixel came from.
 */

import { SPECIMENS } from '../data/minerals';
import { Section } from '../ui';

export function Colophon() {
  return (
    <Section
      id="credits"
      index="05"
      kicker="Credits"
      title="Where this came from"
    >
      <div className="colophon" style={{ marginTop: 28 }}>
        <div>
          <h3>Interaction reference</h3>
          <p>
            The behaviour of the plane — the finite draggable world, the reveal as objects
            enter the frame, the grid, the flight into the panel — was modelled on{' '}
            <a href="https://palmer-dinnerware.com" target="_blank" rel="noreferrer">
              Palmer Dinnerware ↗
            </a>
            .
          </p>
          <p>
            Nothing of theirs is used here: no code, no assets, no copy, no markup. The
            site was watched, described and rebuilt from the description. It is credited
            because that is where the pattern was seen, and for no other reason — there is
            no affiliation, sponsorship or endorsement in either direction.
          </p>
        </div>

        <div>
          <h3>Images</h3>
          <p>
            The {SPECIMENS.length} specimens are photographs from the{' '}
            <a
              href="https://www.si.edu/openaccess"
              target="_blank"
              rel="noreferrer"
            >
              Smithsonian Institution ↗
            </a>
            , National Museum of Natural History, Department of Mineral Sciences, released
            under CC0. Every field in the detail panel is transcribed from the museum
            record.
          </p>
          <p>
            Smithsonian Open Access is not a blanket dedication over the whole catalogue,
            and a record can be CC0 <em>metadata</em> over a restricted <em>photograph</em>
            . Each of these {SPECIMENS.length} was therefore checked on its own record
            page, live, for an open-access image and not merely open-access metadata — the
            check calibrated against a known negative from the same museum. The cut-outs
            are the only alteration.
          </p>
          <p>
            The emoji are{' '}
            <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">
              Twemoji ↗
            </a>{' '}
            17.0.3, graphics licensed CC-BY 4.0, used unmodified.
          </p>
          <p>
            Per-file sources and rights statements:{' '}
            <a
              href="https://github.com/MikeAlvarado/vitrina/blob/main/apps/demo/assets/CREDITS.md"
              target="_blank"
              rel="noreferrer"
            >
              apps/demo/assets/CREDITS.md ↗
            </a>
          </p>
        </div>
      </div>

    </Section>
  );
}

/** The last rule on the page. Full width, outside the section's column grid. */
export function Footline() {
  return (
    <footer className="wrap">
      <p className="footline">
        <span>vitrina — MIT</span>
        <span>GSAP is a peer dependency, never bundled</span>
        <span>
          <a href="https://github.com/MikeAlvarado/vitrina" target="_blank" rel="noreferrer">
            Source ↗
          </a>
        </span>
      </p>
    </footer>
  );
}
