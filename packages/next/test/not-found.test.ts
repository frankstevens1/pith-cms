import { ContentValidationError } from '@pith-cms/core';
import { describe, expect, it, vi } from 'vitest';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));

import { getEntryOrNotFound } from '../src/server-not-found.js';
import { createPith } from '../src/server-implementation.js';
import { MemoryRepository, testConfig } from './fixtures.js';

describe('getEntryOrNotFound', () => {
  it('converts missing entries to Next.js notFound only', async () => {
    const pith = createPith({ config: testConfig, repository: new MemoryRepository() });

    await expect(getEntryOrNotFound(pith, 'pages', 'missing')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('rethrows malformed content errors', async () => {
    const pith = createPith({
      config: testConfig,
      repository: new MemoryRepository({ 'content/pages/home.json': '{"slug":"home"}' }),
    });

    await expect(getEntryOrNotFound(pith, 'pages', 'home')).rejects.toBeInstanceOf(
      ContentValidationError,
    );
    expect(notFound).toHaveBeenCalledOnce();
  });
});
