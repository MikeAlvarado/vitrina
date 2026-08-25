/*
 * The install section, and the page's only masthead — the plane above it is
 * deliberately wordless, so this is where the thing gets named.
 *
 * The snippet is not a string in this file. It is the SOURCE of
 * `src/examples/QuickStart.example.tsx`, read with Vite's ?raw, and that file is
 * inside this app's `tsc --noEmit` and its build. A quick start that has drifted
 * from the library is the fastest way to lose a reader in the first minute, and
 * a snippet typed into markup cannot fail. This one fails the demo's own
 * typecheck the day a prop is renamed.
 */

import quickStart from '../examples/QuickStart.example.tsx?raw';
import { Code, Section } from '../ui';

export function Install() {
  return (
    <>
      <div className="wrap masthead">
        <div>
          <h1 className="wordmark">vitrina</h1>
          <p className="tagline">
            A finite, draggable plane of cut-out objects for React. Pan with inertia and
            elastic edges, discrete zoom, a staggered reveal as objects enter the frame,
            a grid view they Flip into, and a detail panel one object flies into while
            the plane stays alive beside it.
          </p>
        </div>
        <p className="masthead-meta">
          <span>MIT</span>
          <span>React 18+</span>
          <span>GSAP peer</span>
          <span>SSR-safe</span>
          <span>~1 dependency you already have</span>
        </p>
      </div>

      <Section
        id="install"
        index="01"
        kicker="Install"
        title="Three lines and a height"
        lede={
          <>
            What exists, what to call it, how to draw it. The height is the fourth thing
            only because the widget fills its container, and an unsized container is an
            invisible widget.
          </>
        }
      >
        <div style={{ marginTop: 28 }}>
          <Code label="shell">
            <span className="shell">npm i vitrina gsap</span>
          </Code>
        </div>
        <div style={{ marginTop: 20 }}>
          <Code
            label="src/examples/QuickStart.example.tsx"
            note="rendered from the file — it compiles in this app"
          >
            {quickStart.trimEnd()}
          </Code>
        </div>
        <div className="body" style={{ marginTop: 24 }}>
          <p>
            <code>react</code>, <code>react-dom</code> and <code>gsap</code> are peer
            dependencies. GSAP stays a peer on purpose: its standard licence is free for
            commercial use but is not MIT, and bundling it would muddy this library’s own
            grant. Its four plugins load through a dynamic <code>import()</code> inside an
            effect, which keeps ~21&nbsp;KB gzip off the critical path and is what makes
            server rendering work at all.
          </p>
          <p>
            Every string a person can read arrives through <code>labels</code>. The
            library ships no copy and no default language, and renders those strings as
            accessible names only — the one place a label becomes visible text is the
            three buttons of <code>&lt;VitrinaControls&gt;</code>, in the corner of the
            plane above, and the words there are still yours.
          </p>
        </div>
      </Section>
    </>
  );
}
