import { expectTypeOf, it } from 'vitest';

import { createPith } from '../src/server-implementation.js';
import { MemoryRepository, testConfig, validFiles } from './fixtures.js';

it('infers configured collection names and entry values', () => {
  const pith = createPith({ config: testConfig, repository: new MemoryRepository(validFiles) });
  const page = pith.content.getEntry('pages', 'home');
  const optionalPost = pith.content.getOptionalEntry('posts', 'first-post');
  const posts = pith.content.listEntries('posts');

  expectTypeOf(page).resolves.toMatchTypeOf<{
    value: {
      title: string;
      slug: string;
      published?: boolean;
    };
  }>();
  expectTypeOf(optionalPost).resolves.toMatchTypeOf<{
    value: { title: string; slug: string; body: string };
  } | null>();
  expectTypeOf(posts).resolves.toMatchTypeOf<{
    entries: readonly { value: { title: string; slug: string; body: string } }[];
  }>();

  if (false) {
    // @ts-expect-error "unknown" is not a configured collection.
    pith.content.getEntry('unknown', 'entry');
  }
});
