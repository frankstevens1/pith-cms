import { argon2, randomBytes } from 'node:crypto';

import { ConfigurationError } from '@pith-cms/core';

function toPhcBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64').replace(/=+$/, '');
}

async function deriveArgon2id(
  password: string,
  nonce: Uint8Array,
  memory: number,
  passes: number,
  parallelism: number,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce,
        memory,
        passes,
        parallelism,
        tagLength,
      },
      (error, derivedKey) => (error ? reject(error) : resolve(Buffer.from(derivedKey))),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new ConfigurationError('A non-empty password is required.');
  }

  const memory = 65536;
  const passes = 3;
  const parallelism = 4;
  const nonce = randomBytes(16);
  const derivedKey = await deriveArgon2id(password, nonce, memory, passes, parallelism, 32);
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${toPhcBase64(nonce)}$${toPhcBase64(
    derivedKey,
  )}`;
}

export function normalizePasswordHash(value: string): string {
  return typeof value === 'string' ? value.replaceAll('\\$', '$') : value;
}
