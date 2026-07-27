import { createPith, createMemoryPreviewStore, createPasswordAuth } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
import { createGitHubRepository } from '@pith-cms/storage-github';

import config from '../../pith.config';
import { createRedisPreviewStore } from './redis-preview-store';

const repository =
  process.env.PITH_REPOSITORY_PROVIDER === 'github'
    ? createGitHubRepository({
        owner: requiredEnvironment('PITH_GITHUB_OWNER'),
        repository: requiredEnvironment('PITH_GITHUB_REPOSITORY'),
        branch: requiredEnvironment('PITH_GITHUB_BRANCH'),
        auth: githubAuthentication(),
        publishing:
          process.env.PITH_GITHUB_PUBLISHING_MODE === 'pull-request'
            ? {
                mode: 'pull-request',
                ...(process.env.PITH_GITHUB_BRANCH_PREFIX
                  ? { branchPrefix: process.env.PITH_GITHUB_BRANCH_PREFIX }
                  : {}),
              }
            : { mode: 'direct' },
      })
    : createFilesystemRepository({
        rootDirectory: process.cwd(),
      });

const auth =
  (process.env.PITH_PLAYWRIGHT_PASSWORD_HASH ?? process.env.PITH_PASSWORD_HASH) &&
  process.env.PITH_SESSION_SECRET
    ? createPasswordAuth({
        passwordHash: process.env.PITH_PLAYWRIGHT_PASSWORD_HASH ?? process.env.PITH_PASSWORD_HASH!,
        sessionSecret: process.env.PITH_SESSION_SECRET,
        // Local HTTP development and Playwright must opt out explicitly. Production stays secure.
        ...(process.env.PITH_SESSION_SECURE === 'false' ? { secure: false } : {}),
      })
    : undefined;

export const pith = createPith({
  config,
  repository,
  cache: {
    mode: 'persistent',
    revalidate: 60,
  },
  ...(auth
    ? {
        auth,
        editor: {
          basePath: '/pith',
          apiBasePath: '/api/pith',
          siteName: 'Pith Playground',
        },
        ...(process.env.PITH_PREVIEW_SECRET
          ? {
              preview: {
                secret: process.env.PITH_PREVIEW_SECRET,
                store: process.env.REDIS_URL
                  ? createRedisPreviewStore(process.env.REDIS_URL)
                  : createMemoryPreviewStore(),
                resolvePath: ({ collection, identifier }) => {
                  if (collection === 'pages') {
                    return identifier === 'home' ? '/' : `/${identifier}`;
                  }

                  return collection === 'posts' ? `/posts/${identifier}` : null;
                },
              },
            }
          : {}),
      }
    : {}),
});

function githubAuthentication() {
  const appId = process.env.PITH_GITHUB_APP_ID;
  const privateKey = process.env.PITH_GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.PITH_GITHUB_INSTALLATION_ID;

  if (appId && privateKey && installationId) {
    return {
      app: {
        appId,
        privateKey,
        installationId,
      },
    } as const;
  }

  return { token: requiredEnvironment('PITH_GITHUB_TOKEN') } as const;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required when PITH_REPOSITORY_PROVIDER=github.`);
  }

  return value;
}
