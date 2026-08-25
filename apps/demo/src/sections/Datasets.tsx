/*
 * The dataset toggle. Both cards are always on screen so the claim is checkable
 * rather than asserted: the two `renderObject` bodies sit side by side, and the
 * only difference between them is which file the <img> points at.
 */

import { DATASETS, type DatasetId } from '../datasets';
import { GLYPHS, glyphImage } from '../data/emoji';
import { SPECIMENS, specimenImage } from '../data/minerals';
import { AppliesToPlane, Code, Section } from '../ui';

const PREVIEW = 8;

export function Datasets({
  current,
  onChange,
}: {
  current: DatasetId;
  onChange: (id: DatasetId) => void;
}) {
  return (
    <Section
      id="datasets"
      index="03"
      kicker="Content"
      title="The library owns the mechanic, never the content"
      lede={
        <>
          There is no product model in here, no <code>price</code>, no <code>title</code>,
          no notion of what an object <em>is</em>. Entities carry a <code>data</code> field
          the library hands back to your render props verbatim and never looks inside.
          Switching these two changes the data and the render props.{' '}
          <strong>The component, its props and its stylesheet do not move.</strong>
        </>
      }
    >
      <div className="datasets" style={{ marginTop: 28 }}>
        {(['minerals', 'emoji'] as const).map((id) => {
          const dataset = DATASETS[id];
          const on = current === id;
          return (
            <div className="dataset" key={id} data-current={on}>
              <h3>{dataset.name}</h3>
              <div className="strip" aria-hidden="true">
                {id === 'minerals'
                  ? SPECIMENS.slice(0, PREVIEW).map((s) => (
                      <img key={s.id} src={specimenImage(s.id)} alt="" />
                    ))
                  : GLYPHS.slice(0, PREVIEW).map((g) => (
                      <img key={g.id} src={glyphImage(g.character)} alt="" />
                    ))}
              </div>
              <p>{dataset.blurb}</p>
              <Code>{dataset.source}</Code>
              <p>
                <button
                  type="button"
                  className="pill"
                  aria-pressed={on}
                  onClick={() => onChange(id)}
                >
                  {on ? 'On the plane' : `Put ${dataset.name.toLowerCase()} on the plane`}
                </button>
              </p>
            </div>
          );
        })}
      </div>

      <AppliesToPlane summary={`${DATASETS[current].name.toLowerCase()}, 24 entities`} />

      <div className="body" style={{ marginTop: 32 }}>
        <p>
          Entities are <strong>what exists</strong>; instances are{' '}
          <strong>where copies appear</strong>. Twenty-four objects would read as an empty
          room, so each is repeated across the world — 114 instances by default — and the
          detail panel keys off the entity, so every copy of a specimen opens the same
          record and flies back to the copy you clicked.
        </p>
        <p>
          The emoji ship as <strong>vector files</strong>, not as characters in a text
          node, and that is worth a sentence because it cost real time to learn. On macOS,
          Chrome draws emoji text from Apple Color Emoji — a bitmap font with strikes at
          fixed sizes. Under an animated scale the glyph snaps from one strike to the
          next, and the result looks exactly like a broken reveal while the DOM, the tween
          and the geometry all measure perfect. If you are judging a scale animation, judge
          it with images.
        </p>
      </div>
    </Section>
  );
}
