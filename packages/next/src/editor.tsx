import { draftMode, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import {
  ConfigurationError,
  ContentAlreadyExistsError,
  ContentNotFoundError,
  ContentParseError,
  ContentValidationError,
  PithError,
  RepositoryConflictError,
  RepositoryError,
  createContentService,
  createDefaultEntry,
  pithVersion,
  getEntryPath,
  supportsPublicationStatus,
} from '@pith-cms/core';
import type {
  AnyFieldDefinition,
  FieldRecord,
  PithConfig,
  RepositoryPublication,
  RepositoryPublicationReference,
} from '@pith-cms/core';
import type { CollectionDefinition } from '@pith-cms/core';
import type { ReactNode } from 'react';

import {
  EditorEntryForm,
  EditorInvalidEntryActions,
  EditorLoginForm,
  EditorLogoutButton,
  EditorPreviewControls,
  EditorSidebar,
  EditorThemeToggle,
  MissingThemeScriptBanner,
  PreviewProvider,
  type EditorField,
} from './editor-client.js';
import {
  AuthenticationError,
  AuthorizationError,
  CsrfValidationError,
  PithEditorError,
  OriginValidationError,
  RequestValidationError,
} from './editor-errors.js';
import { createEditorMutations } from './editor-mutations.js';
import {
  EDITOR_JSON_LIMIT_BYTES,
  EDITOR_MARKDOWN_LIMIT_BYTES,
  assertContentType,
  assertMutationOrigin,
  getSafeReturnPath,
  isRecord,
  readJsonBody,
  readJsonBodyWithSize,
  readLoginBody,
  validateEditorPath,
  validateTrustedOrigins,
} from './editor-security.js';
import type {
  CreateEditorDependencies,
  EditorMutationFailure,
  EditorMutationResponse,
  PithAuthorizedUser,
  PithEditor,
  PithEditorHandlers,
  PithEditorOptions,
  PithEditorPageProps,
  PithPermission,
  PithRouteHandlerContext,
  PithSession,
} from './editor-types.js';

interface ResolvedEditorOptions {
  readonly basePath: string;
  readonly apiBasePath: string;
  readonly siteName: string;
  readonly trustedOrigins: readonly string[];
  readonly onAuditEvent: PithEditorOptions['onAuditEvent'];
  readonly docsUrl: string;
}

interface MutationEnvelope {
  readonly collection: string;
  readonly identifier: string;
  readonly value?: unknown;
  readonly expectedRevision?: string;
  readonly confirmDelete?: boolean;
  readonly csrfToken: string;
}

interface ParsedMutationEnvelope {
  readonly envelope: MutationEnvelope;
  readonly byteLength: number;
}

export function createEditor<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
): PithEditor<TConfig> {
  const options = resolveEditorOptions(dependencies.options);
  const resolvedDependencies: CreateEditorDependencies<TConfig> = {
    ...dependencies,
    options: {
      basePath: options.basePath,
      apiBasePath: options.apiBasePath,
      siteName: options.siteName,
      trustedOrigins: options.trustedOrigins,
      ...(options.onAuditEvent === undefined ? {} : { onAuditEvent: options.onAuditEvent }),
      ...(options.docsUrl === undefined ? {} : { docsUrl: options.docsUrl }),
    },
    ...(dependencies.onCanonicalMutation === undefined
      ? {}
      : { onCanonicalMutation: dependencies.onCanonicalMutation }),
    ...(dependencies.preview === undefined ? {} : { preview: dependencies.preview }),
    ...(dependencies.onPublicationMerged === undefined
      ? {}
      : { onPublicationMerged: dependencies.onPublicationMerged }),
  };
  const mutations = createEditorMutations(resolvedDependencies);
  const handlers = createEditorHandlers(resolvedDependencies, mutations);

  async function EditorPage(props: PithEditorPageProps) {
    const route = await getPageRoute(props);
    const request = await requestFromHeaders();
    const session = await resolvedDependencies.auth.readSession(request);

    if (route[0] === 'login') {
      if (session) {
        redirect(options.basePath);
      }

      const searchParams = props.searchParams ? await props.searchParams : {};
      const returnPath = getSafeReturnPath(stringValue(searchParams.returnTo), options.basePath);

      return (
        <EditorShell options={options}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <EditorLoginForm apiBasePath={options.apiBasePath} returnPath={returnPath} />
          </div>
        </EditorShell>
      );
    }

    if (!session) {
      const returnTo = editorRoutePath(options.basePath, route);
      redirect(`${options.basePath}/login?returnTo=${encodeURIComponent(returnTo)}`);
    }

    const user = await resolvedDependencies.auth.authorize({
      request,
      permission: 'content:read',
    });

    if (!user) {
      return <EditorForbidden options={options} />;
    }

    return renderEditorRoute({
      config: resolvedDependencies.config,
      repository: resolvedDependencies.repository,
      options,
      auth: resolvedDependencies.auth,
      preview: resolvedDependencies.preview,
      session,
      user,
      route,
    });
  }

  return Object.freeze({
    page: EditorPage,
    handlers,
    mutations,
  });
}

function createEditorHandlers<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
  mutations: PithEditor<TConfig>['mutations'],
): PithEditorHandlers {
  return Object.freeze({
    async GET(request: Request, context: PithRouteHandlerContext) {
      try {
        const route = await getHandlerRoute(context);

        if (route[0] === 'csrf' && new URL(request.url).searchParams.get('purpose') === 'login') {
          const csrf = await dependencies.auth.createCsrfToken({ request, purpose: 'login' });
          return editorJson({ ok: true, token: csrf.token }, 200, csrf.cookie);
        }

        const { user } = await requireAuthorized(dependencies, request, 'content:read');

        if (route[0] === 'csrf') {
          const session = await requireSession(dependencies, request);
          const csrf = await dependencies.auth.createCsrfToken({
            request,
            session,
            purpose: 'mutation',
          });
          return editorJson({ ok: true, token: csrf.token, user: user.id });
        }

        if (route[0] === 'collections') {
          const content = createContentService({
            config: dependencies.config,
            repository: dependencies.repository,
          });
          const collections = await Promise.all(
            Object.keys(dependencies.config.collections).map(async (name) => {
              const result = await content.listEntries(
                name as Extract<keyof TConfig['collections'], string>,
              );
              const definition = dependencies.config.collections[name];
              return {
                name,
                label: definition?.label ?? name,
                format: definition?.format,
                count: result.entries.length,
                invalidCount: result.invalidEntries.length,
              };
            }),
          );
          return editorJson({ ok: true, data: collections });
        }

        if (route[0] === 'entries') {
          const searchParams = new URL(request.url).searchParams;
          const collection = requiredQuery(searchParams, 'collection');
          const identifier = searchParams.get('identifier');
          const content = createContentService({
            config: dependencies.config,
            repository: dependencies.repository,
          });

          if (identifier) {
            const entry = await content.getEntry(
              collection as Extract<keyof TConfig['collections'], string>,
              identifier,
            );

            if (!entry) {
              throw new ContentNotFoundError(undefined, {
                metadata: { collection, identifier },
              });
            }

            return editorJson({ ok: true, data: entry });
          }

          return editorJson({
            ok: true,
            data: await content.listEntries(
              collection as Extract<keyof TConfig['collections'], string>,
            ),
          });
        }

        if (route[0] === 'preview' && route[1] === 'status') {
          if (!dependencies.preview) {
            throw new RequestValidationError('Preview is not configured for this Pith instance.');
          }
          await requireAuthorized(dependencies, request, 'content:read');
          const preview = await dependencies.preview.getContext({ requireDraftMode: false });
          return editorJson({
            ok: true,
            data:
              preview === null
                ? null
                : {
                    source: preview.source.type,
                    expiresAt: preview.expiresAt,
                    url: preview.url,
                    ...(preview.source.type === 'repository-ref'
                      ? { ref: preview.source.ref }
                      : {}),
                  },
          });
        }

        throw new RequestValidationError('Unknown editor route.');
      } catch (error) {
        return editorError(error);
      }
    },

    async POST(request: Request, context: PithRouteHandlerContext) {
      try {
        const route = await getHandlerRoute(context);

        if (route[0] === 'login') {
          assertMutationOrigin(request, dependencies.options);
          const input = await readLoginBody(request);
          const validCsrf = await dependencies.auth.validateCsrfToken({
            request,
            purpose: 'login',
            token: input.csrfToken,
          });

          if (!validCsrf) {
            throw new CsrfValidationError();
          }

          const user = await dependencies.auth.authenticate({ password: input.password, request });

          if (!user) {
            return editorJson(
              {
                ok: false,
                error: {
                  code: 'AUTHENTICATION_FAILED',
                  message: 'Unable to sign in with those credentials.',
                },
              },
              401,
            );
          }

          const session = await dependencies.auth.createSession(user);
          return editorJson({ ok: true, data: { user: user.id } }, 200, session.cookie);
        }

        if (route[0] === 'logout') {
          const session = await requireSession(dependencies, request);
          assertContentType(request, ['application/json']);
          const body = await readJsonBody(request, EDITOR_JSON_LIMIT_BYTES);

          if (
            !isRecord(body) ||
            Object.keys(body).some((key) => key !== 'csrfToken') ||
            typeof body.csrfToken !== 'string'
          ) {
            throw new RequestValidationError('The logout request is invalid.');
          }

          await assertMutationSecurity(dependencies, request, session, body.csrfToken);
          const deletion = await dependencies.auth.destroySession(request);
          return editorJson({ ok: true }, 200, deletion.cookie);
        }

        if (route[0] === 'preview') {
          if (!dependencies.preview) {
            throw new RequestValidationError('Preview is not configured for this Pith instance.');
          }

          const session = await requireSession(dependencies, request);

          if (route[1] === 'disable') {
            const csrfToken = await readPreviewDisableEnvelope(request);
            await assertMutationSecurity(dependencies, request, session, csrfToken);
            const result = await dependencies.preview.disable();
            return editorJson({ ok: true }, 200, result.cookie);
          }

          if (route[1] === 'entry') {
            const envelope = await readPreviewEntryEnvelope(request);
            const permission =
              envelope.operation === 'create'
                ? 'content:create'
                : envelope.operation === 'delete'
                  ? 'content:delete'
                  : 'content:update';
            const user = await dependencies.auth.authorize({ request, permission });

            if (!user) {
              throw new AuthorizationError();
            }

            await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);
            const result = await dependencies.preview.createEntryPreview({
              user,
              collection: envelope.collection,
              identifier: envelope.identifier,
              operation: envelope.operation,
              ...(envelope.value === undefined ? {} : { value: envelope.value }),
              ...(envelope.baseRevision === undefined
                ? {}
                : { baseRevision: envelope.baseRevision }),
            });
            const draft = await draftMode();
            draft.enable();
            return editorJson(
              { ok: true, data: { url: result.url, expiresAt: result.expiresAt } },
              200,
              result.cookie,
            );
          }

          if (route[1] === 'ref') {
            const envelope = await readPreviewRefEnvelope(request);
            const user = await dependencies.auth.authorize({ request, permission: 'content:read' });

            if (!user) {
              throw new AuthorizationError();
            }

            await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);
            const result = await dependencies.preview.createRefPreview({
              user,
              collection: envelope.collection,
              identifier: envelope.identifier,
              operation: envelope.operation,
              ref: envelope.ref,
              publication: envelope.publication,
            });
            const draft = await draftMode();
            draft.enable();
            return editorJson(
              { ok: true, data: { url: result.url, expiresAt: result.expiresAt } },
              200,
              result.cookie,
            );
          }

          throw new RequestValidationError('Unknown preview route.');
        }

        if (route[0] === 'publication' && route[1] === 'status') {
          const { user, session } = await requireAuthorized(dependencies, request, 'content:read');
          const envelope = await readPublicationStatusEnvelope(request);
          await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);

          if (!supportsPublicationStatus(dependencies.repository)) {
            throw new RequestValidationError(
              'The configured repository does not report publication state.',
            );
          }

          const status = await dependencies.repository.getPublicationStatus(envelope.publication);
          if (status.state === 'review-merged') {
            await dependencies.onPublicationMerged?.({
              collection: envelope.collection,
              identifier: envelope.identifier,
            });
          }
          return editorJson({ ok: true, data: { status, user: user.id } });
        }

        if (route[0] === 'entries') {
          const { user, session } = await requireAuthorized(
            dependencies,
            request,
            'content:create',
          );
          const { envelope, byteLength } = await readMutationEnvelope(request, 'create');
          assertEntryMutationSize(dependencies.config, envelope.collection, byteLength);
          await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);
          const entry = await mutations.createEntry({
            collection: envelope.collection as Extract<keyof TConfig['collections'], string>,
            identifier: envelope.identifier,
            value: envelope.value,
            user,
          });
          return editorJson(successForEntry(entry), 200, await disablePreviewCookie(dependencies));
        }

        throw new RequestValidationError('Unknown editor route.');
      } catch (error) {
        return editorError(error);
      }
    },

    async PUT(request: Request, context: PithRouteHandlerContext) {
      try {
        const route = await getHandlerRoute(context);

        if (route[0] !== 'entries') {
          throw new RequestValidationError('Unknown editor route.');
        }

        const { user, session } = await requireAuthorized(dependencies, request, 'content:update');
        const { envelope, byteLength } = await readMutationEnvelope(request, 'update');
        assertEntryMutationSize(dependencies.config, envelope.collection, byteLength);
        await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);
        const entry = await mutations.updateEntry({
          collection: envelope.collection as Extract<keyof TConfig['collections'], string>,
          identifier: envelope.identifier,
          value: envelope.value,
          expectedRevision: envelope.expectedRevision ?? '',
          user,
        });
        return editorJson(successForEntry(entry), 200, await disablePreviewCookie(dependencies));
      } catch (error) {
        return editorError(error);
      }
    },

    async DELETE(request: Request, context: PithRouteHandlerContext) {
      try {
        const route = await getHandlerRoute(context);

        if (route[0] !== 'entries') {
          throw new RequestValidationError('Unknown editor route.');
        }

        const { user, session } = await requireAuthorized(dependencies, request, 'content:delete');
        const { envelope } = await readMutationEnvelope(request, 'delete');
        await assertMutationSecurity(dependencies, request, session, envelope.csrfToken);

        if (envelope.confirmDelete !== true) {
          throw new RequestValidationError('Deleting content requires explicit confirmation.');
        }

        const result = await mutations.deleteEntry({
          collection: envelope.collection as Extract<keyof TConfig['collections'], string>,
          identifier: envelope.identifier,
          expectedRevision: envelope.expectedRevision ?? '',
          user,
        });
        return editorJson({
          ok: true,
          data: {
            collection: envelope.collection,
            identifier: envelope.identifier,
            path: result.path,
            ...(result.publication === undefined ? {} : { publication: result.publication }),
          },
        });
      } catch (error) {
        return editorError(error);
      }
    },
  });
}

function sortByOrder<
  T extends { readonly value: Record<string, unknown>; readonly identifier: string },
>(entries: readonly T[], orderField?: string): T[] {
  if (!orderField) {
    return [...entries].sort((left, right) => left.identifier.localeCompare(right.identifier));
  }
  return [...entries].sort((left, right) => {
    const leftVal = left.value[orderField];
    const rightVal = right.value[orderField];
    if (typeof leftVal === 'number' && typeof rightVal === 'number') {
      return leftVal - rightVal;
    }
    return String(leftVal ?? '').localeCompare(String(rightVal ?? ''));
  });
}

async function renderEditorRoute<TConfig extends PithConfig>({
  config,
  repository,
  options,
  auth,
  preview,
  session,
  user,
  route,
}: {
  readonly config: TConfig;
  readonly repository: CreateEditorDependencies<TConfig>['repository'];
  readonly options: ResolvedEditorOptions;
  readonly auth: CreateEditorDependencies<TConfig>['auth'];
  readonly preview?: CreateEditorDependencies<TConfig>['preview'];
  readonly session: PithSession;
  readonly user: PithAuthorizedUser;
  readonly route: readonly string[];
}) {
  const content = createContentService({ config, repository });
  const csrf = await auth.createCsrfToken({
    request: await requestFromHeaders(),
    session,
    purpose: 'mutation',
  });

  const sidebarLinks = Object.entries(config.collections).map(([name, definition]) => ({
    name,
    label: (definition as { label?: string }).label ?? name,
    href: `${options.basePath}/collections/${encodeURIComponent(name)}`,
  }));

  const sidebarEntries: Record<
    string,
    readonly { readonly name: string; readonly label: string; readonly href: string }[]
  > = {};
  for (const [name] of Object.entries(config.collections)) {
    const result = await content.listEntries(name as Extract<keyof TConfig['collections'], string>);
    const orderField = (config.collections[name] as { order?: string }).order;
    const sorted = sortByOrder(result.entries, orderField);
    sidebarEntries[name] = sorted.map((entry) => ({
      name: entry.identifier,
      label: displayEntryLabel(
        entry.value,
        (config.collections[name] as { displayField?: string }).displayField,
        entry.identifier,
      ),
      href: `${options.basePath}/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.identifier)}`,
    }));
  }

  const editorRootPath = process.env.PITH_EDITOR_ROOT_PATH ?? process.cwd();
  const isLocalDev = process.env.NODE_ENV !== 'production';

  if (route.length === 0) {
    const collections = await Promise.all(
      Object.keys(config.collections).map(async (name) => {
        const result = await content.listEntries(
          name as Extract<keyof TConfig['collections'], string>,
        );
        const collection = config.collections[name];
        return { name, collection, result };
      }),
    );

    return (
      <EditorShell
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <div className="pith-editor-collection-grid">
          {collections.map(({ name, collection, result }) => (
            <a href={`${options.basePath}/collections/${encodeURIComponent(name)}`} key={name}>
              <strong>{collection?.label ?? name}</strong>
              <span>{collection?.format}</span>
              <span>{result.entries.length} entries</span>
              {result.invalidEntries.length > 0 ? (
                <span>{result.invalidEntries.length} invalid</span>
              ) : null}
            </a>
          ))}
        </div>
      </EditorShell>
    );
  }

  if (route[0] !== 'collections' || !route[1]) {
    return (
      <EditorShell
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <p>The requested editor page does not exist.</p>
      </EditorShell>
    );
  }

  const collectionName = route[1];
  const collection = config.collections[collectionName];

  if (!collection) {
    return (
      <EditorShell
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <p>The requested collection does not exist.</p>
      </EditorShell>
    );
  }

  const metadata = {
    name: collectionName,
    label: collection.label ?? collectionName,
    identifierField: collection.identifierField,
    fields: toEditorFields(collection.fields as FieldRecord),
  };
  const canCreate = user.permissions.includes('content:create');
  const canUpdate = user.permissions.includes('content:update');
  const canDelete = user.permissions.includes('content:delete');
  const canPreviewCreate = preview !== undefined && canCreate;
  const canPreviewUpdate = preview !== undefined && canUpdate;

  if (route.length === 2) {
    const listed = await content.listEntries(
      collectionName as Extract<keyof TConfig['collections'], string>,
    );
    const orderField = (config.collections[collectionName] as { order?: string }).order;
    const sorted = sortByOrder(listed.entries, orderField);

    return (
      <EditorShell
        breadcrumb={[{ label: 'Collections', href: options.basePath }, { label: metadata.label }]}
        currentCollection={collectionName}
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <div className="pith-editor-toolbar">
          {canCreate ? (
            <a href={`${options.basePath}/collections/${collectionName}/new`}>New entry</a>
          ) : null}
        </div>
        <ul className="pith-editor-entry-list">
          {sorted.map((entry) => (
            <li key={entry.identifier}>
              <a
                href={`${options.basePath}/collections/${collectionName}/${encodeURIComponent(entry.identifier)}`}
              >
                <strong>
                  {displayEntryLabel(entry.value, collection.displayField, entry.identifier)}
                </strong>
                <span>{entry.identifier}</span>
                {entry.updatedAt ? <time>{entry.updatedAt}</time> : null}
              </a>
            </li>
          ))}
        </ul>
        {listed.invalidEntries.length > 0 ? (
          <section className="pith-editor-invalid">
            <h2>Invalid content</h2>
            <ul>
              {listed.invalidEntries.map((entry) => (
                <li key={entry.path}>
                  <code>{entry.path}</code>: {entry.error.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </EditorShell>
    );
  }

  if (route[2] === 'new' && route.length === 3) {
    return (
      <EditorShell
        breadcrumb={[
          { label: 'Collections', href: options.basePath },
          { label: metadata.label, href: `${options.basePath}/collections/${collectionName}` },
          { label: 'New' },
        ]}
        currentCollection={collectionName}
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <EditorEntryForm
          apiBasePath={options.apiBasePath}
          basePath={options.basePath}
          canCreate={canCreate}
          canDelete={false}
          canPreview={canPreviewCreate}
          canUpdate={false}
          collection={collectionName}
          collectionFormat={collection.format}
          csrfToken={csrf.token}
          fields={metadata.fields}
          identifierField={metadata.identifierField}
          initialValue={
            createDefaultEntry(
              collection as unknown as CollectionDefinition<FieldRecord>,
            ) as Record<string, unknown>
          }
          isLocalDev={isLocalDev}
          rootPath={editorRootPath}
        />
      </EditorShell>
    );
  }

  const identifier = route[2];

  if (!identifier || route.length !== 3) {
    return (
      <EditorShell
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <p>The requested entry does not exist.</p>
      </EditorShell>
    );
  }

  try {
    const entry = await content.getEntry(
      collectionName as Extract<keyof TConfig['collections'], string>,
      identifier,
    );

    if (!entry) {
      return (
        <EditorShell
          options={options}
          sidebarEntries={sidebarEntries}
          sidebarLinks={sidebarLinks}
          user={user}
          version={pithVersion}
        >
          <p>The requested entry does not exist.</p>
        </EditorShell>
      );
    }

    return (
      <EditorShell
        breadcrumb={[
          { label: 'Collections', href: options.basePath },
          {
            label: metadata.label,
            href: `${options.basePath}/collections/${collectionName}`,
          },
          {
            label: displayEntryLabel(entry.value, collection.displayField, identifier),
          },
        ]}
        currentCollection={collectionName}
        currentEntry={identifier}
        options={options}
        sidebarEntries={sidebarEntries}
        sidebarLinks={sidebarLinks}
        user={user}
        version={pithVersion}
      >
        <EditorEntryForm
          apiBasePath={options.apiBasePath}
          basePath={options.basePath}
          canCreate={false}
          canDelete={canDelete}
          canPreview={canPreviewUpdate}
          canUpdate={canUpdate}
          collection={collectionName}
          collectionFormat={collection.format}
          csrfToken={csrf.token}
          entryPath={entry.path}
          fields={metadata.fields}
          identifier={identifier}
          identifierField={metadata.identifierField}
          initialValue={entry.value as Record<string, unknown>}
          isLocalDev={isLocalDev}
          revision={entry.revision}
          rootPath={editorRootPath}
        />
      </EditorShell>
    );
  } catch (error) {
    if (error instanceof ContentParseError || error instanceof ContentValidationError) {
      const path = getEntryPath({ config, collection: collectionName, identifier });
      const file = await repository.read(path);

      return (
        <EditorShell
          options={options}
          sidebarEntries={sidebarEntries}
          sidebarLinks={sidebarLinks}
          user={user}
          version={pithVersion}
        >
          <section className="pith-editor-invalid">
            <h2>This entry cannot be edited safely</h2>
            <p>
              <code>{path}</code>
            </p>
            <p>{error.message}</p>
            {error instanceof ContentValidationError ? (
              <ul>
                {error.errors.map((item) => (
                  <li key={`${item.path.join('.')}:${item.code}`}>{item.message}</li>
                ))}
              </ul>
            ) : null}
            {canDelete ? (
              <EditorInvalidEntryActions
                apiBasePath={options.apiBasePath}
                basePath={options.basePath}
                collection={collectionName}
                csrfToken={csrf.token}
                identifier={identifier}
                {...(file?.revision === undefined ? {} : { revision: file.revision })}
              />
            ) : null}
          </section>
        </EditorShell>
      );
    }

    throw error;
  }
}

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

function EditorShell({
  options,
  user,
  breadcrumb,
  sidebarLinks,
  sidebarEntries,
  currentCollection,
  currentEntry,
  version,
  children,
}: {
  readonly options: ResolvedEditorOptions;
  readonly user?: PithAuthorizedUser;
  readonly breadcrumb?: readonly BreadcrumbItem[];
  readonly sidebarLinks?: readonly {
    readonly name: string;
    readonly label: string;
    readonly href: string;
  }[];
  readonly sidebarEntries?: Record<
    string,
    readonly { readonly name: string; readonly label: string; readonly href: string }[]
  >;
  readonly currentCollection?: string;
  readonly currentEntry?: string;
  readonly version?: string;
  readonly children: ReactNode;
}) {
  return (
    <PreviewProvider>
      <div className="pith-editor">
        <header className="pith-editor-header">
          <div className="pith-editor-header-start">
            <a className="pith-editor-wordmark" href="/">
              {options.siteName}
            </a>
            {breadcrumb && breadcrumb.length > 0 ? (
              <nav className="pith-editor-breadcrumb">
                {breadcrumb.map((item, index) => (
                  <span key={index}>
                    {index > 0 ? <span className="pith-editor-breadcrumb-sep">/</span> : null}
                    {item.href ? (
                      <a href={item.href}>{item.label}</a>
                    ) : (
                      <span className="pith-editor-breadcrumb-current">{item.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            ) : null}
          </div>
          {user ? (
            <div className="pith-editor-header-end">
              <EditorThemeToggle />
              <div className="pith-editor-user">
                <EditorLogoutButton
                  apiBasePath={options.apiBasePath}
                  returnPath={`${options.basePath}/login`}
                />
              </div>
            </div>
          ) : null}
        </header>
        {user ? <EditorPreviewControls apiBasePath={options.apiBasePath} /> : null}
        <MissingThemeScriptBanner docsUrl={options.docsUrl} />
        <div className="pith-editor-body">
          {sidebarLinks && user ? (
            <EditorSidebar
              {...(typeof currentCollection === 'string' ? { currentCollection } : {})}
              {...(typeof currentEntry === 'string' ? { currentEntry } : {})}
              {...(sidebarEntries ? { entries: sidebarEntries } : {})}
              docsUrl={options.docsUrl}
              links={sidebarLinks}
              {...(version ? { version } : {})}
            />
          ) : null}
          <main className="pith-editor-main">{children}</main>
        </div>
      </div>
    </PreviewProvider>
  );
}

function EditorForbidden({ options }: { readonly options: ResolvedEditorOptions }) {
  return (
    <EditorShell options={options}>
      <p>You do not have permission to view Pith content.</p>
    </EditorShell>
  );
}

function resolveEditorOptions(options: PithEditorOptions): ResolvedEditorOptions {
  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('Editor configuration must be an object.');
  }

  const supported = new Set([
    'basePath',
    'apiBasePath',
    'siteName',
    'trustedOrigins',
    'onAuditEvent',
    'docsUrl',
  ]);

  if (Object.keys(options).some((key) => !supported.has(key))) {
    throw new ConfigurationError('Editor configuration contains unsupported options.');
  }

  let basePath: string;
  let apiBasePath: string;

  try {
    basePath = validateEditorPath(options.basePath ?? '/pith', 'editor.basePath');
    apiBasePath = validateEditorPath(options.apiBasePath ?? '/api/pith', 'editor.apiBasePath');
  } catch (error) {
    throw new ConfigurationError(
      error instanceof Error ? error.message : 'Editor paths are invalid.',
    );
  }

  if (basePath === apiBasePath) {
    throw new ConfigurationError('editor.basePath and editor.apiBasePath must be different.');
  }

  if (
    options.siteName !== undefined &&
    (typeof options.siteName !== 'string' || !options.siteName.trim())
  ) {
    throw new ConfigurationError('editor.siteName must be a non-empty string.');
  }

  if (options.onAuditEvent !== undefined && typeof options.onAuditEvent !== 'function') {
    throw new ConfigurationError('editor.onAuditEvent must be a function.');
  }

  let trustedOrigins: readonly string[];

  try {
    trustedOrigins = validateTrustedOrigins(options.trustedOrigins);
  } catch (error) {
    throw new ConfigurationError(
      error instanceof Error ? error.message : 'trustedOrigins are invalid.',
    );
  }

  const docsUrl =
    options.docsUrl !== undefined && typeof options.docsUrl === 'string'
      ? options.docsUrl
      : process.env.NODE_ENV !== 'production'
        ? 'http://localhost:3101'
        : 'https://docs.pith.df1.cx';

  return Object.freeze({
    basePath,
    apiBasePath,
    siteName: options.siteName?.trim() || 'Pith',
    trustedOrigins,
    onAuditEvent: options.onAuditEvent,
    docsUrl,
  });
}

async function requireSession<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
  request: Request,
): Promise<PithSession> {
  const session = await dependencies.auth.readSession(request);

  if (!session) {
    throw new AuthenticationError();
  }

  return session;
}

async function requireAuthorized<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
  request: Request,
  permission: PithPermission,
): Promise<{ readonly user: PithAuthorizedUser; readonly session: PithSession }> {
  const session = await requireSession(dependencies, request);
  const user = await dependencies.auth.authorize({ request, permission });

  if (!user) {
    throw new AuthorizationError();
  }

  return { user, session };
}

async function assertMutationSecurity<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
  request: Request,
  session: PithSession,
  token?: string,
): Promise<void> {
  assertMutationOrigin(request, dependencies.options);

  if (!token) {
    throw new CsrfValidationError();
  }

  const valid = await dependencies.auth.validateCsrfToken({
    request,
    session,
    purpose: 'mutation',
    token,
  });

  if (!valid) {
    throw new CsrfValidationError();
  }
}

async function readMutationEnvelope(
  request: Request,
  operation: 'create' | 'update' | 'delete',
): Promise<ParsedMutationEnvelope> {
  assertContentType(request, ['application/json']);
  const parsed = await readJsonBodyWithSize(
    request,
    operation === 'delete' ? EDITOR_JSON_LIMIT_BYTES : EDITOR_MARKDOWN_LIMIT_BYTES,
  );
  const body = parsed.value;

  if (!isRecord(body)) {
    throw new RequestValidationError();
  }

  const allowed =
    operation === 'create'
      ? new Set(['collection', 'identifier', 'value', 'csrfToken'])
      : operation === 'update'
        ? new Set(['collection', 'identifier', 'value', 'expectedRevision', 'csrfToken'])
        : new Set(['collection', 'identifier', 'expectedRevision', 'confirmDelete', 'csrfToken']);

  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new RequestValidationError('The editor request contains unexpected fields.');
  }

  if (
    typeof body.collection !== 'string' ||
    typeof body.identifier !== 'string' ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new RequestValidationError();
  }

  if (operation !== 'create' && typeof body.expectedRevision !== 'string') {
    throw new RequestValidationError('A current content revision is required.');
  }

  if (operation !== 'delete' && !('value' in body)) {
    throw new RequestValidationError('An entry value is required.');
  }

  return {
    envelope: {
      collection: body.collection,
      identifier: body.identifier,
      ...(operation === 'delete'
        ? { confirmDelete: body.confirmDelete === true }
        : { value: body.value }),
      ...(typeof body.expectedRevision === 'string'
        ? { expectedRevision: body.expectedRevision }
        : {}),
      csrfToken: body.csrfToken,
    },
    byteLength: parsed.byteLength,
  };
}

async function readPreviewDisableEnvelope(request: Request): Promise<string> {
  assertContentType(request, ['application/json']);
  const body = await readJsonBody(request, EDITOR_JSON_LIMIT_BYTES);

  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.csrfToken !== 'string') {
    throw new RequestValidationError('The preview disable request is invalid.');
  }

  return body.csrfToken;
}

async function readPreviewEntryEnvelope(request: Request): Promise<{
  readonly collection: string;
  readonly identifier: string;
  readonly operation: 'create' | 'update' | 'delete';
  readonly value?: unknown;
  readonly baseRevision?: string;
  readonly csrfToken: string;
}> {
  assertContentType(request, ['application/json']);
  const parsed = await readJsonBodyWithSize(request, EDITOR_MARKDOWN_LIMIT_BYTES);
  const body = parsed.value;

  if (!isRecord(body)) {
    throw new RequestValidationError('The preview request is invalid.');
  }

  const allowed = new Set([
    'collection',
    'identifier',
    'operation',
    'value',
    'baseRevision',
    'csrfToken',
  ]);

  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    typeof body.collection !== 'string' ||
    typeof body.identifier !== 'string' ||
    typeof body.csrfToken !== 'string' ||
    (body.operation !== 'create' && body.operation !== 'update' && body.operation !== 'delete') ||
    (body.operation === 'delete' ? 'value' in body : !('value' in body)) ||
    (body.baseRevision !== undefined && typeof body.baseRevision !== 'string')
  ) {
    throw new RequestValidationError('The preview request is invalid.');
  }

  return {
    collection: body.collection,
    identifier: body.identifier,
    operation: body.operation,
    ...(body.operation === 'delete' ? {} : { value: body.value }),
    ...(typeof body.baseRevision === 'string' ? { baseRevision: body.baseRevision } : {}),
    csrfToken: body.csrfToken,
  };
}

async function readPreviewRefEnvelope(request: Request): Promise<{
  readonly collection: string;
  readonly identifier: string;
  readonly operation: 'create' | 'update' | 'delete';
  readonly ref: string;
  readonly publication: RepositoryPublicationReference;
  readonly csrfToken: string;
}> {
  assertContentType(request, ['application/json']);
  const body = await readJsonBody(request, EDITOR_JSON_LIMIT_BYTES);

  if (!isRecord(body)) {
    throw new RequestValidationError('The repository preview request is invalid.');
  }

  const allowed = new Set([
    'collection',
    'identifier',
    'operation',
    'ref',
    'publication',
    'csrfToken',
  ]);

  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    typeof body.collection !== 'string' ||
    typeof body.identifier !== 'string' ||
    (body.operation !== 'create' && body.operation !== 'update' && body.operation !== 'delete') ||
    typeof body.ref !== 'string' ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new RequestValidationError('The repository preview request is invalid.');
  }

  const publication = parsePublicationReference(body.publication);

  if (!publication) {
    throw new RequestValidationError('The repository preview publication is invalid.');
  }

  return {
    collection: body.collection,
    identifier: body.identifier,
    operation: body.operation,
    ref: body.ref,
    publication,
    csrfToken: body.csrfToken,
  };
}

function parsePublicationReference(value: unknown): RepositoryPublicationReference | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['provider', 'mode', 'branch', 'commitSha', 'reviewNumber'].includes(key),
    ) ||
    typeof value.provider !== 'string' ||
    typeof value.mode !== 'string' ||
    (value.branch !== undefined && typeof value.branch !== 'string') ||
    (value.commitSha !== undefined && typeof value.commitSha !== 'string') ||
    (value.reviewNumber !== undefined && !Number.isSafeInteger(value.reviewNumber))
  ) {
    return null;
  }

  return {
    provider: value.provider,
    mode: value.mode,
    ...(typeof value.branch === 'string' ? { branch: value.branch } : {}),
    ...(typeof value.commitSha === 'string' ? { commitSha: value.commitSha } : {}),
    ...(typeof value.reviewNumber === 'number' ? { reviewNumber: value.reviewNumber } : {}),
  };
}

async function readPublicationStatusEnvelope(request: Request): Promise<{
  readonly collection: string;
  readonly identifier: string;
  readonly publication: RepositoryPublicationReference;
  readonly csrfToken: string;
}> {
  assertContentType(request, ['application/json']);
  const body = await readJsonBody(request, EDITOR_JSON_LIMIT_BYTES);

  if (
    !isRecord(body) ||
    Object.keys(body).some(
      (key) => !['collection', 'identifier', 'publication', 'csrfToken'].includes(key),
    ) ||
    typeof body.collection !== 'string' ||
    typeof body.identifier !== 'string' ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new RequestValidationError('The publication status request is invalid.');
  }

  const publication = parsePublicationReference(body.publication);
  if (!publication) {
    throw new RequestValidationError('The publication status request is invalid.');
  }

  return {
    collection: body.collection,
    identifier: body.identifier,
    publication,
    csrfToken: body.csrfToken,
  };
}

function assertEntryMutationSize<TConfig extends PithConfig>(
  config: TConfig,
  collectionName: string,
  byteLength: number,
): void {
  const collection = config.collections[collectionName];

  if (collection?.format === 'json' && byteLength > EDITOR_JSON_LIMIT_BYTES) {
    throw new RequestValidationError('The editor request body is too large.');
  }
}

function successForEntry(entry: {
  readonly collection: string;
  readonly identifier: string;
  readonly revision: string;
  readonly path: string;
  readonly publication?: RepositoryPublication;
}): EditorMutationResponse {
  return {
    ok: true,
    data: {
      collection: entry.collection,
      identifier: entry.identifier,
      revision: entry.revision,
      path: entry.path,
      ...(entry.publication === undefined ? {} : { publication: entry.publication }),
    },
  };
}

async function disablePreviewCookie<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
): Promise<string | undefined> {
  if (!dependencies.preview) {
    return undefined;
  }

  return dependencies.preview
    .disable()
    .then((result) => result.cookie)
    .catch(() => undefined);
}

function editorError(error: unknown): Response {
  if (error instanceof AuthenticationError) {
    return editorJson(failure(error), 401);
  }

  if (
    error instanceof AuthorizationError ||
    error instanceof CsrfValidationError ||
    error instanceof OriginValidationError
  ) {
    return editorJson(failure(error), 403);
  }

  if (error instanceof ContentNotFoundError) {
    return editorJson(failure(error), 404);
  }

  if (error instanceof ContentAlreadyExistsError || error instanceof RepositoryConflictError) {
    const currentRevision =
      typeof error.metadata?.actualRevision === 'string'
        ? error.metadata.actualRevision
        : undefined;
    return editorJson(failure(error, currentRevision), 409);
  }

  if (
    error instanceof RequestValidationError ||
    error instanceof ContentValidationError ||
    error instanceof ContentParseError ||
    error instanceof ConfigurationError
  ) {
    return editorJson(failure(error), 400);
  }

  if (error instanceof RepositoryError || error instanceof PithEditorError) {
    return editorJson(
      {
        ok: false,
        error: { code: 'EDITOR_OPERATION_FAILED', message: 'The editor operation failed.' },
      },
      500,
    );
  }

  if (error instanceof PithError && error.code.startsWith('GITHUB_')) {
    return editorJson(failure(error), error.code === 'GITHUB_RATE_LIMITED' ? 429 : 502);
  }

  if (error instanceof PithError) {
    return editorJson(
      {
        ok: false,
        error: { code: 'EDITOR_OPERATION_FAILED', message: 'The editor operation failed.' },
      },
      500,
    );
  }

  return editorJson(
    {
      ok: false,
      error: { code: 'EDITOR_OPERATION_FAILED', message: 'The editor operation failed.' },
    },
    500,
  );
}

function failure(
  error: { readonly code: string; readonly message: string },
  currentRevision?: string,
): EditorMutationFailure {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error instanceof ContentValidationError ? { fieldErrors: error.errors } : {}),
      ...(currentRevision === undefined ? {} : { currentRevision }),
    },
  };
}

function editorJson(body: unknown, status = 200, cookie?: string): Response {
  const response = NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });

  if (cookie) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}

async function getPageRoute(props: PithEditorPageProps): Promise<readonly string[]> {
  const params = await props.params;
  return toSegments(params.pithPath ?? firstParamValue(params));
}

async function getHandlerRoute(context: PithRouteHandlerContext): Promise<readonly string[]> {
  const params = await context.params;
  return toSegments(params.pithRoute ?? firstParamValue(params));
}

function firstParamValue(
  params: Record<string, string | readonly string[] | undefined>,
): string | readonly string[] | undefined {
  return Object.values(params).find((value) => value !== undefined);
}

function toSegments(value: string | readonly string[] | undefined): readonly string[] {
  if (typeof value === 'string') {
    return [value];
  }

  return value ? value.filter((item) => typeof item === 'string' && item.length > 0) : [];
}

async function requestFromHeaders(): Promise<Request> {
  return new Request('http://pith.local', { headers: await headers() });
}

function requiredQuery(searchParams: URLSearchParams, name: string): string {
  const value = searchParams.get(name);

  if (!value) {
    throw new RequestValidationError(`The ${name} query parameter is required.`);
  }

  return value;
}

function editorRoutePath(basePath: string, route: readonly string[]): string {
  return route.length === 0 ? basePath : `${basePath}/${route.map(encodeURIComponent).join('/')}`;
}

function stringValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function toEditorFields(fields: FieldRecord): readonly EditorField[] {
  return Object.entries(fields).map(([name, field]) => toEditorField(name, field));
}

function toEditorField(name: string, field: AnyFieldDefinition): EditorField {
  const options = field.options as EditorField['options'];
  return {
    name,
    kind: field.kind,
    options: {
      ...options,
      ...(field.kind === 'object' ? { fields: toEditorFields(field.options.fields) } : {}),
      ...(field.kind === 'list' ? { item: toEditorField('item', field.options.item) } : {}),
    },
  };
}

function displayEntryLabel(
  value: unknown,
  displayField: string | undefined,
  fallback: string,
): string {
  if (!displayField || !isRecord(value)) {
    return fallback;
  }

  const displayValue = value[displayField];
  return typeof displayValue === 'string' || typeof displayValue === 'number'
    ? String(displayValue)
    : fallback;
}
