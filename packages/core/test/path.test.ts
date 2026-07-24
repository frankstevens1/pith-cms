import { describe, expect, it } from 'vitest';

import { ContentPathError, getEntryPath, normalizeContentPath } from '../src/index.js';
import { pith } from './fixtures.js';

describe('content paths', () => {
  it('constructs normalized logical paths', () => {
    expect(getEntryPath({ config: pith, collection: 'pages', identifier: 'home' })).toBe(
      'content/pages/home.json',
    );
    expect(getEntryPath({ config: pith, collection: 'posts', identifier: 'building-pith' })).toBe(
      'content/posts/building-pith.md',
    );
    expect(normalizeContentPath('content\\pages//home', 'test path')).toBe('content/pages/home');
  });

  it.each([
    '../secret',
    '../../content',
    '/content/pages',
    'C:\\secret',
    '%2e%2e',
    'content\0pages',
  ])('rejects unsafe logical path %s', (path) => {
    expect(() => normalizeContentPath(path, 'test path')).toThrow(ContentPathError);
  });

  it.each(['../secret', 'nested/path', 'nested\\path', 'home.json', '%2e%2e'])(
    'rejects unsafe identifier %s',
    (identifier) => {
      expect(() => getEntryPath({ config: pith, collection: 'pages', identifier })).toThrow(
        ContentPathError,
      );
    },
  );
});
