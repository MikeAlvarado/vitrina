import { defineConfig } from 'tsup';

// tsup over vite lib mode: this package needs exactly "ESM bundle + .d.ts + static CSS
// copied to dist", and tsup does the first two with zero plugins. The CSS files are
// standalone export entries (never imported by the JS), so no CSS pipeline is wanted —
// a copy step is the honest description of what happens. The demo app is where Vite
// earns its keep.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  // Subpath imports too (gsap/Draggable etc.), hence patterns, not bare names.
  external: [/^react(\/|$)/, /^react-dom(\/|$)/, /^gsap(\/|$)/],
  // From step 7 on, styles ship as static files next to the JS (see exports map).
  onSuccess: 'test -d src/styles && cp src/styles/*.css dist/ || true',
});
