import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  findProjectRoot,
  findAppDirectory,
  detectPackageManager,
  findPithConfig,
  fileExists,
} from '../utils/config.js';
import { confirm } from '../utils/prompt.js';
import { printLine, printWarning, printSuccess, configError } from '../utils/output.js';

interface InitOptions {
  readonly yes: boolean;
  readonly noInstall: boolean;
  readonly dryRun: boolean;
  readonly storage: 'filesystem' | 'github';
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());

  if (!projectRoot) {
    throw configError('Could not find a project root. Run pith init inside a Next.js project.');
  }

  const appDir = await findAppDirectory(projectRoot);

  if (!appDir) {
    throw configError(
      'Could not find an app directory (app/ or src/app/). Pith requires a Next.js App Router project.',
    );
  }

  const packageManager = await detectPackageManager(projectRoot);
  const existingConfig = await findPithConfig(projectRoot);

  const steps: string[] = [];
  const files: { path: string; content: string }[] = [];
  const installPackages: string[] = [];

  const contentRoot = 'content';

  printLine();
  printLine('Pith Init');
  printLine('==========');
  printLine();
  printLine(`Project root: ${projectRoot}`);
  printLine(`App directory: ${relative(projectRoot, appDir)}`);
  printLine(`Package manager: ${packageManager}`);
  printLine(`Storage: ${options.storage}`);

  if (existingConfig) {
    printLine();
    printLine(
      'Existing pith config found. The init command will set up managed collection markers.',
    );
  }

  if (!options.yes) {
    const proceed = await confirm('\nProceed with initialization?', true);
    if (!proceed) {
      printLine('Initialization cancelled.');
      return;
    }
  }

  const srcDir = resolve(appDir, '..');
  const libDir = resolve(srcDir, 'lib');

  const configImportPath = relative(libDir, resolve(projectRoot, 'pith.config')).replace(
    /\\/g,
    '/',
  );
  const editorPageDir = resolve(appDir, 'pith', '[[...pithPath]]');
  const pageImportPath = relative(editorPageDir, resolve(libDir, 'pith')).replace(/\\/g, '/');
  const routeDir = resolve(appDir, 'api', 'pith', '[...pithRoute]');
  const routeImportPath = relative(routeDir, resolve(libDir, 'pith')).replace(/\\/g, '/');

  const configCode = generatePithConfig();
  const libCode = generateLibPith(options.storage, configImportPath);
  const editorPageCode = generateEditorPage(pageImportPath);
  const editorRouteCode = generateEditorRoute(routeImportPath);

  steps.push('Generate pith.config.ts');
  files.push({
    path: resolve(projectRoot, 'pith.config.ts'),
    content: configCode,
  });

  steps.push('Generate server instance (src/lib/pith.ts)');
  files.push({
    path: resolve(libDir, 'pith.ts'),
    content: libCode,
  });

  steps.push('Generate editor page route (app/pith/[[...pithPath]]/page.tsx)');
  files.push({
    path: resolve(appDir, 'pith', '[[...pithPath]]', 'page.tsx'),
    content: editorPageCode,
  });

  steps.push('Generate editor API route (app/api/pith/[...pithRoute]/route.ts)');
  files.push({
    path: resolve(appDir, 'api', 'pith', '[...pithRoute]', 'route.ts'),
    content: editorRouteCode,
  });

  steps.push('Create content directory');
  files.push({
    path: resolve(projectRoot, contentRoot, 'pages', '.gitkeep'),
    content: '',
  });

  installPackages.push('@pith-cms/core', '@pith-cms/next', 'server-only');

  if (options.storage === 'github') {
    installPackages.push('@pith-cms/storage-github');
  } else {
    installPackages.push('@pith-cms/storage-filesystem');
  }

  const envExamplePath = resolve(projectRoot, '.env.example');

  if (options.dryRun) {
    printLine();
    printLine('Dry run - would create:');
    for (const step of steps) {
      printLine(`  ${step}`);
    }

    printLine();
    printLine('Would install packages:');
    for (const pkg of installPackages) {
      printLine(`  ${pkg}`);
    }

    return;
  }

  for (const file of files) {
    const dir = dirname(file.path);
    await mkdir(dir, { recursive: true });

    if (await fileExists(file.path)) {
      printWarning(`Skipping existing file: ${relative(projectRoot, file.path)}`);
      continue;
    }

    await writeFile(file.path, file.content, 'utf8');
    printSuccess(`Created ${relative(projectRoot, file.path)}`);
  }

  if (await fileExists(envExamplePath)) {
    await updateEnvExample(envExamplePath, options.storage);
  } else {
    const envContent = generateEnvExample(options.storage);
    await writeFile(envExamplePath, envContent, 'utf8');
    printSuccess(`Created .env.example`);
  }

  if (!options.noInstall && installPackages.length > 0) {
    printLine();
    printLine(`Installing packages with ${packageManager}...`);
    installDependencies(packageManager, installPackages, projectRoot);
  }

  printPostInit(options.storage);
}

function generatePithConfig(): string {
  return [
    `import { defineCollection, definePith, field } from '@pith-cms/core';`,
    '',
    `// ═══════════════════════════════════════════════════════════`,
    `// Managed by @pith-cms/cli — do not edit collection markers`,
    `// ═══════════════════════════════════════════════════════════`,
    '',
    `export const pith = definePith({`,
    `  contentRoot: 'content',`,
    `  collections: {`,
    `    // === @pith-cms/collection:pages ===`,
    `    pages: defineCollection({`,
    `      label: 'Pages',`,
    `      path: 'pages',`,
    `      format: 'json',`,
    `      identifierField: 'slug',`,
    `      displayField: 'title',`,
    `      fields: {`,
    `        title: field.text({ required: true }),`,
    `        slug: field.slug({ source: 'title', required: true }),`,
    `      },`,
    `    }),`,
    `    // === @pith-cms/collection:end:pages ===`,
    `  },`,
    `});`,
    '',
    `export default pith;`,
    '',
  ].join('\n');
}

function generateLibPith(storage: string, configImportPath: string): string {
  const imports =
    storage === 'github'
      ? [
          `import 'server-only';`,
          `import { createPith } from '@pith-cms/next/server';`,
          `import { createPasswordAuth } from '@pith-cms/next/server';`,
          `import { createGitHubRepository } from '@pith-cms/storage-github';`,
          `import { pith as config } from '${configImportPath}';`,
        ]
      : [
          `import 'server-only';`,
          `import { createPith } from '@pith-cms/next/server';`,
          `import { createPasswordAuth } from '@pith-cms/next/server';`,
          `import { createFilesystemRepository } from '@pith-cms/storage-filesystem';`,
          `import { pith as config } from '${configImportPath}';`,
        ];

  const authBlock = [
    `const auth =`,
    `  process.env.PITH_PASSWORD_HASH && process.env.PITH_SESSION_SECRET`,
    `    ? createPasswordAuth({`,
    `        passwordHash: process.env.PITH_PASSWORD_HASH,`,
    `        sessionSecret: process.env.PITH_SESSION_SECRET,`,
    `        secure: process.env.NODE_ENV === 'production',`,
    `      })`,
    `    : undefined;`,
    '',
  ];

  const repoSetup =
    storage === 'github'
      ? [
          `const repository = createGitHubRepository({`,
          `  owner: requiredEnvironment('PITH_GITHUB_OWNER'),`,
          `  repo: requiredEnvironment('PITH_GITHUB_REPOSITORY'),`,
          `  branch: process.env.PITH_GITHUB_BRANCH ?? 'main',`,
          `  auth: process.env.PITH_GITHUB_APP_ID`,
          `    ? ({`,
          `        type: 'app' as const,`,
          `        appId: process.env.PITH_GITHUB_APP_ID,`,
          `        privateKey: requiredEnvironment('PITH_GITHUB_APP_PRIVATE_KEY'),`,
          `        installationId: requiredEnvironment('PITH_GITHUB_INSTALLATION_ID'),`,
          `      } as const)`,
          `    : ({`,
          `        type: 'token' as const,`,
          `        token: requiredEnvironment('PITH_GITHUB_TOKEN'),`,
          `      } as const),`,
          `  publishing:`,
          `    process.env.PITH_GITHUB_PUBLISHING_MODE === 'pull-request'`,
          `      ? ({ mode: 'pull-request', branchPrefix: process.env.PITH_GITHUB_BRANCH_PREFIX ?? 'pith/' } as const)`,
          `      : ({ mode: 'direct' } as const),`,
          `  contentRoot: 'content',`,
          `});`,
          '',
          `function requiredEnvironment(name: string): string {`,
          `  const value = process.env[name];`,
          `  if (!value) {`,
          `    throw new Error(`,
          `      \`\${name} is required for GitHub storage. Set it in .env.local.\`,`,
          `    );`,
          `  }`,
          `  return value;`,
          `}`,
          '',
        ]
      : [`const repository = createFilesystemRepository({ rootDirectory: process.cwd() });`, ''];

  return [...imports, '', ...authBlock, ...repoSetup, generatePithCreateBlock()].join('\n');
}

function generatePithCreateBlock(): string {
  return [
    `export const pith = createPith({`,
    `  config,`,
    `  repository,`,
    `  cache: { mode: 'persistent', revalidate: 60 },`,
    `  ...(auth ? { auth, editor: { basePath: '/pith', apiBasePath: '/api/pith' } } : {}),`,
    `});`,
    '',
  ].join('\n');
}

function generateEditorPage(importPath: string): string {
  return [
    `import { pith } from '${importPath}';`,
    '',
    `export default async function PithEditorPage(props: {`,
    `  readonly params: Promise<Record<string, string | readonly string[] | undefined>>;`,
    `  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;`,
    `}) {`,
    `  if (!pith.editor) {`,
    `    return (`,
    `      <main style={{ maxWidth: '42rem', margin: '4rem auto', padding: '0 1.5rem' }}>`,
    `        <h1 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Editor is not configured</h1>`,
    `        <p style={{ marginTop: '0.75rem', color: '#555' }}>`,
    `          Set PITH_PASSWORD_HASH and PITH_SESSION_SECRET to enable the editor.`,
    `        </p>`,
    `      </main>`,
    `    );`,
    `  }`,
    '',
    `  const EditorPage = pith.editor.page;`,
    `  return <EditorPage {...props} />;`,
    `}`,
    '',
  ].join('\n');
}

function generateEditorRoute(importPath: string): string {
  return [
    `import { pith } from '${importPath}';`,
    '',
    `const handlers = pith.editor?.handlers;`,
    '',
    `function unavailable(): Response {`,
    `  return Response.json(`,
    `    { ok: false, error: { code: 'EDITOR_NOT_CONFIGURED', message: 'Editor is not configured.' } },`,
    `    { status: 503 },`,
    `  );`,
    `}`,
    '',
    `export async function GET(`,
    `  request: Request,`,
    `  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },`,
    `) {`,
    `  return handlers ? handlers.GET(request, context) : unavailable();`,
    `}`,
    '',
    `export async function POST(`,
    `  request: Request,`,
    `  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },`,
    `) {`,
    `  return handlers ? handlers.POST(request, context) : unavailable();`,
    `}`,
    '',
    `export async function PUT(`,
    `  request: Request,`,
    `  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },`,
    `) {`,
    `  return handlers ? handlers.PUT(request, context) : unavailable();`,
    `}`,
    '',
    `export async function DELETE(`,
    `  request: Request,`,
    `  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },`,
    `) {`,
    `  return handlers ? handlers.DELETE(request, context) : unavailable();`,
    `}`,
    '',
  ].join('\n');
}

function printPostInit(storage: string): void {
  printLine();
  printLine('Pith initialization complete.');
  printLine();
  printLine('Next steps:');
  printLine('  1. Generate authentication secrets:');
  printLine('       pnpm pith auth hash-password');
  printLine('       pnpm pith auth generate-secret');
  printLine('     Save both outputs to .env.local.');
  printLine();

  if (storage === 'github') {
    printLine('  2. Configure GitHub storage in .env.local:');
    printLine('       PITH_REPOSITORY_PROVIDER=github');
    printLine('       PITH_GITHUB_OWNER=<your-github-username>');
    printLine('       PITH_GITHUB_REPOSITORY=<your-repo-name>');
    printLine('       PITH_GITHUB_BRANCH=main');
    printLine('       PITH_GITHUB_TOKEN=<your-github-token>');
    printLine('     See docs/storage.md for GitHub App and pull-request options.');
  }

  printLine();
  printLine(
    `  ${storage === 'github' ? '3' : '2'}. Add the editor stylesheet. In your root layout or globals.css:`,
  );
  printLine(`       @import '@pith-cms/next/editor.css';`);
  printLine();
  printLine('     The editor ships light and dark themes out of the box. To customize,');
  printLine('     set CSS custom properties on [data-theme="light"] or [data-theme="dark"].');
  printLine();
  printLine(`  ${storage === 'github' ? '4' : '3'}. Start your dev server and visit /pith.`);
  printLine();
  printLine('     Next.js logs API requests in development (including background preview');
  printLine('     polling). These are normal and do not indicate a problem.');
  printLine();
}

async function updateEnvExample(envPath: string, storage: string): Promise<void> {
  const content = await readFile(envPath, 'utf8');

  if (content.includes('PITH_PASSWORD_HASH')) {
    return;
  }

  const pithBlock = generateEnvBlock(storage);
  await writeFile(envPath, content + pithBlock, 'utf8');
  printSuccess(`Updated .env.example with Pith block`);
}

function generateEnvExample(storage: string): string {
  return generateEnvBlock(storage);
}

function generateEnvBlock(storage: string): string {
  const base = [
    '',
    '# Pith',
    '# ───────────────────────────────────────────────────────────',
    'PITH_PASSWORD_HASH=                    # Generate with: pnpm pith auth hash-password',
    'PITH_SESSION_SECRET=                   # Generate with: pnpm pith auth generate-secret',
    'PITH_PREVIEW_SECRET=                   # Required for authenticated preview',
  ];

  const githubVars = [
    'PITH_REPOSITORY_PROVIDER=github',
    'PITH_GITHUB_OWNER=',
    'PITH_GITHUB_REPOSITORY=',
    'PITH_GITHUB_BRANCH=main',
    'PITH_GITHUB_TOKEN=',
    '# PITH_GITHUB_PUBLISHING_MODE=direct',
    '# PITH_GITHUB_BRANCH_PREFIX=pith/',
    '# PITH_GITHUB_APP_ID=',
    '# PITH_GITHUB_APP_PRIVATE_KEY=',
    '# PITH_GITHUB_INSTALLATION_ID=',
  ];

  const filesystemVars = ['# PITH_REPOSITORY_PROVIDER=filesystem'];

  const vars = storage === 'github' ? githubVars : filesystemVars;
  return [...base, ...vars, ''].join('\n');
}

function installDependencies(packageManager: string, packages: string[], cwd: string): void {
  const args: Record<string, string[]> = {
    pnpm: ['add', ...packages],
    npm: ['install', ...packages],
    yarn: ['add', ...packages],
    bun: ['add', ...packages],
  };

  const cmdArgs = args[packageManager] ?? args['npm'];

  const result = spawnSync(packageManager, cmdArgs, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    printWarning(
      `Dependency installation failed. Run manually: ${packageManager} add ${packages.join(' ')}`,
    );
  }
}
