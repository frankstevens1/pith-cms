import 'server-only';

import { resolve } from 'node:path';

import { createPith, createPasswordAuth } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

import config from '../../pith.config';

const auth =
  process.env.PITH_PASSWORD_HASH && process.env.PITH_SESSION_SECRET
    ? createPasswordAuth({
        passwordHash: process.env.PITH_PASSWORD_HASH,
        sessionSecret: process.env.PITH_SESSION_SECRET,
        ...(process.env.PITH_SESSION_SECURE === 'false' ? { secure: false } : {}),
      })
    : undefined;

export const pith = createPith({
  config,
  repository: createFilesystemRepository({
    rootDirectory: resolve(process.cwd(), '../../..'),
  }),
  ...(auth
    ? {
        auth,
        editor: {
          basePath: '/pith',
          apiBasePath: '/api/pith',
          siteName: 'Pith Docs',
        },
      }
    : {}),
});
