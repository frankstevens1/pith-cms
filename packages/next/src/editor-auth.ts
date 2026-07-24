import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  argon2,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { ConfigurationError } from '@pith-cms/core';

import { hashPassword as generateHash } from './password.js';

import type {
  PithAuthAdapter,
  PithAuthorizedUser,
  PithCsrfToken,
  PithPermission,
  PithSession,
  PithSessionDeletion,
  PasswordAuthOptions,
} from './editor-types.js';

interface EncryptedSessionPayload {
  readonly id: string;
  readonly user: PithAuthorizedUser;
  readonly expiresAt: number;
  readonly csrfSecret: string;
}

interface LoginChallengePayload {
  readonly nonce: string;
  readonly expiresAt: number;
}

interface RateLimitState {
  readonly failures: number;
  readonly lockedUntil: number;
}

const PASSWORD_USER: PithAuthorizedUser = Object.freeze({
  id: 'pith-password-user',
  displayName: 'Pith editor',
  permissions: Object.freeze([
    'content:read',
    'content:create',
    'content:update',
    'content:delete',
  ] satisfies readonly PithPermission[]),
});

const SESSION_VERSION = 'v1';
const LOGIN_CHALLENGE_DURATION_SECONDS = 10 * 60;

/**
 * Creates the self-contained password adapter for single-instance Pith
 * deployments. It deliberately accepts only an Argon2id hash, never a
 * plaintext configured password.
 */
export function createPasswordAuth(options: PasswordAuthOptions): PithAuthAdapter {
  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('Password authentication requires an options object.');
  }

  const passwordHash = normalizePasswordHash(options.passwordHash);
  validateOptions(options, passwordHash);

  const encryptionKey = createHash('sha256').update(options.sessionSecret).digest();
  const tokenKey = createHash('sha256').update(`${options.sessionSecret}:csrf`).digest();
  const rateLimitKey = createHash('sha256').update(`${options.sessionSecret}:rate-limit`).digest();
  const durationSeconds = options.sessionDurationSeconds ?? 60 * 60 * 8;
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const cookieName = options.cookieName ?? (secure ? '__Host-pith_session' : '__pith_session');
  const loginCookieName = `${cookieName}_login_csrf`;
  const maxFailures = options.rateLimit?.maxFailures ?? 5;
  const lockoutSeconds = options.rateLimit?.lockoutSeconds ?? 5 * 60;
  const attempts = new Map<string, RateLimitState>();
  const revokedSessions = new Map<string, number>();

  function clearExpiredState(now = Date.now()): void {
    for (const [key, state] of attempts) {
      if (state.lockedUntil <= now && state.failures === 0) {
        attempts.delete(key);
      }
    }

    for (const [sessionId, expiresAt] of revokedSessions) {
      if (expiresAt <= now) {
        revokedSessions.delete(sessionId);
      }
    }
  }

  function sessionCookie(payload: EncryptedSessionPayload): string {
    return serializeCookie(cookieName, encrypt(encryptionKey, payload), {
      httpOnly: true,
      maxAge: Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000)),
      secure,
    });
  }

  async function readSession(request: Request): Promise<PithSession | null> {
    clearExpiredState();
    const encoded = readCookie(request, cookieName);

    if (!encoded) {
      return null;
    }

    const payload = decrypt<EncryptedSessionPayload>(encryptionKey, encoded);

    if (
      !payload ||
      typeof payload.id !== 'string' ||
      !isAuthorizedUser(payload.user) ||
      typeof payload.expiresAt !== 'number' ||
      typeof payload.csrfSecret !== 'string' ||
      payload.expiresAt <= Date.now() ||
      revokedSessions.has(payload.id)
    ) {
      return null;
    }

    return {
      id: payload.id,
      user: payload.user,
      expiresAt: new Date(payload.expiresAt).toISOString(),
      csrfSecret: payload.csrfSecret,
    };
  }

  return {
    async authenticate({ password, request }) {
      const key = requestRateLimitKey(request, rateLimitKey);
      const now = Date.now();
      const previous = attempts.get(key);

      if (previous && previous.lockedUntil > now) {
        return null;
      }

      const valid = await verifyArgon2idHash(passwordHash, password).catch(() => false);

      if (valid) {
        attempts.delete(key);
        return PASSWORD_USER;
      }

      const failures = (previous?.failures ?? 0) + 1;
      const lockedUntil = failures >= maxFailures ? now + lockoutSeconds * 1000 : 0;
      attempts.set(key, { failures: lockedUntil ? 0 : failures, lockedUntil });
      return null;
    },

    async authorize({ request, permission }) {
      const session = await readSession(request);

      if (!session) {
        return null;
      }

      if (permission && !session.user.permissions.includes(permission)) {
        return null;
      }

      return session.user;
    },

    async createSession(user) {
      const expiresAt = Date.now() + durationSeconds * 1000;
      const payload: EncryptedSessionPayload = {
        id: randomToken(24),
        user: freezeUser(user),
        expiresAt,
        csrfSecret: randomToken(32),
      };

      return {
        id: payload.id,
        user: payload.user,
        expiresAt: new Date(payload.expiresAt).toISOString(),
        csrfSecret: payload.csrfSecret,
        cookie: sessionCookie(payload),
      };
    },

    readSession,

    async destroySession(request): Promise<PithSessionDeletion> {
      const session = await readSession(request);

      if (session) {
        revokedSessions.set(session.id, Date.parse(session.expiresAt));
      }

      return {
        cookie: serializeCookie(cookieName, '', {
          httpOnly: true,
          maxAge: 0,
          secure,
        }),
      };
    },

    async createCsrfToken({ session, purpose }): Promise<PithCsrfToken> {
      if (purpose === 'mutation') {
        if (!session) {
          throw new ConfigurationError('A session is required to create a mutation CSRF token.');
        }

        return {
          token: signToken(tokenKey, `${session.id}:${session.csrfSecret}:${session.expiresAt}`),
        };
      }

      const challenge: LoginChallengePayload = {
        nonce: randomToken(24),
        expiresAt: Date.now() + LOGIN_CHALLENGE_DURATION_SECONDS * 1000,
      };

      return {
        token: signToken(tokenKey, `${challenge.nonce}:${challenge.expiresAt}`),
        cookie: serializeCookie(loginCookieName, encrypt(encryptionKey, challenge), {
          httpOnly: true,
          maxAge: LOGIN_CHALLENGE_DURATION_SECONDS,
          secure,
        }),
      };
    },

    async validateCsrfToken({ request, session, purpose, token }): Promise<boolean> {
      if (purpose === 'mutation') {
        if (!session) {
          return false;
        }

        return safeEqual(
          token,
          signToken(tokenKey, `${session.id}:${session.csrfSecret}:${session.expiresAt}`),
        );
      }

      const encoded = readCookie(request, loginCookieName);
      const challenge = encoded ? decrypt<LoginChallengePayload>(encryptionKey, encoded) : null;

      if (!challenge || typeof challenge.nonce !== 'string' || challenge.expiresAt <= Date.now()) {
        return false;
      }

      return safeEqual(token, signToken(tokenKey, `${challenge.nonce}:${challenge.expiresAt}`));
    },
  };
}

export const hashPassword = generateHash;

function validateOptions(options: PasswordAuthOptions, passwordHash: string): void {
  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('Password authentication requires an options object.');
  }

  if (typeof passwordHash !== 'string' || !passwordHash.startsWith('$argon2id$')) {
    throw new ConfigurationError(
      'Password authentication requires a precomputed Argon2id password hash.',
    );
  }

  if (typeof options.sessionSecret !== 'string' || options.sessionSecret.length < 32) {
    throw new ConfigurationError(
      'Password authentication requires a session secret of at least 32 characters.',
    );
  }

  if (
    options.sessionDurationSeconds !== undefined &&
    (!Number.isInteger(options.sessionDurationSeconds) || options.sessionDurationSeconds <= 0)
  ) {
    throw new ConfigurationError('sessionDurationSeconds must be a positive integer.');
  }

  if (
    options.cookieName !== undefined &&
    !/^(?:__Host-)?[A-Za-z0-9_-]+$/.test(options.cookieName)
  ) {
    throw new ConfigurationError(
      'Password authentication cookieName contains unsupported characters.',
    );
  }

  if (options.rateLimit?.maxFailures !== undefined && options.rateLimit.maxFailures < 1) {
    throw new ConfigurationError('Password authentication maxFailures must be at least one.');
  }

  if (options.rateLimit?.lockoutSeconds !== undefined && options.rateLimit.lockoutSeconds < 1) {
    throw new ConfigurationError('Password authentication lockoutSeconds must be at least one.');
  }
}

function normalizePasswordHash(value: string): string {
  return typeof value === 'string' ? value.replaceAll('\\$', '$') : value;
}

async function verifyArgon2idHash(hash: string, password: string): Promise<boolean> {
  const parsed = parseArgon2idHash(hash);

  if (!parsed) {
    return false;
  }

  const derivedKey = await deriveArgon2id(
    password,
    parsed.nonce,
    parsed.memory,
    parsed.passes,
    parsed.parallelism,
    parsed.digest.length,
  );
  return safeBufferEqual(derivedKey, parsed.digest);
}

function parseArgon2idHash(hash: string): {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly nonce: Buffer;
  readonly digest: Buffer;
} | null {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(hash);

  if (!match) {
    return null;
  }

  const [, memoryValue, passesValue, parallelismValue, encodedNonce, encodedDigest] = match;

  if (
    memoryValue === undefined ||
    passesValue === undefined ||
    parallelismValue === undefined ||
    encodedNonce === undefined ||
    encodedDigest === undefined
  ) {
    return null;
  }

  const memory = Number(memoryValue);
  const passes = Number(passesValue);
  const parallelism = Number(parallelismValue);

  if (
    !Number.isSafeInteger(memory) ||
    !Number.isSafeInteger(passes) ||
    !Number.isSafeInteger(parallelism) ||
    memory < parallelism * 8 ||
    passes < 2 ||
    parallelism < 1
  ) {
    return null;
  }

  try {
    const nonce = Buffer.from(encodedNonce, 'base64');
    const digest = Buffer.from(encodedDigest, 'base64');

    return nonce.length >= 16 && digest.length >= 16
      ? { memory, passes, parallelism, nonce, digest }
      : null;
  } catch {
    return null;
  }
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

function encrypt(key: Uint8Array, payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SESSION_VERSION}.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString(
    'base64url',
  )}`;
}

function decrypt<TValue>(key: Uint8Array, token: string): TValue | null {
  const [version, encodedIv, encodedTag, encodedPayload, ...extra] = token.split('.');

  if (
    version !== SESSION_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedPayload ||
    extra.length > 0
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const value = Buffer.concat([
      decipher.update(Buffer.from(encodedPayload, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(value) as TValue;
  } catch {
    return null;
  }
}

function serializeCookie(
  name: string,
  value: string,
  options: { readonly httpOnly: boolean; readonly maxAge: number; readonly secure: boolean },
): string {
  const attributes = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${options.maxAge}`,
    `Expires=${new Date(Date.now() + Math.max(0, options.maxAge) * 1000).toUTCString()}`,
    'SameSite=Lax',
  ];

  if (options.httpOnly) {
    attributes.push('HttpOnly');
  }

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');

  if (!header) {
    return null;
  }

  for (const item of header.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');

    if (rawName === name) {
      return rawValue.join('=') || null;
    }
  }

  return null;
}

function requestRateLimitKey(request: Request, key: Uint8Array): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const userAgent = request.headers.get('user-agent') ?? '';
  return createHmac('sha256', key).update(`${forwardedFor}:${userAgent}`).digest('base64url');
}

function signToken(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

function randomToken(size: number): string {
  return randomBytes(size).toString('base64url');
}

function safeEqual(left: string, right: string): boolean {
  return safeBufferEqual(Buffer.from(left), Buffer.from(right));
}

function safeBufferEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorizedUser(value: unknown): value is PithAuthorizedUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as PithAuthorizedUser;
  return (
    typeof user.id === 'string' &&
    (user.displayName === undefined || typeof user.displayName === 'string') &&
    Array.isArray(user.permissions) &&
    user.permissions.every(isPermission)
  );
}

function isPermission(value: unknown): value is PithPermission {
  return (
    value === 'content:read' ||
    value === 'content:create' ||
    value === 'content:update' ||
    value === 'content:delete'
  );
}

function freezeUser(user: PithAuthorizedUser): PithAuthorizedUser {
  return Object.freeze({
    id: user.id,
    ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
    permissions: Object.freeze([...user.permissions]),
  });
}
