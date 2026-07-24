import type { PithEditorOptions } from './editor-types.js';
import { OriginValidationError, RequestValidationError } from './editor-errors.js';

export const EDITOR_JSON_LIMIT_BYTES = 1024 * 1024;
export const EDITOR_MARKDOWN_LIMIT_BYTES = 2 * 1024 * 1024;

export function validateEditorPath(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('?') ||
    value.includes('#')
  ) {
    throw new RequestValidationError(`${label} must be an absolute application path.`);
  }

  if (value.includes('\\') || value.includes('//')) {
    throw new RequestValidationError(`${label} must use a normalized application path.`);
  }

  return value === '/' ? value : value.replace(/\/$/, '');
}

export function validateTrustedOrigins(origins: readonly string[] | undefined): readonly string[] {
  if (!origins) {
    return [];
  }

  return Object.freeze(
    origins.map((origin) => {
      if (typeof origin !== 'string' || origin.includes('*')) {
        throw new RequestValidationError('trustedOrigins must contain explicit origins only.');
      }

      let parsed: URL;

      try {
        parsed = new URL(origin);
      } catch {
        throw new RequestValidationError('trustedOrigins must contain valid origins.');
      }

      if (
        (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        parsed.origin !== origin
      ) {
        throw new RequestValidationError('trustedOrigins must contain normalized HTTP(S) origins.');
      }

      return origin;
    }),
  );
}

export function assertMutationOrigin(request: Request, options: PithEditorOptions): void {
  const requestOrigin = new URL(request.url).origin;
  const acceptedOrigins = new Set([
    requestOrigin,
    ...validateTrustedOrigins(options.trustedOrigins),
  ]);
  const origin = request.headers.get('origin');

  if (origin) {
    if (!acceptedOrigins.has(origin)) {
      throw new OriginValidationError();
    }

    return;
  }

  const referer = request.headers.get('referer');

  if (!referer) {
    throw new OriginValidationError('Editor mutations require an Origin or Referer header.');
  }

  try {
    if (!acceptedOrigins.has(new URL(referer).origin)) {
      throw new OriginValidationError();
    }
  } catch (error) {
    if (error instanceof OriginValidationError) {
      throw error;
    }

    throw new OriginValidationError();
  }
}

export function assertContentType(request: Request, accepted: readonly string[]): void {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (!contentType || !accepted.includes(contentType)) {
    throw new RequestValidationError('The editor request has an unsupported content type.');
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  return (await readJsonBodyWithSize(request, maxBytes)).value;
}

export async function readJsonBodyWithSize(
  request: Request,
  maxBytes: number,
): Promise<{ readonly value: unknown; readonly byteLength: number }> {
  const declaredLength = request.headers.get('content-length');

  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new RequestValidationError('The editor request body is too large.');
  }

  const body = await request.text();

  const byteLength = new TextEncoder().encode(body).byteLength;

  if (byteLength > maxBytes) {
    throw new RequestValidationError('The editor request body is too large.');
  }

  try {
    return { value: JSON.parse(body) as unknown, byteLength };
  } catch {
    throw new RequestValidationError('The editor request body must be valid JSON.');
  }
}

export async function readLoginBody(
  request: Request,
): Promise<{ password: string; csrfToken: string }> {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (contentType === 'application/json') {
    const value = await readJsonBody(request, EDITOR_JSON_LIMIT_BYTES);
    return parseLoginBody(value);
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    const declaredLength = request.headers.get('content-length');

    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > EDITOR_JSON_LIMIT_BYTES)
    ) {
      throw new RequestValidationError('The login request body is too large.');
    }

    const formData = await request.formData();
    return parseLoginBody({
      password: formData.get('password'),
      csrfToken: formData.get('csrfToken'),
    });
  }

  throw new RequestValidationError('The login request has an unsupported content type.');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getSafeReturnPath(value: string | null, editorBasePath: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return editorBasePath;
  }

  try {
    const decoded = decodeURIComponent(value);

    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) {
      return editorBasePath;
    }

    return decoded;
  } catch {
    return editorBasePath;
  }
}

function parseLoginBody(value: unknown): { password: string; csrfToken: string } {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'password' && key !== 'csrfToken')
  ) {
    throw new RequestValidationError('The login request contains unexpected fields.');
  }

  if (typeof value.password !== 'string' || typeof value.csrfToken !== 'string') {
    throw new RequestValidationError('The login request is invalid.');
  }

  return { password: value.password, csrfToken: value.csrfToken };
}
