import { describe, expect, it } from 'vitest';

import { pithNextVersion } from '../src/index.js';

describe('@pith-cms/next public export', () => {
  it('exposes the package version marker', () => {
    expect(pithNextVersion).toBe('0.1.0');
  });
});
