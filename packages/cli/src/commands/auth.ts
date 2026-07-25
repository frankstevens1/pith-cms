import { hashPassword } from '@pith-cms/next/password';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promptPassword } from '../utils/prompt.js';
import { printLine, printError, printJson, jsonOutput } from '../utils/output.js';

export interface HashPasswordOptions {
  readonly jsonMode: boolean;
  readonly env?: boolean;
  readonly live?: boolean;
}

export async function hashPasswordCommand(options: HashPasswordOptions): Promise<void> {
  try {
    const password = await promptPassword('Password to hash');
    const hash = await hashPassword(password);

    if (options.jsonMode) {
      printJson(jsonOutput({ passwordHash: hash }));
      return;
    }

    const escaped = hash.replaceAll('$', '\\$');
    const envLine = `PITH_PASSWORD_HASH=${escaped}`;
    const liveLine = `PITH_PASSWORD_HASH=${hash}`;

    if (options.env) {
      printLine();
      printLine(envLine);
      printLine();
      tryCopy(envLine);
    } else if (options.live) {
      printLine();
      printLine(liveLine);
      printLine();
      tryCopy(liveLine);
    } else {
      printLine();
      printLine('For .env:');
      printLine(envLine);
      printLine();
      printLine('For hosted environments (no escaping):');
      printLine(liveLine);
      printLine();
      tryCopy(`# For .env:\n${envLine}\n\n# For hosted environments (no escaping):\n${liveLine}`);
    }
  } catch (error) {
    if (options.jsonMode) {
      printJson({ ok: false, error: { code: 'AUTH_ERROR', message: (error as Error).message } });
    } else {
      printError((error as Error).message);
    }
    process.exitCode = 1;
  }
}

export interface GenerateSecretOptions {
  readonly jsonMode: boolean;
  readonly session?: boolean;
  readonly preview?: boolean;
}

export function generateSecretCommand(options: GenerateSecretOptions): void {
  if (options.jsonMode) {
    const secret = randomBytes(32).toString('hex');
    printJson(jsonOutput({ sessionSecret: secret }));
    return;
  }

  const sessionSecret = randomBytes(32).toString('hex');
  const previewSecret = randomBytes(32).toString('hex');
  const sessionLine = `PITH_SESSION_SECRET=${sessionSecret}`;
  const previewLine = `PITH_PREVIEW_SECRET=${previewSecret}`;

  if (options.session) {
    printLine();
    printLine(sessionLine);
    printLine();
    tryCopy(sessionLine);
  } else if (options.preview) {
    printLine();
    printLine(previewLine);
    printLine();
    tryCopy(previewLine);
  } else {
    printLine();
    printLine(sessionLine);
    printLine(previewLine);
    printLine();
    tryCopy(`${sessionLine}\n${previewLine}`);
  }
}

function tryCopy(text: string): void {
  const command =
    process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : undefined;

  if (!command) {
    return;
  }

  try {
    const result = spawnSync(command, [], {
      input: text,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      printLine('Copied to clipboard.');
    }
  } catch {
    // clipboard unavailable — ignore
  }
}
