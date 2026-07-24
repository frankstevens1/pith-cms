import { PithError } from '@pith-cms/core';

export class GitHubAuthenticationError extends PithError {
  constructor(message = 'GitHub authentication failed.', options: { cause?: unknown } = {}) {
    super('GITHUB_AUTHENTICATION_FAILED', message, options);
  }
}

export class GitHubAuthorizationError extends PithError {
  constructor(
    message = 'GitHub denied access to this repository operation.',
    options: { cause?: unknown } = {},
  ) {
    super('GITHUB_AUTHORIZATION_FAILED', message, options);
  }
}

export class GitHubRepositoryNotFoundError extends PithError {
  constructor(
    message = 'The configured GitHub repository was not found.',
    options: { cause?: unknown } = {},
  ) {
    super('GITHUB_REPOSITORY_NOT_FOUND', message, options);
  }
}

export class GitHubBranchNotFoundError extends PithError {
  constructor(
    message = 'The configured GitHub branch was not found.',
    options: { cause?: unknown } = {},
  ) {
    super('GITHUB_BRANCH_NOT_FOUND', message, options);
  }
}

export class GitHubBranchProtectionError extends PithError {
  constructor(options: { cause?: unknown } = {}) {
    super(
      'GITHUB_BRANCH_PROTECTED',
      'Direct publishing to this branch is not permitted. Configure pull-request publishing or update GitHub permissions.',
      options,
    );
  }
}

export class GitHubRateLimitError extends PithError {
  constructor(options: { retryAfter?: number; resetAt?: string; cause?: unknown } = {}) {
    super('GITHUB_RATE_LIMITED', 'GitHub rate limited this repository operation.', {
      cause: options.cause,
      metadata: {
        ...(options.retryAfter === undefined ? {} : { retryAfter: options.retryAfter }),
        ...(options.resetAt === undefined ? {} : { resetAt: options.resetAt }),
      },
    });
  }
}

export class GitHubApiError extends PithError {
  constructor(
    message = 'GitHub could not complete the repository operation.',
    options: { cause?: unknown } = {},
  ) {
    super('GITHUB_API_ERROR', message, options);
  }
}

export class GitHubPullRequestError extends PithError {
  constructor(
    message = 'GitHub could not create the Pith pull request.',
    options: { cause?: unknown } = {},
  ) {
    super('GITHUB_PULL_REQUEST_FAILED', message, options);
  }
}
