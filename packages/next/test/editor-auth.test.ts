import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createPasswordAuth, hashPassword } from '../src/editor-auth.js';

const sessionSecret = 'a secure test session secret that is longer than thirty two characters';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword('correct-password');
});

describe('createPasswordAuth', () => {
  it('verifies a password hash emitted by the bootstrap command format', async () => {
    const auth = createPasswordAuth({
      passwordHash:
        '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
      sessionSecret,
      secure: false,
    });

    await expect(
      auth.authenticate({ password: 'pith-e2e-password', request: editorRequest() }),
    ).resolves.toMatchObject({
      id: 'pith-password-user',
    });
  });

  it('verifies Argon2id passwords and creates secure, rotated sessions', async () => {
    const auth = createPasswordAuth({ passwordHash, sessionSecret, secure: true });
    const request = editorRequest();
    const user = await auth.authenticate({ password: 'correct-password', request });
    const invalid = await auth.authenticate({ password: 'wrong-password', request });

    expect(user?.permissions).toContain('content:update');
    expect(invalid).toBeNull();

    const first = await auth.createSession(user!);
    const second = await auth.createSession(user!);

    expect(first.id).not.toBe(second.id);
    expect(first.cookie).toContain('HttpOnly');
    expect(first.cookie).toContain('SameSite=Lax');
    expect(first.cookie).toContain('Secure');
    expect(first.cookie).toContain('Path=/');
    expect(first.cookie).not.toContain('correct-password');
    expect(first.cookie).not.toContain(passwordHash);

    const sessionRequest = editorRequest(first.cookie);
    const session = await auth.readSession(sessionRequest);
    const csrf = await auth.createCsrfToken({
      request: sessionRequest,
      session: session!,
      purpose: 'mutation',
    });

    expect(session?.user.id).toBe('pith-password-user');
    await expect(
      auth.validateCsrfToken({
        request: sessionRequest,
        session: session!,
        purpose: 'mutation',
        token: csrf.token,
      }),
    ).resolves.toBe(true);
    await expect(
      auth.validateCsrfToken({
        request: sessionRequest,
        session: session!,
        purpose: 'mutation',
        token: 'tampered',
      }),
    ).resolves.toBe(false);
    await expect(
      auth.readSession(editorRequest(`${cookiePair(first.cookie)}tampered`)),
    ).resolves.toBeNull();
  });

  it('accepts dollar-delimited hashes escaped for a Next.js .env file', async () => {
    const auth = createPasswordAuth({
      passwordHash: passwordHash.replaceAll('$', '\\$'),
      sessionSecret,
      secure: false,
    });

    await expect(
      auth.authenticate({ password: 'correct-password', request: editorRequest() }),
    ).resolves.toMatchObject({ id: 'pith-password-user' });
  });

  it('binds login CSRF challenges to a protected cookie and invalidates logout sessions', async () => {
    const auth = createPasswordAuth({ passwordHash, sessionSecret, secure: false });
    const challenge = await auth.createCsrfToken({ request: editorRequest(), purpose: 'login' });
    const challengeRequest = editorRequest(challenge.cookie!);

    await expect(
      auth.validateCsrfToken({
        request: challengeRequest,
        purpose: 'login',
        token: challenge.token,
      }),
    ).resolves.toBe(true);
    await expect(
      auth.validateCsrfToken({
        request: editorRequest(),
        purpose: 'login',
        token: challenge.token,
      }),
    ).resolves.toBe(false);

    const user = await auth.authenticate({
      password: 'correct-password',
      request: editorRequest(),
    });
    const session = await auth.createSession(user!);
    const sessionRequest = editorRequest(session.cookie);
    const deletion = await auth.destroySession(sessionRequest);

    expect(deletion.cookie).toContain('Max-Age=0');
    await expect(auth.readSession(sessionRequest)).resolves.toBeNull();
  });

  it('expires sessions and rate-limits repeated failures within one process', async () => {
    vi.useFakeTimers();
    const auth = createPasswordAuth({
      passwordHash,
      sessionSecret,
      secure: false,
      sessionDurationSeconds: 1,
      rateLimit: { maxFailures: 2, lockoutSeconds: 60 },
    });
    const request = editorRequest();
    const user = await auth.authenticate({ password: 'correct-password', request });
    const session = await auth.createSession(user!);

    vi.advanceTimersByTime(1001);
    await expect(auth.readSession(editorRequest(session.cookie))).resolves.toBeNull();

    await expect(auth.authenticate({ password: 'wrong', request })).resolves.toBeNull();
    await expect(auth.authenticate({ password: 'wrong', request })).resolves.toBeNull();
    await expect(auth.authenticate({ password: 'correct-password', request })).resolves.toBeNull();
    vi.useRealTimers();
  });
});

function editorRequest(cookie?: string): Request {
  return new Request('http://pith.test/api/pith/login', {
    headers: {
      origin: 'http://pith.test',
      ...(cookie === undefined ? {} : { cookie: cookiePair(cookie) }),
    },
  });
}

function cookiePair(cookie: string): string {
  return cookie.split(';')[0] ?? '';
}
