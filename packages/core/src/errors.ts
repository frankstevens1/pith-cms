export type PithErrorMetadata = Readonly<Record<string, unknown>>;

export class PithError extends Error {
  readonly code: string;
  readonly metadata: PithErrorMetadata | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      cause?: unknown;
      metadata?: PithErrorMetadata;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.metadata = options.metadata;
  }
}

export class ConfigurationError extends PithError {
  constructor(message: string, options: { cause?: unknown; metadata?: PithErrorMetadata } = {}) {
    super('CONFIGURATION_ERROR', message, options);
  }
}

export class ContentPathError extends PithError {
  constructor(message: string, options: { cause?: unknown; metadata?: PithErrorMetadata } = {}) {
    super('CONTENT_PATH_ERROR', message, options);
  }
}

export class ContentParseError extends PithError {
  constructor(message: string, options: { cause?: unknown; metadata?: PithErrorMetadata } = {}) {
    super('CONTENT_PARSE_ERROR', message, options);
  }
}

export class ContentNotFoundError extends PithError {
  constructor(
    message = 'The requested content entry was not found.',
    options: {
      cause?: unknown;
      metadata?: PithErrorMetadata;
    } = {},
  ) {
    super('CONTENT_NOT_FOUND', message, options);
  }
}

export class ContentAlreadyExistsError extends PithError {
  constructor(
    message = 'The requested content entry already exists.',
    options: { cause?: unknown; metadata?: PithErrorMetadata } = {},
  ) {
    super('CONTENT_ALREADY_EXISTS', message, options);
  }
}

export class ContentValidationError extends PithError {
  readonly errors: readonly ValidationErrorDetail[];

  constructor(
    message: string,
    errors: readonly ValidationErrorDetail[],
    options: { cause?: unknown; metadata?: PithErrorMetadata } = {},
  ) {
    super('CONTENT_VALIDATION_ERROR', message, options);
    this.errors = errors;
  }
}

export class UnsupportedFormatError extends PithError {
  constructor(message: string, options: { cause?: unknown; metadata?: PithErrorMetadata } = {}) {
    super('UNSUPPORTED_FORMAT', message, options);
  }
}

export class RepositoryError extends PithError {
  constructor(message: string, options: { cause?: unknown; metadata?: PithErrorMetadata } = {}) {
    super('REPOSITORY_ERROR', message, options);
  }
}

export class RepositoryConflictError extends PithError {
  constructor(
    message = 'The content changed before this operation could be completed.',
    options: { cause?: unknown; metadata?: PithErrorMetadata } = {},
  ) {
    super('REPOSITORY_CONFLICT', message, options);
  }
}

export class RepositoryNotFoundError extends PithError {
  constructor(
    message = 'The requested repository file was not found.',
    options: { cause?: unknown; metadata?: PithErrorMetadata } = {},
  ) {
    super('REPOSITORY_NOT_FOUND', message, options);
  }
}

export interface ValidationErrorDetail {
  readonly code: string;
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}
