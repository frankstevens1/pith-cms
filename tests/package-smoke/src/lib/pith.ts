import { createPith, createMemoryPreviewStore, createPasswordAuth } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
import { createGitHubRepository } from '@pith-cms/storage-github';

import config from '../../pith.config';

const passwordHash = process.env.PITH_PASSWORD_HASH;
const sessionSecret = process.env.PITH_SESSION_SECRET;
const previewSecret = process.env.PITH_PREVIEW_SECRET;

// This stays server-only and verifies that the packed GitHub adapter can be
// configured without bringing provider code into the browser bundle.
export const githubRepositoryFixture = createGitHubRepository({
  owner: 'pith-fixture',
  repository: 'content',
  branch: 'main',
  auth: { token: 'fixture-token-not-used-for-network-access' },
  apiBaseUrl: 'https://github.test',
  transport: async () => new Response(JSON.stringify({ message: 'Not used in this fixture.' })),
});

if (!passwordHash || !sessionSecret || !previewSecret) {
  throw new Error('The package fixture requires Pith editor credentials.');
}

export const pith = createPith({
  config,
  repository: createFilesystemRepository({ rootDirectory: process.cwd() }),
  cache: { mode: 'persistent', revalidate: 60 },
  auth: createPasswordAuth({ passwordHash, sessionSecret }),
  editor: {
    basePath: '/pith',
    apiBasePath: '/api/pith',
    siteName: 'Pith package fixture',
  },
  preview: {
    secret: previewSecret,
    store: createMemoryPreviewStore(),
    resolvePath: ({ identifier }) => (identifier === 'home' ? '/' : null),
  },
});
