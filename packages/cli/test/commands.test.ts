import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const cliPath = resolve(repoRoot, 'packages/cli/dist/cli.js');
const playgroundRoot = resolve(repoRoot, 'apps/playground');

function runCli(
  args: string[],
  cwd: string = playgroundRoot,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      PITH_REPOSITORY_PROVIDER: 'filesystem',
    },
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

describe('content commands (integration)', () => {
  describe('content list', () => {
    it('lists pages collection', () => {
      const result = runCli(['content', 'list', 'pages', '--json']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(output.data.collection).toBe('pages');
      expect(Array.isArray(output.data.entries)).toBe(true);
    });

    it('rejects unknown collection', () => {
      const result = runCli(['content', 'list', 'nonexistent', '--json']);
      expect(result.status).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(false);
    });

    it('requires a collection name', () => {
      const result = runCli(['content', 'list']);
      expect(result.status).toBe(2);
    });

    it('outputs human-readable format by default', () => {
      const result = runCli(['content', 'list', 'pages']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Collection: pages');
    });
  });

  describe('content read', () => {
    it('reads a specific entry', () => {
      const result = runCli(['content', 'read', 'pages', 'home', '--json']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(output.data.identifier).toBe('home');
      expect(output.data.value).toBeDefined();
      expect(output.data.value.title).toBeDefined();
    });

    it('reports not found for missing entry', () => {
      const result = runCli(['content', 'read', 'pages', 'nonexistent-entry', '--json']);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(false);
    });
  });

  describe('content check', () => {
    it('checks all content', () => {
      const result = runCli(['content', 'check', '--json']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
    });
  });
});

describe('doctor command', () => {
  it('runs doctor from playground root', () => {
    const result = runCli(['doctor', '--json']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    const { data } = output;
    expect(data.nodeCompatible).toBeDefined();
    expect(data.appRouterDetected).toBe(true);
    expect(data.configFound).toBe(true);
  });

  it('reports project not found outside a project', () => {
    const result = runCli(['doctor', '--json'], '/');
    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(false);
  });
});

describe('auth commands', () => {
  it('generate-secret produces 64 hex characters', () => {
    const result = runCli(['auth', 'generate-secret', '--json']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.data.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generate-secret outputs human-readable format', () => {
    const result = runCli(['auth', 'generate-secret']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PITH_SESSION_SECRET=');
  });
});

describe('help command', () => {
  it('shows help', () => {
    const result = runCli(['--help'], '/');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Pith CLI');
  });

  it('shows help with -h', () => {
    const result = runCli(['-h'], '/');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Pith CLI');
  });

  it('shows help for no command', () => {
    const result = runCli([], '/');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Pith CLI');
  });

  it('errors for unknown command', () => {
    const result = runCli(['unknown-cmd'], '/');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown command');
  });
});

describe('JSON envelope', () => {
  it('all non-interactive commands support --json', () => {
    const result = runCli(['content', 'list', 'pages', '--json']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('ok');
    expect(typeof output.ok).toBe('boolean');
  });

  it('invalid content exits with code 1', () => {
    const result = runCli(['content', 'read', 'pages', 'no-such-entry', '--json']);
    expect(result.status).toBe(1);
  });

  it('config errors exit with code 2', () => {
    const result = runCli(['content', 'list', 'nonexistent', '--json']);
    expect(result.status).toBe(2);
  });
});

describe('config override', () => {
  it('supports --config flag', () => {
    const configPath = resolve(playgroundRoot, 'pith.config.ts');
    const result = runCli(['content', 'list', 'pages', '--config', configPath, '--json']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
  });
});
