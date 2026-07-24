export { createGitHubRepository } from './repository.js';
export {
  GitHubApiError,
  GitHubAuthenticationError,
  GitHubAuthorizationError,
  GitHubBranchNotFoundError,
  GitHubBranchProtectionError,
  GitHubPullRequestError,
  GitHubRateLimitError,
  GitHubRepositoryNotFoundError,
} from './errors.js';
export type {
  GitHubAuthOptions,
  GitHubCommitAuthor,
  GitHubConnectionResult,
  GitHubContentRepository,
  GitHubDeleteFileResult,
  GitHubPublishingOptions,
  GitHubPublishingResult,
  GitHubPublicationReference,
  GitHubPublicationStatus,
  GitHubRepositoryOptions,
  GitHubTransport,
  GitHubTransportRequest,
  GitHubWriteFileResult,
} from './types.js';

/** The package version marker also serves external integration smoke tests. */
export const githubStorageVersion = '0.1.0';
