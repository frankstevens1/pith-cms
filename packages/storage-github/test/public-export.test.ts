import { describe, expect, it } from 'vitest';
import { version } from '../package.json';

import { githubStorageVersion } from '../src/index.js';

describe('@pith-cms/storage-github public export', () => {
  it('exposes the package version marker', () => {
    expect(githubStorageVersion).toBe(version);
  });
});
