import { readFile } from 'node:fs/promises';

const documents = [
  'README.md',
  'CONTRIBUTING.md',
  'SUPPORT.md',
  'docs/public-api.md',
  'docs/quick-start.md',
  'docs/collections.md',
  'docs/editor.md',
  'docs/storage.md',
  'docs/compatibility.md',
  'docs/errors.md',
  'docs/troubleshooting.md',
  'docs/migrations.md',
  'docs/known-limitations.md',
  'docs/deployment.md',
  'docs/cli.md',
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
