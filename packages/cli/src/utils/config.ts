import { resolve } from 'node:path';
import { access, constants } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

async function findUp(
  directory: string,
  predicate: (directory: string) => Promise<string | null>,
): Promise<string | null> {
  let current: string = resolve(directory);

  for (let depth = 0; depth < 50; depth++) {
    const found = await predicate(current);
    if (found) return found;

    const parent = resolve(current, '..');
    if (parent === current) return null;
    current = parent;
  }

  return null;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findProjectRoot(startDirectory: string): Promise<string | null> {
  return findUp(startDirectory, async (directory) => {
    const manifest = resolve(directory, 'package.json');
    return (await fileExists(manifest)) ? directory : null;
  });
}

export async function detectPackageManager(projectRoot: string): Promise<string> {
  const lockfiles: Record<string, string> = {
    'pnpm-lock.yaml': 'pnpm',
    'package-lock.json': 'npm',
    'yarn.lock': 'yarn',
    'bun.lockb': 'bun',
  };

  for (const [filename, manager] of Object.entries(lockfiles)) {
    if (await fileExists(resolve(projectRoot, filename))) {
      return manager;
    }
  }

  return 'npm';
}

export async function findAppDirectory(projectRoot: string): Promise<string | null> {
  const candidates = [resolve(projectRoot, 'src', 'app'), resolve(projectRoot, 'app')];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function tryLoadModule<TValue>(
  modulePath: string,
): Promise<{ value: TValue; path: string } | null> {
  try {
    const url = pathToFileURL(modulePath).href;
    const module = (await import(url)) as Record<string, unknown>;
    return { value: module as unknown as TValue, path: modulePath };
  } catch {
    return null;
  }
}

export async function findPithConfig(projectRoot: string): Promise<{
  value: unknown;
  path: string;
} | null> {
  const candidates = [
    resolve(projectRoot, 'pith.config.ts'),
    resolve(projectRoot, 'pith.config.mts'),
    resolve(projectRoot, 'pith.config.js'),
    resolve(projectRoot, 'pith.config.mjs'),
  ];

  for (const candidate of candidates) {
    const result = await tryLoadModule<unknown>(candidate);
    if (result) return result;
  }

  return null;
}

export async function findPithConfigWithOverride(
  projectRoot: string,
  overridePath?: string,
): Promise<{ value: unknown; path: string } | null> {
  if (overridePath) {
    const resolved = resolve(overridePath);
    const result = await tryLoadModule<unknown>(resolved);
    if (result) return result;
    return null;
  }

  return findPithConfig(projectRoot);
}

export function extractPithExport(module: Record<string, unknown>): {
  config: unknown;
  source: 'default' | 'named';
} | null {
  if (module.pith && typeof module.pith === 'object') {
    return { config: module.pith, source: 'named' };
  }

  if (module.default && typeof module.default === 'object') {
    return { config: module.default, source: 'default' };
  }

  return null;
}
