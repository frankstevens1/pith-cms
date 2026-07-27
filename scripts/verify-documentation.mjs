import { readFile } from 'node:fs/promises';

const documents = [
  'README.md',
  'CONTRIBUTING.md',
  'SUPPORT.md',
  'apps/docs/content/docs/public-api.md',
  'apps/docs/content/docs/quick-start.md',
  'apps/docs/content/docs/collections.md',
  'apps/docs/content/docs/editor.md',
  'apps/docs/content/docs/storage.md',
  'apps/docs/content/docs/compatibility.md',
  'apps/docs/content/docs/errors.md',
  'apps/docs/content/docs/troubleshooting.md',
  'apps/docs/content/docs/migrations.md',
  'apps/docs/content/docs/known-limitations.md',
  'apps/docs/content/docs/deployment.md',
  'apps/docs/content/docs/cli.md',
  'packages/core/README.md',
  'packages/next/README.md',
  'packages/storage-filesystem/README.md',
  'packages/storage-github/README.md',
  'packages/cli/README.md',
];

const allowedImports = new Set([
  '@pith-cms/core',
  '@pith-cms/next',
  '@pith-cms/next/server',
  '@pith-cms/next/types',
  '@pith-cms/next/preview',
  '@pith-cms/next/editor.css',
  '@pith-cms/next/password',
  '@pith-cms/storage-filesystem',
  '@pith-cms/storage-github',
  '@pith-cms/cli',
]);

const failures = [];

for (const document of documents) {
  const source = await readFile(document, 'utf8');

  if (/(@pith-cms\/[\w-]+)\/(?:src|dist)(?:\/|['"])/.test(source)) {
    failures.push(`${document} documents an internal Pith import.`);
  }

  for (const match of source.matchAll(/from\s+['"](@pith-cms\/[^'"]+)['"]/g)) {
    if (!allowedImports.has(match[1])) {
      failures.push(`${document} imports undocumented public subpath ${match[1]}.`);
    }
  }

  if (/<(?:owner|repository|docs-domain)>/.test(source)) {
    failures.push(`${document} still contains a release placeholder.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${documents.length} documentation sources and public package imports.`);
}
