import { hashPassword } from '@pith-cms/next/password';
import { randomBytes } from 'node:crypto';
import { promptPassword } from '../utils/prompt.js';
import { printLine, printError, printJson, jsonOutput } from '../utils/output.js';

export async function hashPasswordCommand(jsonMode: boolean): Promise<void> {
  try {
    const password = await promptPassword('Password to hash');
    const hash = await hashPassword(password);

    if (jsonMode) {
      printJson(jsonOutput({ passwordHash: hash }));
    } else {
      printLine();
      printLine('For a Next.js .env file, paste:');
      printLine(`PITH_PASSWORD_HASH=${hash.replaceAll('$', '\\$')}`);
      printLine();
      printLine('For a hosting environment variable, use the same value without the backslashes.');
    }
  } catch (error) {
    if (jsonMode) {
      printJson({ ok: false, error: { code: 'AUTH_ERROR', message: (error as Error).message } });
    } else {
      printError((error as Error).message);
    }
    process.exitCode = 1;
  }
}

export function generateSecretCommand(jsonMode: boolean): void {
  const secret = randomBytes(32).toString('hex');

  if (jsonMode) {
    printJson(jsonOutput({ sessionSecret: secret }));
  } else {
    printLine();
    printLine('Add this to your .env file:');
    printLine(`PITH_SESSION_SECRET=${secret}`);
    printLine();
  }
}
