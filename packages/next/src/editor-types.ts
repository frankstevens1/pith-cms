import type { ComponentType } from 'react';

import type {
  ContentEntry,
  ContentRepository,
  DeleteFileResult,
  PithConfig,
  InvalidContentEntry,
  RepositoryPublication,
  ValidationError,
} from '@pith-cms/core';
import type { PithPreview } from './types.js';

export type PithPermission =
  'content:read' | 'content:create' | 'content:update' | 'content:delete';

export interface PithAuthorizedUser {
  readonly id: string;
  readonly displayName?: string;
  readonly permissions: readonly PithPermission[];
}

/** Server-only session information. Never pass this object to a client component. */
export interface PithSession {
  readonly id: string;
  readonly user: PithAuthorizedUser;
  readonly expiresAt: string;
  readonly csrfSecret: string;
}

export interface PithAuthenticationInput {
  readonly password: string;
  readonly request: Request;
}

export interface PithAuthorizationInput {
  readonly request: Request;
  readonly permission?: PithPermission;
}

export interface PithCsrfToken {
  readonly token: string;
  /** Cookie header to append when a login challenge needs browser binding. */
  readonly cookie?: string;
}

export interface PithSessionDeletion {
  readonly cookie: string;
}

/**
 * Minimal authentication surface for the editor. Consumers with existing
 * authentication should adapt their session to this contract rather than
 * exposing their provider implementation to editor client code.
 */
export interface PithAuthAdapter {
  authenticate(input: PithAuthenticationInput): Promise<PithAuthorizedUser | null>;
  authorize(input: PithAuthorizationInput): Promise<PithAuthorizedUser | null>;
  createSession(user: PithAuthorizedUser): Promise<PithSession & { readonly cookie: string }>;
  readSession(request: Request): Promise<PithSession | null>;
  destroySession(request: Request): Promise<PithSessionDeletion>;
  createCsrfToken(input: {
    readonly request: Request;
    readonly session?: PithSession;
    readonly purpose: 'login' | 'mutation';
  }): Promise<PithCsrfToken>;
  validateCsrfToken(input: {
    readonly request: Request;
    readonly session?: PithSession;
    readonly purpose: 'login' | 'mutation';
    readonly token: string;
  }): Promise<boolean>;
}

export interface PasswordAuthOptions {
  readonly passwordHash: string;
  readonly sessionSecret: string;
  readonly sessionDurationSeconds?: number;
  readonly cookieName?: string;
  readonly secure?: boolean;
  readonly rateLimit?: {
    readonly maxFailures?: number;
    readonly lockoutSeconds?: number;
  };
}

export interface PithEditorAuditEvent {
  readonly operation: 'create' | 'update' | 'delete';
  readonly userId: string;
  readonly collection: string;
  readonly identifier: string;
  readonly occurredAt: string;
  readonly publication?: RepositoryPublication;
}

export interface PithEditorOptions {
  readonly basePath?: string;
  readonly apiBasePath?: string;
  readonly siteName?: string;
  readonly trustedOrigins?: readonly string[];
  readonly onAuditEvent?: (event: PithEditorAuditEvent) => void | Promise<void>;
  readonly docsUrl?: string;
}

export interface PithEditorPageProps {
  readonly params: Promise<Record<string, string | readonly string[] | undefined>>;
  readonly searchParams?: Promise<Record<string, string | readonly string[] | undefined>>;
}

export type PithRouteHandlerContext = {
  readonly params: Promise<Record<string, string | readonly string[] | undefined>>;
};

export type PithRouteHandler = (
  request: Request,
  context: PithRouteHandlerContext,
) => Promise<Response>;

export interface PithEditorHandlers {
  readonly GET: PithRouteHandler;
  readonly POST: PithRouteHandler;
  readonly PUT: PithRouteHandler;
  readonly DELETE: PithRouteHandler;
}

export interface EditorCollectionMetadata {
  readonly name: string;
  readonly label: string;
  readonly path: string;
  readonly format: 'json' | 'markdown';
  readonly identifierField: string;
  readonly displayField?: string;
}

export interface PithEditorMutations<TConfig extends PithConfig> {
  createEntry<TCollectionName extends Extract<keyof TConfig['collections'], string>>(input: {
    readonly collection: TCollectionName;
    readonly identifier: string;
    readonly value: unknown;
    readonly user: PithAuthorizedUser;
  }): Promise<ContentEntry<unknown>>;
  updateEntry<TCollectionName extends Extract<keyof TConfig['collections'], string>>(input: {
    readonly collection: TCollectionName;
    readonly identifier: string;
    readonly value: unknown;
    readonly expectedRevision: string;
    readonly user: PithAuthorizedUser;
  }): Promise<ContentEntry<unknown>>;
  deleteEntry<TCollectionName extends Extract<keyof TConfig['collections'], string>>(input: {
    readonly collection: TCollectionName;
    readonly identifier: string;
    readonly expectedRevision: string;
    readonly user: PithAuthorizedUser;
  }): Promise<DeleteFileResult>;
}

export interface PithEditor<TConfig extends PithConfig> {
  readonly page: ComponentType<PithEditorPageProps>;
  readonly handlers: PithEditorHandlers;
  readonly mutations: PithEditorMutations<TConfig>;
}

export interface EditorListResult {
  readonly entries: readonly ContentEntry<unknown>[];
  readonly invalidEntries: readonly InvalidContentEntry[];
}

export interface EditorMutationSuccess {
  readonly ok: true;
  readonly data: {
    readonly collection: string;
    readonly identifier: string;
    readonly revision?: string;
    readonly path?: string;
    readonly publication?: RepositoryPublication;
  };
}

export interface EditorMutationFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fieldErrors?: readonly ValidationError[];
    readonly currentRevision?: string;
  };
}

export type EditorMutationResponse = EditorMutationSuccess | EditorMutationFailure;

export interface CreateEditorDependencies<TConfig extends PithConfig> {
  readonly config: TConfig;
  readonly repository: ContentRepository;
  readonly options: PithEditorOptions;
  readonly auth: PithAuthAdapter;
  readonly preview?: PithPreview;
  /** Called only after a canonical repository mutation completes. */
  readonly onCanonicalMutation?: (input: {
    readonly operation: 'create' | 'update' | 'delete';
    readonly userId: string;
    readonly collection: string;
    readonly identifier: string;
    readonly publication?: RepositoryPublication;
  }) => Promise<void> | void;
  readonly onPublicationMerged?: (input: {
    readonly collection: string;
    readonly identifier: string;
  }) => Promise<void> | void;
}
