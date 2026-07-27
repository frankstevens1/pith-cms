import 'server-only';

import { createPith, createMemoryPreviewStore, createPasswordAuth } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
import { createGitHubRepository } from '@pith-cms/storage-github';

import config from '../../pith.config';
import { createRedisPreviewStore } from './redis-preview-store';

const auth =
  process.env.PITH_PASSWORD_HASH && process.env.PITH_SESSION_SECRET
    ? createPasswordAuth({
        passwordHash: process.env.PITH_PASSWORD_HASH,
        sessionSecret: process.env.PITH_SESSION_SECRET,
        ...(process.env.PITH_SESSION_SECURE === 'false' ? { secure: false } : {}),
      })
    : undefined;

const repository =
  process.env.PITH_REPOSITORY_PROVIDER === 'github'
    ? createGitHubRepository({
        owner: requiredEnvironment('PITH_GITHUB_OWNER'),
        repository: requiredEnvironment('PITH_GITHUB_REPOSITORY'),
        branch: process.env.PITH_GITHUB_BRANCH ?? 'main',
        auth: process.env.PITH_GITHUB_TOKEN
          ? { token: process.env.PITH_GITHUB_TOKEN }
          : {
              app: {
                appId: requiredEnvironment('PITH_GITHUB_APP_ID'),
                privateKey: requiredEnvironment('PITH_GITHUB_APP_PRIVATE_KEY'),
                installationId: requiredEnvironment('PITH_GITHUB_INSTALLATION_ID'),
              },
            },
        publishing: { mode: 'direct' },
      })
    : createFilesystemRepository({
        rootDirectory: process.cwd(),
      });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for GitHub storage. Set it in the hosting platform environment variables.`,
    );
  }
  return value;
}

export const pith = createPith({
  config,
  repository,
  ...(auth
    ? {
        auth,
        editor: {
          basePath: '/pith',
          apiBasePath: '/api/pith',
          siteName: 'Pith Docs',
        },
        ...(process.env.PITH_PREVIEW_SECRET
          ? {
              preview: {
                secret: process.env.PITH_PREVIEW_SECRET,
                store: process.env.REDIS_URL
                  ? createRedisPreviewStore(process.env.REDIS_URL)
                  : createMemoryPreviewStore(),
                resolvePath: ({ identifier }) => `/${identifier}`,
              },
            }
          : {}),
      }
    : {}),
});
