#!/usr/bin/env node

import { initCommand } from './commands/init.js';
import { collectionAddCommand } from './commands/collection.js';
import { contentCheckCommand, contentListCommand, contentReadCommand } from './commands/content.js';
import { doctorCommand } from './commands/doctor.js';
import { hashPasswordCommand, generateSecretCommand } from './commands/auth.js';
import { printLine, printError } from './utils/output.js';

interface ParsedArgs {
  readonly command: string;
  readonly subcommand?: string | undefined;
  readonly args: string[];
  readonly flags: Record<string, string | boolean>;
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const args = rawArgs.slice(2);
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');

      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];

        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  const command = positional[0] ?? '';
  const subcommand = positional[1];
  const rest = positional.slice(subcommand ? 2 : command ? 1 : 0);

  return { command, subcommand, args: rest, flags };
}

function isHelp(flags: Record<string, string | boolean>): boolean {
  return flags.help === true || flags.h === true;
}

function printHelp(): void {
  printLine(`Pith CLI v0.1.0

Usage:
  pith <command> [options]

Commands:
  init                  Scaffold a Pith integration in a Next.js App Router project
  collection add        Add a new collection interactively
  content check         Validate all content entries against their schemas
  content list <col>    List entries in a collection
  content read <col> <id> Read a single entry
  doctor                Diagnose Pith setup and report issues
  auth hash-password    Generate an Argon2id password hash
  auth generate-secret  Generate a session secret

Options:
  --config <path>       Path to the pith config file
  --json                Output in JSON format
  --yes                 Skip confirmation prompts
  --no-install          Skip dependency installation
  --dry-run             Preview changes without writing
  --storage <type>      Storage adapter (filesystem or github, default: filesystem)
  --help, -h            Show this help

Exit codes:
  0  Success
  1  Invalid content or failed diagnostics
  2  Usage, configuration, or repository setup error
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (isHelp(parsed.flags) || !parsed.command) {
    printHelp();
    if (!parsed.command && !isHelp(parsed.flags)) {
      process.exitCode = 2;
    }
    return;
  }

  const jsonMode = parsed.flags.json === true;

  try {
    switch (parsed.command) {
      case 'init': {
        await initCommand({
          yes: parsed.flags.yes === true,
          noInstall: parsed.flags['no-install'] === true,
          dryRun: parsed.flags['dry-run'] === true,
          storage: parsed.flags.storage === 'github' ? 'github' : 'filesystem',
        });
        break;
      }

      case 'collection': {
        if (parsed.subcommand !== 'add') {
          printError('Usage: pith collection add');
          printLine('Run pith --help for more information.');
          process.exitCode = 2;
          return;
        }
        await collectionAddCommand();
        break;
      }

      case 'content': {
        const configPath =
          typeof parsed.flags.config === 'string' ? parsed.flags.config : undefined;

        switch (parsed.subcommand) {
          case 'check': {
            await contentCheckCommand(jsonMode);
            break;
          }
          case 'list': {
            const collection = parsed.args[0];
            if (!collection) {
              printError('Usage: pith content list <collection>');
              process.exitCode = 2;
              return;
            }
            await contentListCommand(collection, jsonMode, configPath);
            break;
          }
          case 'read': {
            const collection = parsed.args[0];
            const identifier = parsed.args[1];
            if (!collection || !identifier) {
              printError('Usage: pith content read <collection> <identifier>');
              process.exitCode = 2;
              return;
            }
            await contentReadCommand(collection, identifier, jsonMode, configPath);
            break;
          }
          default: {
            printError(`Unknown content subcommand: ${parsed.subcommand ?? '(none)'}`);
            printLine('Usage: pith content <check|list|read>');
            process.exitCode = 2;
            return;
          }
        }
        break;
      }

      case 'doctor': {
        await doctorCommand(jsonMode);
        break;
      }

      case 'auth': {
        switch (parsed.subcommand) {
          case 'hash-password': {
            await hashPasswordCommand(jsonMode);
            break;
          }
          case 'generate-secret': {
            generateSecretCommand(jsonMode);
            break;
          }
          default: {
            printError(`Unknown auth subcommand: ${parsed.subcommand ?? '(none)'}`);
            printLine('Usage: pith auth <hash-password|generate-secret>');
            process.exitCode = 2;
            return;
          }
        }
        break;
      }

      default: {
        printError(`Unknown command: ${parsed.command}`);
        printLine('Run pith --help for usage information.');
        process.exitCode = 2;
      }
    }
  } catch (error) {
    if (jsonMode) {
      printLine(
        JSON.stringify({
          ok: false,
          error: {
            code: 'UNEXPECTED_ERROR',
            message: (error as Error).message,
          },
        }),
      );
    } else {
      printError((error as Error).message);
    }
    if (!process.exitCode) {
      process.exitCode = 1;
    }
  }
}

main();
