import { describe, expect, it } from 'vitest';

import { pithNextVersion } from '../src/index.js';

describe('@pith-cms/next public export', () => {
  it('exposes the package version marker', () => {
    expect(typeof pithNextVersion).toBe('string');
    expect(pithNextVersion.length).toBeGreaterThan(0);
  });
});
