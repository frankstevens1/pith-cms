export interface ContentRepository {
  read(path: string): Promise<RepositoryFile | null>;
  list(directory: string): Promise<RepositoryFileSummary[]>;
  write(input: WriteFileInput): Promise<WriteFileResult>;
  delete(input: DeleteFileInput): Promise<DeleteFileResult>;
}

/**
 * Optional capability for repositories that can read a stable, provider-defined
 * reference without changing their configured canonical source.
 */
export interface RepositoryRefReader {
  readAtRef(path: string, ref: string): Promise<RepositoryFile | null>;
  listAtRef(directory: string, ref: string): Promise<RepositoryFileSummary[]>;
}

/** Safe, portable reference to repository publication metadata. */
export interface RepositoryPublicationReference {
  readonly provider: string;
  readonly mode: string;
  readonly branch?: string;
  readonly commitSha?: string;
  readonly reviewNumber?: number;
}

/** Repository publication state, deliberately separate from deployment state. */
export type RepositoryPublicationStatus =
  | { readonly state: 'committed' }
  | { readonly state: 'review-open' }
  | { readonly state: 'review-merged'; readonly mergedAt?: string }
  | { readonly state: 'review-closed'; readonly closedAt?: string }
  | { readonly state: 'unknown' };

/** Optional capability for provider-backed publication state refreshes. */
export interface RepositoryPublicationStatusReader {
  getPublicationStatus(
    publication: RepositoryPublicationReference,
  ): Promise<RepositoryPublicationStatus>;
}

export function supportsRepositoryRefs(
  repository: ContentRepository,
): repository is ContentRepository & RepositoryRefReader {
  return (
    typeof (repository as Partial<RepositoryRefReader>).readAtRef === 'function' &&
    typeof (repository as Partial<RepositoryRefReader>).listAtRef === 'function'
  );
}

export function supportsPublicationStatus(
  repository: ContentRepository,
): repository is ContentRepository & RepositoryPublicationStatusReader {
  return (
    typeof (repository as Partial<RepositoryPublicationStatusReader>).getPublicationStatus ===
    'function'
  );
}

export interface RepositoryFile {
  readonly path: string;
  readonly content: string;
  readonly revision: string;
  readonly updatedAt?: string;
}

export interface RepositoryFileSummary {
  readonly path: string;
  readonly revision: string;
  readonly updatedAt?: string;
}

export interface WriteFileInput {
  readonly path: string;
  readonly content: string;
  readonly expectedRevision?: string;
  /** Reject the write when a regular file already occupies the logical path. */
  readonly createOnly?: boolean;
  readonly message: string;
}

export interface WriteFileResult {
  readonly path: string;
  readonly revision: string;
  /** Optional provider publication information. Generic consumers may ignore it. */
  readonly publication?: RepositoryPublication;
}

export interface DeleteFileInput {
  readonly path: string;
  readonly expectedRevision?: string;
  readonly message: string;
}

export interface DeleteFileResult {
  readonly path: string;
  /** Optional provider publication information. Generic consumers may ignore it. */
  readonly publication?: RepositoryPublication;
}

/**
 * Safe provider metadata associated with a completed repository mutation.
 * It intentionally contains no credentials, raw API payloads, or file content.
 */
export interface RepositoryPublication {
  readonly provider: string;
  readonly mode: string;
  readonly branch?: string;
  readonly commitSha?: string;
  readonly commitUrl?: string;
  readonly reviewNumber?: number;
  readonly reviewUrl?: string;
}
