import { describe, it, expect } from 'vitest';
import { findProjectRoot, extractPithExport } from '../src/utils/config.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('findProjectRoot', () => {
  it('finds the project root from the repo root', async () => {
    const root = await findProjectRoot(repoRoot);
    expect(root).toBe(repoRoot);
  });

  it('returns null outside any project', async () => {
    const root = await findProjectRoot('/');
    expect(root).toBeNull();
  });
});

describe('extractPithExport', () => {
  it('extracts named pith export', () => {
    const config = { contentRoot: 'test' };
    const result = extractPithExport({ pith: config });
    expect(result).toEqual({ config, source: 'named' });
  });

  it('extracts default export', () => {
    const config = { contentRoot: 'test' };
    const result = extractPithExport({ default: config });
    expect(result).toEqual({ config, source: 'default' });
  });

  it('prefers named export over default', () => {
    const namedConfig = { contentRoot: 'named' };
    const defaultConfig = { contentRoot: 'default' };
    const result = extractPithExport({ pith: namedConfig, default: defaultConfig });
    expect(result).toEqual({ config: namedConfig, source: 'named' });
  });

  it('returns null for no config', () => {
    expect(extractPithExport({})).toBeNull();
    expect(extractPithExport({ something: 'else' })).toBeNull();
  });

  it('returns null for non-object exports', () => {
    expect(extractPithExport({ pith: 'string' })).toBeNull();
    expect(extractPithExport({ default: 42 })).toBeNull();
  });
});
