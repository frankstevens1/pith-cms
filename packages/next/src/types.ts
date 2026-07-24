import type {
  CollectionDefinition,
  ContentEntry,
  ContentRepository,
  PithConfig,
  InferCollectionEntry,
  InvalidContentEntry,
  RepositoryPublicationReference,
} from '@pith-cms/core';
import type { PithAuthAdapter, PithEditor, PithEditorOptions } from './editor-types.js';

export type {
  CreateEditorDependencies,
  EditorCollectionMetadata,
  EditorListResult,
  EditorMutationFailure,
  EditorMutationResponse,
  EditorMutationSuccess,
  PithAuthAdapter,
  PithAuthenticationInput,
  PithAuthorizedUser,
  PithAuthorizationInput,
  PithCsrfToken,
  PithEditor,
  PithEditorAuditEvent,
  PithEditorHandlers,
  PithEditorMutations,
  PithEditorOptions,
  PithEditorPageProps,
  PithPermission,
  PithRouteHandler,
  PithRouteHandlerContext,
  PithSession,
  PithSessionDeletion,
  PasswordAuthOptions,
} from './editor-types.js';

export type PithCacheMode = 'no-store' | 'request' | 'persistent';

export interface PithCacheOptions {
  readonly mode?: PithCacheMode;
  /** Seconds before canonical persistent entries are eligible for revalidation. */
  readonly revalidate?: number;
  /** Stable namespace for applications that host more than one Pith instance. */
  readonly tagPrefix?: string;
}

export interface PithCache {
  revalidateEntry<TCollectionName extends string>(
    collection: TCollectionName,
    identifier: string,
  ): Promise<void>;
  revalidateCollection<TCollectionName extends string>(collection: TCollectionName): Promise<void>;
  revalidateAll(): Promise<void>;
}

export type PreviewOperation = 'create' | 'update' | 'delete';

export interface EntryOverlayPreview {
  readonly type: 'entry-overlay';
  readonly operation: PreviewOperation;
  readonly collection: string;
  readonly identifier: string;
  readonly serializedContent?: string;
  readonly baseRevision?: string;
}

export interface RepositoryRefPreview {
  readonly type: 'repository-ref';
  readonly ref: string;
  readonly publication?: RepositoryPublicationReference;
}

export type PithPreviewSource = EntryOverlayPreview | RepositoryRefPreview;

export interface PithPreviewRecord {
  readonly id: string;
  readonly userId: string;
  readonly instanceId: string;
  readonly source: PithPreviewSource;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly url: string;
}

export interface PithPreviewStore {
  create(record: PithPreviewRecord): Promise<void>;
  read(id: string): Promise<PithPreviewRecord | null>;
  delete(id: string): Promise<void>;
}

export interface ResolvePreviewPathContext {
  readonly collection: string;
  readonly identifier: string;
  readonly operation: PreviewOperation;
  readonly value?: unknown;
}

export interface PithPreviewOptions {
  readonly secret: string;
  readonly durationSeconds?: number;
  readonly store?: PithPreviewStore;
  resolvePath(context: ResolvePreviewPathContext): string | null | Promise<string | null>;
}

export interface PreviewContentMetadata {
  readonly isPreview: true;
  readonly source: 'entry-overlay' | 'repository-ref';
  readonly expiresAt: string;
  readonly baseRevision?: string;
  readonly ref?: string;
}

export type PreviewContentEntry<TValue> = ContentEntry<TValue> & {
  readonly preview?: PreviewContentMetadata;
};

export interface PithPreviewContext {
  readonly id: string;
  readonly source: PithPreviewSource;
  readonly expiresAt: string;
  readonly url: string;
}

export interface PithPreviewSession {
  readonly url: string;
  readonly expiresAt: string;
  /** Server-only Set-Cookie value; route handlers append it without exposing the session id. */
  readonly cookie: string;
}

export interface PithPreview {
  createEntryPreview(input: {
    readonly user: { readonly id: string };
    readonly collection: string;
    readonly identifier: string;
    readonly operation: PreviewOperation;
    readonly value?: unknown;
    readonly baseRevision?: string;
  }): Promise<PithPreviewSession>;
  createRefPreview(input: {
    readonly user: { readonly id: string };
    readonly collection: string;
    readonly identifier: string;
    readonly operation: PreviewOperation;
    readonly ref: string;
    readonly publication?: RepositoryPublicationReference;
  }): Promise<PithPreviewSession>;
  getContext(options?: { readonly requireDraftMode?: boolean }): Promise<PithPreviewContext | null>;
  disable(): Promise<{ readonly cookie: string }>;
  /** Internal editor hand-off: only server-side mutations may register a trusted publication. */
  registerPublication(input: {
    readonly userId: string;
    readonly publication: RepositoryPublicationReference;
  }): void;
}

export interface CreatePithOptions<TConfig extends PithConfig> {
  readonly config: TConfig;
  readonly repository: ContentRepository;
  readonly cache?: PithCacheOptions;
  readonly editor?: PithEditorOptions;
  readonly auth?: PithAuthAdapter;
  readonly preview?: PithPreviewOptions;
}

/** Reserved for future read options without widening the current runtime behavior. */
export type ReadEntryOptions = Readonly<Record<string, never>>;

export interface ListEntriesOptions {
  /** Set false only when callers intentionally do not need invalid-file diagnostics. */
  readonly includeInvalid?: boolean;
}

export type ConfiguredCollectionName<TConfig extends PithConfig> = Extract<
  keyof TConfig['collections'],
  string
>;

export type ConfiguredCollection<
  TConfig extends PithConfig,
  TCollectionName extends ConfiguredCollectionName<TConfig>,
> = TConfig['collections'][TCollectionName] extends CollectionDefinition
  ? TConfig['collections'][TCollectionName]
  : never;

export type InferConfiguredCollectionEntry<
  TConfig extends PithConfig,
  TCollectionName extends ConfiguredCollectionName<TConfig>,
> = InferCollectionEntry<ConfiguredCollection<TConfig, TCollectionName>>;

export interface CollectionMetadata {
  readonly name: string;
  readonly label: string;
  readonly path: string;
  readonly format: 'json' | 'markdown';
  readonly identifierField: string;
  readonly displayField?: string;
}

export interface PithListEntriesResult<TValue> {
  readonly entries: readonly ContentEntry<TValue>[];
  readonly invalidEntries: readonly InvalidContentEntry[];
}

export interface PithContentClient<TConfig extends PithConfig> {
  getEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
    options?: ReadEntryOptions,
  ): Promise<ContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>>>;
  getOptionalEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
    options?: ReadEntryOptions,
  ): Promise<ContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>> | null>;
  listEntries<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    options?: ListEntriesOptions,
  ): Promise<PithListEntriesResult<InferConfiguredCollectionEntry<TConfig, TCollectionName>>>;
  getCollection<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
  ): CollectionMetadata;
  hasEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
  ): Promise<boolean>;
  getEntryIdentifiers<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
  ): Promise<readonly string[]>;
  forRequest(): Promise<PithRequestContentClient<TConfig>>;
}

export interface PithRequestContentClient<TConfig extends PithConfig> extends Omit<
  PithContentClient<TConfig>,
  'forRequest'
> {
  getEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
    options?: ReadEntryOptions,
  ): Promise<PreviewContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>>>;
  getOptionalEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
    options?: ReadEntryOptions,
  ): Promise<PreviewContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>> | null>;
  listEntries<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    options?: ListEntriesOptions,
  ): Promise<{
    readonly entries: readonly PreviewContentEntry<
      InferConfiguredCollectionEntry<TConfig, TCollectionName>
    >[];
    readonly invalidEntries: readonly InvalidContentEntry[];
  }>;
}

export interface PithInstance<TConfig extends PithConfig> {
  readonly config: TConfig;
  readonly content: PithContentClient<TConfig>;
  readonly cache: PithCache;
  readonly preview?: PithPreview;
  readonly editor?: PithEditor<TConfig>;
}

export interface PithInstanceWithEditor<TConfig extends PithConfig> extends PithInstance<TConfig> {
  readonly editor: PithEditor<TConfig>;
}
