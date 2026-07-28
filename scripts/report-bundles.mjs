import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const entries = [
  ['@pith-cms/core', 'packages/core/dist/index.js', 75 * 1024],
  ['@pith-cms/storage-filesystem', 'packages/storage-filesystem/dist/index.js', 40 * 1024],
  ['@pith-cms/storage-github', 'packages/storage-github/dist/index.js', 80 * 1024],
  ['@pith-cms/next server', 'packages/next/dist/server.js', 160 * 1024],
  ['@pith-cms/next editor client', 'packages/next/dist/editor-client.js', 75 * 1024],
  ['@pith-cms/next Markdown editor', 'packages/next/dist/markdown-editor.js', 24 * 1024],
  ['@pith-cms/next editor stylesheet', 'packages/next/dist/editor.css', 32 * 1024],
  ['@pith-cms/next password', 'packages/next/dist/password.js', 8 * 1024],
  ['@pith-cms/cli', 'packages/cli/dist/cli.js', 120 * 1024],
];

let exceeded = false;

for (const [name, relativePath, budget] of entries) {
  const size = (await stat(resolve(relativePath))).size;
  const kibibytes = (size / 1024).toFixed(1);
  const budgetKibibytes = (budget / 1024).toFixed(0);
  console.log(`${name}: ${kibibytes} KiB (budget ${budgetKibibytes} KiB)`);

  if (size > budget) {
    exceeded = true;
    console.error(`${name} exceeds its release budget.`);
  }
}

if (exceeded) {
  process.exitCode = 1;
}
