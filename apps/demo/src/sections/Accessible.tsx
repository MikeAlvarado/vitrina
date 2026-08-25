/*
 * Kept short on purpose. This is the section that decides whether someone
 * installs the library instead of writing their own, so it says exactly what is
 * true and nothing that is merely aspirational.
 */

import { Section } from '../ui';

const CLAIMS: Array<[string, React.ReactNode]> = [
  [
    'Keyboard, all of it',
    <>
      Every object is a real <code>&lt;button&gt;</code>. Tab reaches the ones that are on
      screen and revealed, and only those — a single analytic pass takes the rest out of
      the tab order, because the browser scrolling an off-screen button into view would
      set a real <code>scrollLeft</code> on a viewport whose position lives in a
      transform. Enter opens the panel, Escape closes it, and focus returns to the exact
      instance you left from, never a different copy of the same object.
    </>,
  ],
  [
    'No focus trap, no overlay',
    <>
      The panel is a dialog beside a live plane, not on top of one:{' '}
      <code>aria-modal</code> and the trap are opt-in through <code>modal</code>, for the
      breakpoint where the panel covers everything and free focus would send Tab into a
      plane nobody can see. There is no scrim either — darkening the other half would eat
      the <code>pointerdown</code> that starts a drag.
    </>,
  ],
  [
    'prefers-reduced-motion, three ways',
    <>
      <code>respect</code> (the default) drops the intro, the pops, the inertia and the
      staggers, and keeps drag, wheel, zoom, the view toggle and the panel.{' '}
      <code>grid</code> goes further and locks the whole thing to the grid view, hiding
      chrome that would be a no-op. <code>ignore</code> animates anyway — an accessibility
      decision the consumer is taking on themselves, and named so it reads like one.
      The tab order is identical in all three.
    </>,
  ],
  [
    'Named by you, in your language',
    <>
      The library ships no copy. <code>labels</code> is required, it is the accessible
      name of the plane region, the grid, and every object button, and the library renders
      those strings as <code>aria-label</code>s only.
    </>,
  ],
  [
    'Nothing survives unmount',
    <>
      Draggable, Observer, every <code>quickTo</code> and every tween are killed on
      cleanup — including the ones created after the plugins’ dynamic{' '}
      <code>import()</code> resolves, which is the leak that actually happens. A test
      mounts under StrictMode, races resizes against the import, unmounts, and asserts
      that nothing is left on the global timeline, and that mounting created something in
      the first place.
    </>,
  ],
  [
    'Server-renders, then takes over',
    <>
      No <code>window</code>, <code>document</code> or <code>matchMedia</code> at module
      scope; the plugins are loaded inside an effect. The server emits the objects at
      their generated positions, plain, with zero transforms — and because every random
      number comes from a seeded generator, the client hydrates onto the same plane
      instead of a different one.
    </>,
  ],
];

export function Accessible() {
  return (
    <Section
      id="accessible"
      index="04"
      kicker="Accessibility"
      title="The part that is hard to add later"
      lede={
        <>
          A draggable plane is easy to build and easy to build badly. These are the
          properties that are painful to retrofit, so they are in the mechanic rather than
          in a checklist.
        </>
      }
    >
      <dl className="claims" style={{ marginTop: 28 }}>
        {CLAIMS.map(([term, body]) => (
          <div className="claim" key={term}>
            <dt>{term}</dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
