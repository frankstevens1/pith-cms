import { describe, it, expect } from 'vitest';
import { hashPassword } from '@pith-cms/next/password';
import { createPasswordAuth } from '@pith-cms/next/server';

describe('password hash compatibility', () => {
  it('generates a valid PHC Argon2id hash', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
  });

  it('produces hashes verifiable by createPasswordAuth', async () => {
    const password = 'my-secret-editor-password';
    const hash = await hashPassword(password);
    const secret = 'a'.repeat(32);

    const auth = createPasswordAuth({
      passwordHash: hash,
      sessionSecret: secret,
      secure: false,
    });

    expect(typeof auth.authenticate).toBe('function');

    const taintedHash = hash.replace('$', '\\$');
    const authTainted = createPasswordAuth({
      passwordHash: taintedHash,
      sessionSecret: secret,
      secure: false,
    });

    expect(typeof authTainted.authenticate).toBe('function');
  });

  it('throws on empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow('A non-empty password is required.');
  });
});
