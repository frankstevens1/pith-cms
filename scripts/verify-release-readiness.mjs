import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const packages = [
  ['@pith-cms/core', 'packages/core'],
  ['@pith-cms/next', 'packages/next'],
  ['@pith-cms/cli', 'packages/cli'],
  ['@pith-cms/storage-filesystem', 'packages/storage-filesystem'],
  ['@pith-cms/storage-github', 'packages/storage-github'],
];

const requiredRepositoryMetadata = ['repository', 'homepage', 'bugs'];
const errors = [];

for (const [name, directory] of packages) {
  const manifestPath = resolve(directory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (manifest.name !== name) {
    errors.push(`${directory} has an unexpected package name.`);
  }

  if (!/^0\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
    errors.push(`${name} must use an explicit 0.x release version.`);
  }

  if (manifest.type !== 'module') {
    errors.push(`${name} must remain ESM-only.`);
  }

  if (manifest.publishConfig?.access !== 'public') {
    errors.push(`${name} must declare public npm access.`);
  }

  for (const property of requiredRepositoryMetadata) {
    if (!manifest[property]) {
      errors.push(`${name} is missing required npm metadata: ${property}.`);
    }
  }

  if (!manifest.exports || Object.keys(manifest.exports).some((entry) => entry.includes('*'))) {
    errors.push(`${name} must use explicit export-map entries only.`);
  }

  for (const relativePath of ['README.md', 'LICENSE']) {
    await access(resolve(directory, relativePath)).catch(() => {
      errors.push(`${name} is missing ${relativePath} from its publish allowlist.`);
    });
  }
}

const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (status) {
  errors.push('Release publication requires a clean, committed working tree.');
}

if (errors.length > 0) {
  console.error(`Release readiness failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Release metadata, export maps, and working tree are ready for publication.');
}
