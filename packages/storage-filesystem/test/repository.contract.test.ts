import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ContentPathError,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from '@pith-cms/core';
import { repositoryContractTests } from '../../../tests/repository-contract.js';
import { createFilesystemRepository } from '../src/index.js';

repositoryContractTests({
  name: 'filesystem',
  errors: {
    ContentPathError,
    RepositoryConflictError,
    RepositoryError,
    RepositoryNotFoundError,
  },
  async createRepository() {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'pith-filesystem-contract-'));

    return {
      repository: createFilesystemRepository({ rootDirectory }),
      cleanup: () => rm(rootDirectory, { force: true, recursive: true }),
    };
  },
});
