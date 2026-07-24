import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileExists } from './config.js';

export interface EnvRecord {
  readonly key: string;
  readonly value: string;
}

export async function loadEnvFiles(projectRoot: string): Promise<void> {
  const files = [resolve(projectRoot, '.env.local'), resolve(projectRoot, '.env')];

  for (const file of files) {
    if (!(await fileExists(file))) continue;

    const content = await readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

export function parseRepositoryProvider(): 'filesystem' | 'github' {
  const provider = process.env['PITH_REPOSITORY_PROVIDER']?.toLowerCase();

  if (provider === 'github') return 'github';
  return 'filesystem';
}

export function getGitHubConfig(): {
  readonly owner: string | undefined;
  readonly repository: string | undefined;
  readonly branch: string | undefined;
  readonly token: string | undefined;
  readonly publishingMode: 'direct' | 'pull-request' | undefined;
  readonly branchPrefix: string | undefined;
  readonly appId: string | undefined;
  readonly appPrivateKey: string | undefined;
  readonly installationId: string | undefined;
} {
  return {
    owner: process.env['PITH_GITHUB_OWNER'],
    repository: process.env['PITH_GITHUB_REPOSITORY'],
    branch: process.env['PITH_GITHUB_BRANCH'],
    token: process.env['PITH_GITHUB_TOKEN'],
    publishingMode:
      (process.env['PITH_GITHUB_PUBLISHING_MODE'] as 'direct' | 'pull-request' | undefined) ??
      'direct',
    branchPrefix: process.env['PITH_GITHUB_BRANCH_PREFIX'],
    appId: process.env['PITH_GITHUB_APP_ID'],
    appPrivateKey: process.env['PITH_GITHUB_APP_PRIVATE_KEY'],
    installationId: process.env['PITH_GITHUB_INSTALLATION_ID'],
  };
}
