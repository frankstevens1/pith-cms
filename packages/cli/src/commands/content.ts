import { createContentService } from '@pith-cms/core';
import type { ContentService, PithConfig } from '@pith-cms/core';

import { loadEnvFiles, parseRepositoryProvider, getGitHubConfig } from '../utils/env.js';
import { findProjectRoot, findPithConfigWithOverride, extractPithExport } from '../utils/config.js';
import {
  printLine,
  printJson,
  printError,
  jsonOutput,
  configError,
  contentError,
  repoError,
  CliError,
} from '../utils/output.js';

async function createRepository(projectRoot: string): Promise<{
  read(path: string): Promise<{ path: string; content: string; revision: string } | null>;
  list(directory: string): Promise<{ path: string; revision: string }[]>;
}> {
  const provider = parseRepositoryProvider();

  if (provider === 'github') {
    const github = getGitHubConfig();

    if (!github.owner || !github.repository) {
      throw repoError(
        'GitHub repository not configured. Set PITH_GITHUB_OWNER and PITH_GITHUB_REPOSITORY.',
      );
    }

    try {
      const { createGitHubRepository } = await import('@pith-cms/storage-github');

      const auth = github.appId
        ? {
            app: {
              appId: github.appId,
              privateKey: github.appPrivateKey ?? '',
              installationId: github.installationId ?? '',
            },
          }
        : {
            token: github.token ?? '',
          };

      return createGitHubRepository({
        owner: github.owner,
        repository: github.repository,
        branch: github.branch ?? 'main',
        auth,
        publishing:
          github.publishingMode === 'pull-request'
            ? { mode: 'pull-request', branchPrefix: github.branchPrefix ?? 'pith/' }
            : { mode: 'direct' },
      });
    } catch {
      throw repoError(
        'Failed to create GitHub repository adapter. Ensure @pith-cms/storage-github is installed.',
      );
    }
  }

  try {
    const { createFilesystemRepository } = await import('@pith-cms/storage-filesystem');
    return createFilesystemRepository({ rootDirectory: projectRoot });
  } catch {
    throw repoError(
      'Failed to create filesystem repository adapter. Ensure @pith-cms/storage-filesystem is installed.',
    );
  }
}

function createContentServiceInstance(
  config: PithConfig,
  repository: {
    read(path: string): Promise<{ path: string; content: string; revision: string } | null>;
    list(directory: string): Promise<{ path: string; revision: string }[]>;
  },
): ContentService<PithConfig> {
  return createContentService({
    config,
    repository: repository as Parameters<typeof createContentService>[0]['repository'],
  });
}

export async function contentCheckCommand(jsonMode: boolean): Promise<void> {
  try {
    const projectRoot = await findProjectRoot(process.cwd());
    if (!projectRoot) {
      throw configError(
        'Could not find a project root. Ensure you are in a project with a package.json.',
      );
    }

    await loadEnvFiles(projectRoot);

    const pithConfigPath = process.env['PITH_CONFIG_PATH'];
    const configResult = pithConfigPath
      ? await findPithConfigWithOverride(projectRoot, pithConfigPath)
      : await findPithConfigWithOverride(projectRoot);

    if (!configResult) {
      throw configError('Could not find a pith.config.{ts,mts,js,mjs} file.');
    }

    const exported = extractPithExport(configResult.value as Record<string, unknown>);
    if (!exported) {
      throw configError(
        'Config file must export a Pith config via `export default` or `export const pith`.',
      );
    }

    const config = exported.config as PithConfig;
    const repository = await createRepository(projectRoot);
    const service = createContentServiceInstance(config, repository);

    const allValid: { collection: string; identifier: string }[] = [];
    const allInvalid: { collection: string; identifier: string; error: string }[] = [];

    for (const collectionName of Object.keys(config.collections)) {
      const result = await service.listEntries(collectionName);

      for (const entry of result.entries) {
        allValid.push({ collection: collectionName, identifier: entry.identifier });
      }

      for (const entry of result.invalidEntries) {
        allInvalid.push({
          collection: collectionName,
          identifier: entry.identifier ?? '',
          error: entry.error.message,
        });
      }
    }

    if (jsonMode) {
      printJson(
        jsonOutput({
          valid: allValid.length,
          invalid: allInvalid.length,
          entries: {
            valid: allValid,
            invalid: allInvalid,
          },
        }),
      );
    } else {
      if (allInvalid.length === 0) {
        printLine('All content entries are valid.');
      } else {
        printLine(`Found ${allInvalid.length} invalid entries:`);
        for (const entry of allInvalid) {
          printLine(`  ${entry.collection}/${entry.identifier}`);
          printLine(`    - ${entry.error}`);
        }
        process.exitCode = 1;
      }

      if (allValid.length > 0) {
        printLine(`${allValid.length} valid entries.`);
      }
    }
  } catch (error) {
    handleCliError(error, jsonMode);
  }
}

export async function contentListCommand(
  collection: string,
  jsonMode: boolean,
  configPath?: string,
): Promise<void> {
  try {
    const projectRoot = await findProjectRoot(process.cwd());
    if (!projectRoot) {
      throw configError(
        'Could not find a project root. Ensure you are in a project with a package.json.',
      );
    }

    await loadEnvFiles(projectRoot);

    const configResult = await findPithConfigWithOverride(projectRoot, configPath);

    if (!configResult) {
      throw configError('Could not find a pith.config.{ts,mts,js,mjs} file.');
    }

    const exported = extractPithExport(configResult.value as Record<string, unknown>);
    if (!exported) {
      throw configError(
        'Config file must export a Pith config via `export default` or `export const pith`.',
      );
    }

    const config = exported.config as PithConfig;

    if (!(collection in config.collections)) {
      throw configError(
        `Collection "${collection}" not found. Available: ${Object.keys(config.collections).join(', ')}`,
      );
    }

    const repository = await createRepository(projectRoot);
    const service = createContentServiceInstance(config, repository);
    const result = await service.listEntries(collection);

    if (jsonMode) {
      printJson(
        jsonOutput({
          collection,
          total: result.entries.length,
          entries: result.entries.map((e) => ({
            identifier: e.identifier,
            path: e.path,
            revision: e.revision,
            updatedAt: e.updatedAt,
            publication: e.publication,
          })),
          invalid: result.invalidEntries.map((e) => ({
            identifier: e.identifier ?? '',
            error: e.error.message,
          })),
        }),
      );
    } else {
      printLine(`Collection: ${collection}`);
      printLine(`${result.entries.length} entries:`);

      for (const entry of result.entries) {
        printLine(`  ${entry.identifier}`);
      }

      if (result.invalidEntries.length > 0) {
        printLine(`\n${result.invalidEntries.length} invalid entries:`);
        for (const entry of result.invalidEntries) {
          printLine(`  ${entry.identifier ?? ''} (invalid)`);
          printLine(`    - ${entry.error.message}`);
        }
      }
    }
  } catch (error) {
    handleCliError(error, jsonMode);
  }
}

export async function contentReadCommand(
  collection: string,
  identifier: string,
  jsonMode: boolean,
  configPath?: string,
): Promise<void> {
  try {
    const projectRoot = await findProjectRoot(process.cwd());
    if (!projectRoot) {
      throw configError(
        'Could not find a project root. Ensure you are in a project with a package.json.',
      );
    }

    await loadEnvFiles(projectRoot);

    const configResult = await findPithConfigWithOverride(projectRoot, configPath);

    if (!configResult) {
      throw configError('Could not find a pith.config.{ts,mts,js,mjs} file.');
    }

    const exported = extractPithExport(configResult.value as Record<string, unknown>);
    if (!exported) {
      throw configError(
        'Config file must export a Pith config via `export default` or `export const pith`.',
      );
    }

    const config = exported.config as PithConfig;

    if (!(collection in config.collections)) {
      throw configError(
        `Collection "${collection}" not found. Available: ${Object.keys(config.collections).join(', ')}`,
      );
    }

    const repository = await createRepository(projectRoot);
    const service = createContentServiceInstance(config, repository);
    const entry = await service.getEntry(collection, identifier);

    if (!entry) {
      throw contentError(`Entry "${collection}/${identifier}" not found.`);
    }

    if (jsonMode) {
      printJson(
        jsonOutput({
          collection: entry.collection,
          identifier: entry.identifier,
          path: entry.path,
          revision: entry.revision,
          updatedAt: entry.updatedAt,
          publication: entry.publication,
          value: entry.value,
        }),
      );
    } else {
      printLine(`Entry: ${entry.collection}/${entry.identifier}`);
      printLine(`Path: ${entry.path}`);
      printLine(`Revision: ${entry.revision}`);

      if (entry.updatedAt) {
        printLine(`Updated: ${entry.updatedAt}`);
      }

      if (entry.publication) {
        printLine(`Publication: ${entry.publication.provider} (${entry.publication.mode})`);
        if (entry.publication.reviewUrl) {
          printLine(`Review: ${entry.publication.reviewUrl}`);
        }
      }

      printLine();
      printLine(JSON.stringify(entry.value, null, 2));
    }
  } catch (error) {
    handleCliError(error, jsonMode);
  }
}

function handleCliError(error: unknown, jsonMode: boolean): void {
  if (error instanceof CliError) {
    if (jsonMode) {
      printJson(error.toJson());
    } else {
      printError(error.message);
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (jsonMode) {
    printJson({
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: (error as Error).message },
    });
  } else {
    printError((error as Error).message);
  }
  process.exitCode = 2;
}
