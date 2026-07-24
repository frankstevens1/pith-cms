export interface JsonEnvelope<TData = unknown> {
  readonly ok: boolean;
  readonly data: TData | undefined;
  readonly error:
    | {
        readonly code: string;
        readonly message: string;
        readonly details: unknown;
      }
    | undefined;
}

export function jsonOutput<TData>(data: TData): JsonEnvelope<TData> {
  return { ok: true, data, error: undefined };
}

export function jsonError(code: string, message: string, details?: unknown): JsonEnvelope {
  return { ok: false, data: undefined, error: { code, message, details } };
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printLine(line?: string): void {
  if (line === undefined) {
    process.stdout.write('\n');
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

export function printWarning(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

export function printSuccess(message: string): void {
  process.stdout.write(`✓ ${message}\n`);
}

export function formatRedacted(value: string | undefined, visibleChars = 4): string {
  if (!value) return '<not set>';

  if (value.length <= visibleChars) return '*'.repeat(value.length);

  return `${value.slice(0, visibleChars)}${'*'.repeat(Math.max(value.length - visibleChars, 0))}`;
}

export function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

export class CliError extends Error {
  readonly exitCode: number;

  constructor(
    message: string,
    readonly code: string,
    exitCode: number,
  ) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }

  toJson(): JsonEnvelope {
    return jsonError(this.code, this.message);
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, 'USAGE_ERROR', 2);
}

export function configError(message: string): CliError {
  return new CliError(message, 'CONFIG_ERROR', 2);
}

export function contentError(message: string): CliError {
  return new CliError(message, 'CONTENT_ERROR', 1);
}

export function repoError(message: string): CliError {
  return new CliError(message, 'REPO_ERROR', 2);
}
