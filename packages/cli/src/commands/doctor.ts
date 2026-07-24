import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { validatePithConfig } from '@pith-cms/core';

import { loadEnvFiles, parseRepositoryProvider, getGitHubConfig } from '../utils/env.js';
import {
  findProjectRoot,
  findPithConfig,
  extractPithExport,
  findAppDirectory,
  fileExists as fsExists,
} from '../utils/config.js';
import {
  printLine,
  printJson,
  printError,
  jsonOutput,
  jsonError,
  formatBoolean,
} from '../utils/output.js';

interface DoctorReport {
  nodeCompatible: boolean;
  nodeVersion: string;
  appRouterDetected: boolean;
  packagesInstalled: boolean;
  missingPackages: string[];
  configFound: boolean;
  configPath?: string;
  configValid: boolean;
  configErrors: string[];
  contentRootAccessible: boolean;
  editorConfigured: boolean;
  editorSetup?: {
    editorPageExists: boolean;
    editorApiExists: boolean;
    authConfigured: boolean;
  };
  repositoryConnectivity: {
    provider: string;
    connected: boolean;
    message: string;
  };
}

export async function doctorCommand(jsonMode: boolean): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());

  if (!projectRoot) {
    if (jsonMode) {
      printJson(
        jsonError('PROJECT_NOT_FOUND', 'Could not find a project root (no package.json found).'),
      );
    } else {
      printError(
        'Could not find a project root. Run this command inside a project with a package.json.',
      );
    }
    process.exitCode = 2;
    return;
  }

  const report: DoctorReport = {
    nodeCompatible: false,
    nodeVersion: process.version,
    appRouterDetected: false,
    packagesInstalled: false,
    missingPackages: [],
    configFound: false,
    configValid: false,
    configErrors: [],
    contentRootAccessible: false,
    editorConfigured: false,
    repositoryConnectivity: {
      provider: 'filesystem',
      connected: false,
      message: '',
    },
  };

  report.nodeCompatible = checkNodeCompatibility();

  const appDir = await findAppDirectory(projectRoot);
  report.appRouterDetected = appDir !== null;

  report.packagesInstalled = await checkPackages(projectRoot);
  report.missingPackages = await getMissingPackages(projectRoot);

  await loadEnvFiles(projectRoot);

  const configResult = await findPithConfig(projectRoot);

  if (configResult) {
    report.configFound = true;
    report.configPath = relative(projectRoot, configResult.path);

    const exported = extractPithExport(configResult.value as Record<string, unknown>);

    if (exported) {
      try {
        validatePithConfig(exported.config as Parameters<typeof validatePithConfig>[0]);
        report.configValid = true;

        const config = exported.config as { contentRoot: string };
        const contentPath = resolve(projectRoot, config.contentRoot);
        report.contentRootAccessible = await directoryAccessible(contentPath);
      } catch (error) {
        report.configErrors.push((error as Error).message);
      }
    } else {
      report.configErrors.push('Config file does not export a valid Pith config.');
    }
  }

  report.editorConfigured = await checkEditorSetup(projectRoot, appDir);

  report.repositoryConnectivity = await checkRepositoryConnectivity(projectRoot);

  if (jsonMode) {
    printJson(jsonOutput(report));
  } else {
    printDoctorReport(report);
  }

  const hasIssues =
    !report.nodeCompatible ||
    !report.configValid ||
    !report.repositoryConnectivity.connected ||
    report.configErrors.length > 0;

  if (hasIssues) {
    process.exitCode = 1;
  }
}

function checkNodeCompatibility(): boolean {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major! > 24 || (major! === 24 && minor! >= 7);
}

async function checkPackages(projectRoot: string): Promise<boolean> {
  const required = ['@pith-cms/core', '@pith-cms/next'];
  const manifestPath = resolve(projectRoot, 'package.json');

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const allDeps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    return required.every((pkg) => pkg in allDeps);
  } catch {
    return false;
  }
}

async function getMissingPackages(projectRoot: string): Promise<string[]> {
  const required = ['@pith-cms/core', '@pith-cms/next'];
  const manifestPath = resolve(projectRoot, 'package.json');

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const allDeps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    return required.filter((pkg) => !(pkg in allDeps));
  } catch {
    return required;
  }
}

async function directoryAccessible(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkEditorSetup(projectRoot: string, appDir: string | null): Promise<boolean> {
  if (!appDir) return false;

  const editorPagePath = resolve(appDir, 'pith', '[[...pithPath]]', 'page.tsx');
  const editorApiPath = resolve(appDir, 'api', 'pith', '[...pithRoute]', 'route.ts');
  const editorPageExists = await fsExists(editorPagePath);
  const editorApiExists = await fsExists(editorApiPath);

  return editorPageExists && editorApiExists;
}

async function checkRepositoryConnectivity(projectRoot: string): Promise<{
  provider: string;
  connected: boolean;
  message: string;
}> {
  const provider = parseRepositoryProvider();

  if (provider === 'filesystem') {
    try {
      await access(projectRoot, constants.R_OK);
      return {
        provider: 'filesystem',
        connected: true,
        message: 'Filesystem repository accessible.',
      };
    } catch (error) {
      return {
        provider: 'filesystem',
        connected: false,
        message: `Cannot access project directory: ${(error as Error).message}`,
      };
    }
  }

  const github = getGitHubConfig();

  if (!github.owner || !github.repository) {
    return {
      provider: 'github',
      connected: false,
      message:
        'GitHub repository not configured. Set PITH_GITHUB_OWNER and PITH_GITHUB_REPOSITORY.',
    };
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

    const repo = createGitHubRepository({
      owner: github.owner,
      repository: github.repository,
      branch: github.branch ?? 'main',
      auth,
      publishing: { mode: 'direct' },
    });

    try {
      await repo.verifyConnection();
      return {
        provider: 'github',
        connected: true,
        message: `Successfully connected to ${github.owner}/${github.repository}.`,
      };
    } catch (error) {
      return {
        provider: 'github',
        connected: false,
        message: `Connection failed: ${(error as Error).message}`,
      };
    }
  } catch (error) {
    return {
      provider: 'github',
      connected: false,
      message: `Failed to create GitHub repository adapter: ${(error as Error).message}`,
    };
  }
}

function printDoctorReport(report: DoctorReport): void {
  printLine();
  printLine('Pith Doctor');
  printLine('============');
  printLine();

  printLine(
    `  Node.js version: ${report.nodeVersion} ${report.nodeCompatible ? '✓' : '✗ (requires >=24.7.0)'}`,
  );
  printLine(`  App Router: ${formatBoolean(report.appRouterDetected)}`);
  printLine(`  Packages installed: ${formatBoolean(report.packagesInstalled)}`);

  if (report.missingPackages.length > 0) {
    printLine(`    Missing: ${report.missingPackages.join(', ')}`);
  }

  printLine(
    `  Config file: ${report.configFound ? (report.configPath ?? 'found') : '✗ not found'}`,
  );

  if (report.configFound) {
    printLine(`  Config valid: ${formatBoolean(report.configValid)}`);

    for (const error of report.configErrors) {
      printLine(`    - ${error}`);
    }

    printLine(`  Content root: ${formatBoolean(report.contentRootAccessible)}`);
  }

  printLine(`  Editor setup: ${formatBoolean(report.editorConfigured)}`);

  printLine(`  Repository (${report.repositoryConnectivity.provider}):`);
  printLine(
    `    ${report.repositoryConnectivity.connected ? '✓' : '✗'} ${report.repositoryConnectivity.message}`,
  );

  printLine();
}
