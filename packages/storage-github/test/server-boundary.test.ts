import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('@pith-cms/storage-github server boundary', () => {
  it('is Node-only and does not depend on Next, React, storage adapters, or local filesystem access', async () => {
    const sourceDirectory = resolve(packageRoot, 'src');
    const names = await readdir(sourceDirectory);
    const sources = await Promise.all(
      names
        .filter((name) => name.endsWith('.ts'))
        .map((name) => readFile(resolve(sourceDirectory, name), 'utf8')),
    );
    const source = sources.join('\n');

    expect(source).toContain('node:crypto');
    expect(source).not.toMatch(
      /@pith-cms\/next|react|node:fs|storage-filesystem|git clone|child_process/,
    );
  });

  it('publishes only explicit Node ESM entry points', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, string>>;
    };

    expect(manifest.exports['.']?.node).toBe('./dist/index.js');
    expect(manifest.exports).not.toHaveProperty('./types');
  });
});
