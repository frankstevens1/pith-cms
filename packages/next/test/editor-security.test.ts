import { describe, expect, it } from 'vitest';

import { OriginValidationError, RequestValidationError } from '../src/editor-errors.js';
import {
  EDITOR_JSON_LIMIT_BYTES,
  assertMutationOrigin,
  getSafeReturnPath,
  readJsonBody,
  validateEditorPath,
} from '../src/editor-security.js';

describe('editor request security', () => {
  it('accepts only local return paths', () => {
    expect(getSafeReturnPath('/pith/collections/posts', '/pith')).toBe('/pith/collections/posts');
    expect(getSafeReturnPath('https://attacker.test', '/pith')).toBe('/pith');
    expect(getSafeReturnPath('//attacker.test', '/pith')).toBe('/pith');
    expect(getSafeReturnPath('/%2F%2Fattacker.test', '/pith')).toBe('/pith');
    expect(getSafeReturnPath('/\\attacker.test', '/pith')).toBe('/pith');
  });

  it('requires normalized editor paths and a same or trusted origin for mutations', () => {
    expect(validateEditorPath('/pith/', 'editor.basePath')).toBe('/pith');
    expect(() => validateEditorPath('/pith?next=/x', 'editor.basePath')).toThrow(
      RequestValidationError,
    );

    expect(() =>
      assertMutationOrigin(
        new Request('https://example.com/api/pith', {
          headers: { origin: 'https://example.com' },
        }),
        { trustedOrigins: ['https://admin.example.com'] },
      ),
    ).not.toThrow();
    expect(() =>
      assertMutationOrigin(
        new Request('https://example.com/api/pith', {
          headers: { origin: 'https://attacker.test' },
        }),
        {},
      ),
    ).toThrow(OriginValidationError);
    expect(() => assertMutationOrigin(new Request('https://example.com/api/pith'), {})).toThrow(
      OriginValidationError,
    );
  });

  it('rejects oversized JSON payloads before parsing', async () => {
    const request = new Request('https://example.com/api/pith', {
      method: 'POST',
      headers: {
        'content-length': String(EDITOR_JSON_LIMIT_BYTES + 1),
        'content-type': 'application/json',
      },
      body: '{}',
    });

    await expect(readJsonBody(request, EDITOR_JSON_LIMIT_BYTES)).rejects.toBeInstanceOf(
      RequestValidationError,
    );
  });
});
