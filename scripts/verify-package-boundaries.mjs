import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageDirectory = join(repositoryRoot, 'packages');

const allowedPithDependencies = {
  '@pith-cms/core': new Set(),
  '@pith-cms/next': new Set(['@pith-cms/core']),
  '@pith-cms/cli': new Set([
    '@pith-cms/core',
    '@pith-cms/next',
    '@pith-cms/storage-filesystem',
    '@pith-cms/storage-github',
  ]),
  '@pith-cms/storage-filesystem': new Set(['@pith-cms/core']),
  '@pith-cms/storage-github': new Set(['@pith-cms/core']),
};

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const errors = [];

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }

    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.'))) ? [entryPath] : [];
  });
}

function packageManifest(packageName) {
  return JSON.parse(readFileSync(join(packageDirectory, packageName, 'package.json'), 'utf8'));
}

for (const packageName of readdirSync(packageDirectory)) {
  const manifest = packageManifest(packageName);
  const allowedDependencies = allowedPithDependencies[manifest.name];

  if (!allowedDependencies) {
    errors.push(`Unknown package boundary declaration: ${manifest.name}`);
    continue;
  }

  const declaredDependencies = Object.keys(manifest.dependencies ?? {}).filter((name) =>
    name.startsWith('@pith-cms/'),
  );

  for (const dependency of declaredDependencies) {
    if (!allowedDependencies.has(dependency)) {
      errors.push(`${manifest.name} must not depend on ${dependency}`);
    }
  }

  for (const sourceFile of listFiles(join(packageDirectory, packageName, 'src'))) {
    const source = readFileSync(sourceFile, 'utf8');
    const relativeFile = relative(repositoryRoot, sourceFile);

    if (
      /from\s+['"](?:\.\.\/)+packages\//.test(source) ||
      /from\s+['"]@pith-cms\/[^'"]+\/src\//.test(source)
    ) {
      errors.push(`${relativeFile} imports another package through an internal source path`);
    }

    for (const importedPackage of source.matchAll(
      /(?:from|import)\s*\(?\s*['"](@pith-cms\/[^'"/]+)/g,
    )) {
      const dependency = importedPackage[1];

      if (!allowedDependencies.has(dependency)) {
        errors.push(`${relativeFile} must not import ${dependency}`);
      }
    }
  }
}

for (const applicationName of readdirSync(join(repositoryRoot, 'apps'))) {
  const applicationPath = join(repositoryRoot, 'apps', applicationName);

  for (const sourceFile of listFiles(applicationPath)) {
    const source = readFileSync(sourceFile, 'utf8');
    const relativeFile = relative(repositoryRoot, sourceFile);

    if (
      /from\s+['"](?:\.\.\/)+packages\//.test(source) ||
      /from\s+['"]@pith-cms\/[^'"]+\/src\//.test(source)
    ) {
      errors.push(`${relativeFile} imports a Pith package through an internal source path`);
    }
  }
}

if (errors.length > 0) {
  console.error('Package boundary verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('Package dependency and import boundaries are valid.');
}
