import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface PromptOptions {
  readonly default?: string | undefined;
  readonly required?: boolean;
  readonly hint?: string;
}

export async function prompt(message: string, options: PromptOptions = {}): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    let display = message;

    if (options.hint) {
      display += ` (${options.hint})`;
    }

    if (options.default) {
      display += ` [${options.default}]`;
    }

    display += ': ';

    const answer = await rl.question(display);

    if (!answer && options.default) {
      return options.default;
    }

    if (!answer && options.required) {
      throw new Error('A value is required.');
    }

    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function promptPassword(message: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const password = await rl.question(`${message}: `);

    if (!password) {
      throw new Error('A non-empty password is required.');
    }

    return password;
  } finally {
    rl.close();
  }
}

export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const hint = defaultYes ? 'Y/n' : 'y/N';
    const answer = await rl.question(`${message} [${hint}]: `);
    const normalized = answer.trim().toLowerCase();

    if (!normalized) return defaultYes;

    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

export async function choose<TValue extends string>(
  message: string,
  options: readonly { readonly value: TValue; readonly label: string }[],
  defaultValue?: TValue,
): Promise<TValue> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log(`${message}:`);

    for (let i = 0; i < options.length; i++) {
      const option = options[i]!;
      const marker = defaultValue === option.value ? ' (default)' : '';
      console.log(`  ${i + 1}. ${option.label}${marker}`);
    }

    const answer = await rl.question('Choose a number: ');
    const index = parseInt(answer.trim(), 10);

    if (isNaN(index) && defaultValue) {
      return defaultValue;
    }

    if (isNaN(index) || index < 1 || index > options.length) {
      throw new Error(`Please choose a number between 1 and ${options.length}.`);
    }

    return options[index - 1]!.value;
  } finally {
    rl.close();
  }
}
