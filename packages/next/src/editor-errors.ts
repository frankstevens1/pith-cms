export class PithEditorError extends Error {
  readonly code: string;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      readonly metadata?: Readonly<Record<string, unknown>>;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.metadata = options.metadata;
  }
}

export class AuthenticationError extends PithEditorError {
  constructor(message = 'Authentication is required.') {
    super('AUTHENTICATION_ERROR', message);
  }
}

export class AuthorizationError extends PithEditorError {
  constructor(message = 'You are not authorized to perform this operation.') {
    super('AUTHORIZATION_ERROR', message);
  }
}

export class CsrfValidationError extends PithEditorError {
  constructor(message = 'The form could not be verified. Refresh the page and try again.') {
    super('CSRF_VALIDATION_ERROR', message);
  }
}

export class OriginValidationError extends PithEditorError {
  constructor(message = 'Cross-origin editor mutations are not allowed.') {
    super('ORIGIN_VALIDATION_ERROR', message);
  }
}

export class RequestValidationError extends PithEditorError {
  constructor(message = 'The editor request is invalid.') {
    super('REQUEST_VALIDATION_ERROR', message);
  }
}
