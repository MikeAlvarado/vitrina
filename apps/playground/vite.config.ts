import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const librarySource = fileURLToPath(
  new URL('../../packages/vitrina/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The library resolves to its SOURCE, not to dist. Without this every change in
    // packages/vitrina would need a `pnpm build` before it shows up here, and HMR
    // would be lost. apps/demo does the opposite on purpose: it consumes dist through
    // the package's exports map, because that is the only thing that detects a
    // broken exports map.
    //
    // Exact match only (`^vitrina$`): the `./styles.css` and `./themes/*` subpaths
    // have no source-side counterpart to alias to until step 7 — main.tsx globs
    // them from the source tree instead.
    alias: [{ find: /^vitrina$/, replacement: librarySource }],
    // One React and one GSAP for the app AND the aliased source. The library's files
    // would otherwise resolve their imports from packages/vitrina/node_modules, and a
    // second React copy breaks hooks.
    dedupe: ['react', 'react-dom', 'gsap'],
  },
  optimizeDeps: {
    // The interaction plugins load via dynamic import() inside an effect. Listing
    // them up front saves the "new dependencies optimized → reloading" round trip
    // the first time the plane mounts.
    include: ['gsap', 'gsap/Draggable', 'gsap/InertiaPlugin', 'gsap/Observer'],
  },
});
