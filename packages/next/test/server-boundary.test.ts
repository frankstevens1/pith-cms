import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('@pith-cms/next server boundary', () => {
  it('marks the executable entry point server-only', async () => {
    const source = await readFile(resolve(packageRoot, 'src/server.ts'), 'utf8');

    expect(source).toContain("import 'server-only';");
  });

  it('does not import storage or Node filesystem implementations', async () => {
    const source = await readFile(resolve(packageRoot, 'src/server-implementation.ts'), 'utf8');

    expect(source).not.toMatch(/storage-filesystem|storage-github|node:fs|node:path/);
  });

  it('exposes types separately from the server executable API', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(manifest.exports).toHaveProperty('./server');
    expect(manifest.exports).toHaveProperty('./types');
    expect(manifest.exports).not.toHaveProperty('./editor');
    expect(manifest.exports).toHaveProperty('./editor.css');
  });

  it('keeps the editor form implementation in an explicit client boundary', async () => {
    const source = await readFile(resolve(packageRoot, 'src/editor-client.tsx'), 'utf8');

    expect(source.startsWith("'use client';")).toBe(true);
    expect(source).not.toMatch(/node:fs|node:path|@pith-cms\/storage-/);
  });
});
