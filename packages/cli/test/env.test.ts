import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { loadEnvFiles, parseRepositoryProvider } from '../src/utils/env.js';

describe('loadEnvFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = resolve(tmpdir(), `pith-test-${randomBytes(6).toString('hex')}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env['PITH_TEST_VAR'];
  });

  it('loads variables from .env', async () => {
    await writeFile(
      resolve(tmpDir, '.env'),
      'PITH_TEST_VAR=from-dot-env\n# comment\nOTHER_VAR=hello\n',
    );

    await loadEnvFiles(tmpDir);
    expect(process.env['PITH_TEST_VAR']).toBe('from-dot-env');
  });

  it('does not override existing shell variables', async () => {
    process.env['PITH_TEST_VAR'] = 'from-shell';

    await writeFile(resolve(tmpDir, '.env'), 'PITH_TEST_VAR=from-dot-env\n');

    await loadEnvFiles(tmpDir);
    expect(process.env['PITH_TEST_VAR']).toBe('from-shell');
  });

  it('gives .env.local precedence over .env', async () => {
    await writeFile(resolve(tmpDir, '.env'), 'PITH_TEST_VAR=from-dot-env\n');
    await writeFile(resolve(tmpDir, '.env.local'), 'PITH_TEST_VAR=from-dot-env-local\n');

    await loadEnvFiles(tmpDir);
    expect(process.env['PITH_TEST_VAR']).toBe('from-dot-env-local');
  });

  it('skips comment lines', async () => {
    await writeFile(resolve(tmpDir, '.env'), '# PITH_TEST_VAR=commented\n# another comment\n');

    await loadEnvFiles(tmpDir);
    expect(process.env['PITH_TEST_VAR']).toBeUndefined();
  });

  it('strips quotes from values', async () => {
    await writeFile(resolve(tmpDir, '.env'), 'PITH_TEST_VAR="quoted value"\n');

    await loadEnvFiles(tmpDir);
    expect(process.env['PITH_TEST_VAR']).toBe('quoted value');
  });
});

describe('parseRepositoryProvider', () => {
  it('defaults to filesystem', () => {
    delete process.env['PITH_REPOSITORY_PROVIDER'];
    expect(parseRepositoryProvider()).toBe('filesystem');
  });

  it('detects github', () => {
    process.env['PITH_REPOSITORY_PROVIDER'] = 'github';
    expect(parseRepositoryProvider()).toBe('github');
  });

  it('detects GITHUB case-insensitively', () => {
    process.env['PITH_REPOSITORY_PROVIDER'] = 'GITHUB';
    expect(parseRepositoryProvider()).toBe('github');
  });
});
