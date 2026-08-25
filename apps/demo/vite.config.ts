import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * NO alias to the library's source — the deliberate opposite of the playground.
 * `vitrina` resolves through the workspace link to packages/vitrina, and from
 * there through the package's own `exports` map into `dist/`. That makes this
 * app the only thing in the repo that would break if the exports map, the
 * build, or the published file list were wrong: the playground aliases the
 * source and would keep working through all three.
 *
 * The consequence is that the library must be BUILT before this app runs.
 * `pnpm -r run build` is topological, so the root gate builds it first.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React and one GSAP for the app and for the library's dist alike.
    dedupe: ['react', 'react-dom', 'gsap'],
  },
  optimizeDeps: {
    // The interaction plugins arrive through dynamic import() inside an effect;
    // pre-bundling them skips the "new dependencies optimized → reloading"
    // round trip the first time the plane mounts.
    include: ['gsap', 'gsap/Draggable', 'gsap/InertiaPlugin', 'gsap/Observer'],
  },
  build: {
    // The demo is one page of cut-outs; a source map makes a broken build in a
    // deploy preview debuggable without another round trip.
    sourcemap: true,
  },
});
