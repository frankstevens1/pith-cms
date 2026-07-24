import type {
  ContentRepository,
  DeleteFileResult,
  RepositoryPublication,
  RepositoryPublicationReference,
  RepositoryPublicationStatus,
  RepositoryPublicationStatusReader,
  RepositoryRefReader,
  WriteFileResult,
} from '@pith-cms/core';

export type GitHubAuthOptions =
  | {
      readonly token: string;
    }
  | {
      readonly app: {
        readonly appId: string;
        readonly privateKey: string;
        readonly installationId: string;
      };
    };

export type GitHubPublishingOptions =
  | {
      readonly mode: 'direct';
    }
  | {
      readonly mode: 'pull-request';
      readonly branchPrefix?: string;
      readonly baseBranch?: string;
      readonly draft?: boolean;
    };

export interface GitHubCommitAuthor {
  readonly name: string;
  readonly email: string;
}

/** A small injectable seam for deterministic tests and GitHub Enterprise proxies. */
export interface GitHubTransportRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type GitHubTransport = (request: GitHubTransportRequest) => Promise<Response>;

export interface GitHubRepositoryOptions {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly auth: GitHubAuthOptions;
  readonly publishing?: GitHubPublishingOptions;
  readonly apiBaseUrl?: string;
  readonly commitAuthor?: GitHubCommitAuthor;
  /** Advanced/testing-only HTTP transport. The default uses the platform fetch implementation. */
  readonly transport?: GitHubTransport;
}

export interface GitHubPublishingResult extends RepositoryPublication {
  readonly provider: 'github';
  readonly mode: 'direct' | 'pull-request';
  readonly branch: string;
  readonly commitSha: string;
  readonly commitUrl?: string;
  readonly reviewNumber?: number;
  readonly reviewUrl?: string;
}

export interface GitHubWriteFileResult extends WriteFileResult {
  readonly provider: 'github';
  readonly publication: GitHubPublishingResult;
}

export interface GitHubDeleteFileResult extends DeleteFileResult {
  readonly provider: 'github';
  readonly publication: GitHubPublishingResult;
}

export interface GitHubConnectionResult {
  readonly repository: string;
  readonly branch: string;
  readonly authenticatedAs?: string;
  readonly publishingMode: 'direct' | 'pull-request';
  readonly canRead: true;
  /** This is inferred from configured mode and a successful read, not a permission audit. */
  readonly canWrite: boolean;
  readonly canCreatePullRequests: boolean;
}

export interface GitHubContentRepository
  extends ContentRepository, RepositoryRefReader, RepositoryPublicationStatusReader {
  readonly provider: 'github';
  verifyConnection(): Promise<GitHubConnectionResult>;
}

export interface GitHubPublicationReference extends RepositoryPublicationReference {
  readonly provider: 'github';
  readonly mode: 'direct' | 'pull-request';
}

export type GitHubPublicationStatus = RepositoryPublicationStatus;
