// @vitest-environment node
/*
 * SSR smoke: the library renders to a string in Node — no window, no document,
 * no matchMedia at module scope or in render — with objects at generated
 * positions and, when a `defaultActiveId` is given, the detail shell already in
 * the markup (open, settled, no flight). Hydration then takes over on the client.
 */
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT, generateInstances, resolveLayout, Vitrina } from '../src';
import type { VitrinaEntity, VitrinaLabels } from '../src';

const entities: VitrinaEntity[] = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}` }));
const labels: VitrinaLabels = {
  viewport: 'Plane',
  objectLabel: (e) => e.id,
  closeDetail: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toGrid: 'Grid',
  toPlane: 'Plane',
};

describe('server rendering', () => {
  it('renders the plane with every instance and nothing tabbable', () => {
    const html = renderToString(
      <Vitrina entities={entities} labels={labels} renderObject={(e) => <span>{e.id}</span>} />,
    );
    expect(html).toContain('data-vitrina-viewport');
    expect(html.match(/data-vitrina-object=""/g)).toHaveLength(DEFAULT_LAYOUT.count);
    expect(html).not.toContain('tabindex="0"');
    expect(html).not.toContain('data-vitrina-detail=""');
  });

  it('places every instance at its generated position, plain and untransformed', () => {
    const html = renderToString(
      <Vitrina entities={entities} labels={labels} renderObject={(e) => <span>{e.id}</span>} />,
    );
    // The server has no viewport width, so the plane is the regular (non-compact)
    // world: the same call the un-measured client makes.
    const generated = generateInstances(entities, resolveLayout());
    expect(generated).toHaveLength(DEFAULT_LAYOUT.count);
    for (const inst of generated) {
      expect(html).toContain(`data-vitrina-instance="${inst.id}"`);
      expect(html).toContain(
        `left:${inst.x}px;top:${inst.y}px;width:${inst.size}px;height:${inst.size}px`,
      );
    }
    // Plain markup: pan/zoom/scale are the client's. No transform anywhere —
    // not on the layers, not on an object.
    expect(html).not.toContain('transform');
    expect(html).not.toContain('scale');
  });

  it('has no window/document/matchMedia at module scope anywhere in src/', async () => {
    // Executed in the Node environment, where those globals do not exist: any
    // module-scope access throws on import. Every module is imported, not only
    // what the public surface happens to reach. (Paths via fileURLToPath — see
    // tests/css.ts on why never `new URL(x, import.meta.url)` here.)
    const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name));
    expect(files.map((f) => relative(srcDir, f))).toContain('index.ts');
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      await expect(import(file), file).resolves.toBeDefined();
    }
  });

  it('renders the detail shell open and settled for a defaultActiveId, with the consumer content only', () => {
    const html = renderToString(
      <Vitrina
        entities={entities}
        labels={labels}
        defaultActiveId="e3"
        renderObject={(e) => <span>{e.id}</span>}
        renderDetail={(e) => <p>about {e.id}</p>}
      />,
    );
    expect(html).toContain('data-vitrina-panel-phase="open"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="e3"');
    expect(html).toContain('<p>about <!-- -->e3</p>');
    // Nothing on the plane is hidden: a detail without an origin hides no instance.
    expect(html).not.toContain('visibility:hidden;left');
    // The flight layers portal to document.body only after the first client
    // effect: the server emits the panel alone, no portal markup.
    expect(html).not.toContain('data-vitrina-flight-portal');
    expect(html).not.toContain('data-vitrina-flight=""');
  });

  it('renders the grid view', () => {
    const html = renderToString(
      <Vitrina entities={entities} labels={labels} defaultView="grid" renderObject={(e) => <span>{e.id}</span>} />,
    );
    expect(html).toContain('data-vitrina-grid');
    expect(html.match(/data-vitrina-card=""/g)).toHaveLength(entities.length);
  });
});
