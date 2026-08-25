/*
 * StrictMode stays on. In development it mounts, unmounts and remounts every
 * effect — the cheapest GSAP leak detector there is, and the one that catches a
 * Draggable or an Observer created after an awaited dynamic import() whose
 * cleanup already ran. Duplicated objects or two Draggables fighting over the
 * plane would mean it is working, not that it is broken.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
