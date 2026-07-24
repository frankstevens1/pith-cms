import { describe, it, expect } from 'vitest';
import {
  jsonOutput,
  jsonError,
  CliError,
  usageError,
  configError,
  contentError,
  repoError,
  formatRedacted,
} from '../src/utils/output.js';

describe('jsonOutput', () => {
  it('wraps data in an ok envelope', () => {
    expect(jsonOutput('hello')).toEqual({ ok: true, data: 'hello' });
  });

  it('supports null data', () => {
    expect(jsonOutput(null)).toEqual({ ok: true, data: null });
  });
});

describe('jsonError', () => {
  it('wraps error details', () => {
    expect(jsonError('TEST_ERR', 'something went wrong')).toEqual({
      ok: false,
      error: { code: 'TEST_ERR', message: 'something went wrong' },
    });
  });

  it('includes optional details', () => {
    expect(jsonError('TEST_ERR', 'msg', { line: 3 })).toEqual({
      ok: false,
      error: { code: 'TEST_ERR', message: 'msg', details: { line: 3 } },
    });
  });
});

describe('CliError', () => {
  it('usageError has exit code 2', () => {
    const err = usageError('bad args');
    expect(err).toBeInstanceOf(CliError);
    expect(err.exitCode).toBe(2);
    expect(err.code).toBe('USAGE_ERROR');
  });

  it('configError has exit code 2', () => {
    const err = configError('bad config');
    expect(err).toBeInstanceOf(CliError);
    expect(err.exitCode).toBe(2);
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('contentError has exit code 1', () => {
    const err = contentError('bad content');
    expect(err).toBeInstanceOf(CliError);
    expect(err.exitCode).toBe(1);
    expect(err.code).toBe('CONTENT_ERROR');
  });

  it('repoError has exit code 2', () => {
    const err = repoError('bad repo');
    expect(err).toBeInstanceOf(CliError);
    expect(err.exitCode).toBe(2);
    expect(err.code).toBe('REPO_ERROR');
  });

  it('toJson returns a JSON envelope', () => {
    const err = configError('config broken');
    expect(err.toJson()).toEqual({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: 'config broken' },
    });
  });
});

describe('formatRedacted', () => {
  it('returns placeholder for undefined', () => {
    expect(formatRedacted(undefined)).toBe('<not set>');
  });

  it('redacts short values completely', () => {
    expect(formatRedacted('abc')).toBe('***');
  });

  it('shows first 4 characters of longer values', () => {
    const result = formatRedacted('ghp_abcdef123456789');
    expect(result).toMatch(/^ghp_\*+$/);
  });

  it('shows all characters if length equals visibleChars', () => {
    expect(formatRedacted('abcd', 4)).toBe('****');
  });
});
