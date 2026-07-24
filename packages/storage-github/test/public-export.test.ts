import { describe, expect, it } from 'vitest';

import { githubStorageVersion } from '../src/index.js';

describe('@pith-cms/storage-github public export', () => {
  it('exposes the package version marker', () => {
    expect(githubStorageVersion).toBe('0.1.0');
  });
});
