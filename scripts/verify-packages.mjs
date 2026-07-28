import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactsDirectory = join(repositoryRoot, '.artifacts', 'package-smoke');
const tarballDirectory = join(artifactsDirectory, 'tarballs');
const fixtureDirectory = join(artifactsDirectory, 'fixture');
const packageNames = [
  '@pith-cms/core',
  '@pith-cms/next',
  '@pith-cms/cli',
  '@pith-cms/storage-filesystem',
  '@pith-cms/storage-github',
];

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env: {
      ...process.env,
      PITH_PASSWORD_HASH:
        '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
      PITH_SESSION_SECRET: 'pith-package-fixture-session-secret-not-for-production',
      PITH_PREVIEW_SECRET: 'pith-package-fixture-preview-secret-not-for-production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function tarballFor(packageName) {
  const archivePrefix = `${packageName.slice(1).replace('/', '-')}-`;
  const tarball = readdirSync(tarballDirectory).find(
    (fileName) => fileName.startsWith(archivePrefix) && fileName.endsWith('.tgz'),
  );

  if (!tarball) {
    throw new Error(`No tarball was created for ${packageName}.`);
  }

  return join(tarballDirectory, tarball);
}

function assertTarballIncludes(packageName, expectedPath) {
  const result = spawnSync('tar', ['-tzf', tarballFor(packageName)], {
    encoding: 'utf8',
  });

  if (result.status !== 0 || !result.stdout.split('\n').includes(expectedPath)) {
    throw new Error(`${packageName} tarball is missing ${expectedPath}.`);
  }
}

rmSync(artifactsDirectory, { force: true, recursive: true });
mkdirSync(tarballDirectory, { recursive: true });

run('pnpm', ['--filter', './packages/*', 'build'], repositoryRoot);

for (const packageName of packageNames) {
  run(
    'pnpm',
    ['--filter', packageName, 'pack', '--pack-destination', tarballDirectory],
    repositoryRoot,
  );
}

assertTarballIncludes('@pith-cms/next', 'package/dist/editor.css');
assertTarballIncludes('@pith-cms/next', 'package/dist/editor-client.js');
assertTarballIncludes('@pith-cms/next', 'package/dist/editor-client.d.ts');
assertTarballIncludes('@pith-cms/next', 'package/dist/markdown-editor.js');
assertTarballIncludes('@pith-cms/next', 'package/dist/markdown-editor.d.ts');
assertTarballIncludes('@pith-cms/next', 'package/dist/preview-banner.js');
assertTarballIncludes('@pith-cms/next', 'package/dist/preview-banner.d.ts');
assertTarballIncludes('@pith-cms/cli', 'package/dist/cli.js');
assertTarballIncludes('@pith-cms/cli', 'package/dist/cli.d.ts');
assertTarballIncludes('@pith-cms/storage-github', 'package/dist/index.js');
assertTarballIncludes('@pith-cms/storage-github', 'package/dist/index.d.ts');

cpSync(join(repositoryRoot, 'tests', 'package-smoke'), fixtureDirectory, { recursive: true });

const fixtureManifestPath = join(fixtureDirectory, 'package.json');
const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8'));
const packagedDependencies = Object.fromEntries(
  packageNames.map((packageName) => [packageName, `file:${tarballFor(packageName)}`]),
);
fixtureManifest.dependencies = {
  ...fixtureManifest.dependencies,
  ...packagedDependencies,
};
writeFileSync(fixtureManifestPath, `${JSON.stringify(fixtureManifest, null, 2)}\n`);

writeFileSync(
  join(fixtureDirectory, 'pnpm-workspace.yaml'),
  [
    'packages: []',
    'overrides:',
    ...packageNames.map(
      (packageName) => `  '${packageName}': '${packagedDependencies[packageName]}'`,
    ),
    'allowBuilds:',
    '  sharp: true',
    '',
  ].join('\n'),
);

run('pnpm', ['install'], fixtureDirectory);
run('pnpm', ['typecheck'], fixtureDirectory);
run('pnpm', ['build'], fixtureDirectory);
await smokeFixture(fixtureDirectory);

console.log(
  'Published package tarballs installed, type-checked, production-built, and smoke-tested successfully.',
);

async function smokeFixture(cwd) {
  const port = 3210;
  const server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      PITH_PASSWORD_HASH:
        '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
      PITH_SESSION_SECRET: 'pith-package-fixture-session-secret-not-for-production',
      PITH_PREVIEW_SECRET: 'pith-package-fixture-preview-secret-not-for-production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'pipe',
  });

  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);

  try {
    await waitForFixture(`http://127.0.0.1:${port}/`, server);
    const response = await fetch(`http://127.0.0.1:${port}/`);

    if (!response.ok || !(await response.text()).includes('Packaged Pith')) {
      throw new Error('The packaged fixture did not render its Pith-backed home page.');
    }
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
}

async function waitForFixture(url, server) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The packaged fixture server exited with code ${server.exitCode}.`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });

      if (response.ok) {
        return;
      }
    } catch {
      // The Next.js server has not bound its port yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for the packaged fixture server.');
}
