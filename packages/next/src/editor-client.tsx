'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';

interface PreviewState {
  readonly url: string | null;
  readonly expiresAt: string | null;
}

type SetPreview = Dispatch<SetStateAction<PreviewState>>;

const PreviewContext = createContext<{
  readonly preview: PreviewState;
  readonly setPreview: SetPreview;
  readonly previewWindowRef: MutableRefObject<Window | null>;
  readonly isPreviewDirty: boolean;
  readonly setIsPreviewDirty: Dispatch<SetStateAction<boolean>>;
  readonly updatePreviewRef: MutableRefObject<(() => void) | null>;
} | null>(null);

export function PreviewProvider({ children }: { readonly children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewState>({ url: null, expiresAt: null });
  const [isPreviewDirty, setIsPreviewDirty] = useState(false);
  const previewWindowRef = useRef<Window | null>(null);
  const updatePreviewRef = useRef<(() => void) | null>(null);
  const value = useMemo(
    () => ({
      preview,
      setPreview,
      previewWindowRef,
      isPreviewDirty,
      setIsPreviewDirty,
      updatePreviewRef,
    }),
    [preview, previewWindowRef, isPreviewDirty, updatePreviewRef],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): {
  readonly preview: PreviewState;
  readonly setPreview: SetPreview;
  readonly previewWindowRef: MutableRefObject<Window | null>;
  readonly isPreviewDirty: boolean;
  readonly setIsPreviewDirty: Dispatch<SetStateAction<boolean>>;
  readonly updatePreviewRef: MutableRefObject<(() => void) | null>;
} {
  const context = useContext(PreviewContext);

  if (!context) {
    throw new Error('usePreview must be used within PreviewProvider.');
  }

  return context;
}

async function disablePreview(
  apiBasePath: string,
  previewWindowRef: MutableRefObject<Window | null>,
  setPreview: SetPreview,
): Promise<void> {
  try {
    const csrfResponse = await fetch(`${apiBasePath}/csrf`);
    const csrf = (await csrfResponse.json()) as { readonly token?: string };

    if (csrf.token) {
      await fetch(`${apiBasePath}/preview/disable`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csrfToken: csrf.token }),
      });
    }
  } catch {
    // Ignore network errors and still clear local preview state.
  } finally {
    previewWindowRef.current?.close();
    previewWindowRef.current = null;
    setPreview({ url: null, expiresAt: null });
  }
}

interface SidebarLink {
  readonly name: string;
  readonly label: string;
  readonly href: string;
}

interface EditorOption {
  readonly label: string;
  readonly value: string;
}

export interface EditorField {
  readonly name: string;
  readonly kind:
    | 'text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'slug'
    | 'url'
    | 'email'
    | 'select'
    | 'multiselect'
    | 'markdown'
    | 'object'
    | 'list';
  readonly options: {
    readonly label?: string;
    readonly description?: string;
    readonly required?: boolean;
    readonly defaultValue?: unknown;
    readonly multiline?: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly integer?: boolean;
    readonly source?: string;
    readonly options?: readonly EditorOption[];
    readonly fields?: readonly EditorField[];
    readonly item?: EditorField;
  };
}

interface EditorFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fieldErrors?: readonly {
      readonly path: readonly (string | number)[];
      readonly message: string;
    }[];
    readonly currentRevision?: string;
  };
}

interface EditorPublication {
  readonly provider: string;
  readonly mode: string;
  readonly branch?: string;
  readonly commitSha?: string;
  readonly commitUrl?: string;
  readonly reviewNumber?: number;
  readonly reviewUrl?: string;
}

interface PublicationStatus {
  readonly state: 'committed' | 'review-open' | 'review-merged' | 'review-closed' | 'unknown';
  readonly mergedAt?: string;
  readonly closedAt?: string;
}

interface EditorSuccess {
  readonly ok: true;
  readonly data: {
    readonly revision?: string;
    readonly publication?: EditorPublication;
    readonly url?: string;
    readonly expiresAt?: string;
    readonly status?: PublicationStatus;
  };
}

interface EditorEntryFormProps {
  readonly apiBasePath: string;
  readonly basePath: string;
  readonly csrfToken: string;
  readonly collection: string;
  readonly identifier?: string;
  readonly identifierField: string;
  readonly fields: readonly EditorField[];
  readonly initialValue: Record<string, unknown>;
  readonly revision?: string;
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly canPreview?: boolean;
  readonly collectionFormat?: string;
  readonly entryPath?: string;
  readonly rootPath?: string;
  readonly isLocalDev?: boolean;
}

export function EditorEntryForm({
  apiBasePath,
  basePath,
  csrfToken,
  collection,
  identifier,
  identifierField,
  fields,
  initialValue,
  revision,
  canCreate,
  canUpdate,
  canDelete,
  canPreview = false,
  collectionFormat,
  entryPath,
  rootPath,
  isLocalDev,
}: EditorEntryFormProps) {
  const [value, setValue] = useState<Record<string, unknown>>(() => cloneValue(initialValue));
  const [savedValue, setSavedValue] = useState<Record<string, unknown>>(() =>
    cloneValue(initialValue),
  );
  const [activeRevision, setActiveRevision] = useState(revision);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<EditorFailure['error'] | null>(null);
  const [conflictLatest, setConflictLatest] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [publication, setPublication] = useState<EditorPublication | null>(null);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus | null>(null);
  const [previewedValue, setPreviewedValue] = useState<Record<string, unknown> | null>(null);
  const { preview, setPreview, previewWindowRef, setIsPreviewDirty, updatePreviewRef } =
    usePreview();
  const [previewAction, setPreviewAction] = useState<'idle' | 'exiting'>('idle');
  const router = useRouter();
  const dirty = useMemo(
    () => JSON.stringify(value) !== JSON.stringify(savedValue),
    [savedValue, value],
  );
  const existing = identifier !== undefined;
  const dirtyRef = useRef(dirty);
  const statusRef = useRef(status);

  dirtyRef.current = dirty;
  statusRef.current = status;

  const isCurrentPreviewDirty = useMemo(
    () => !previewedValue || JSON.stringify(value) !== JSON.stringify(previewedValue),
    [value, previewedValue],
  );

  const previewEntryRef = useRef(previewEntry);
  previewEntryRef.current = previewEntry;

  useEffect(() => {
    setIsPreviewDirty(isCurrentPreviewDirty);
  }, [isCurrentPreviewDirty, setIsPreviewDirty]);

  useEffect(() => {
    updatePreviewRef.current = () => {
      previewEntryRef.current?.();
    };
    return () => {
      updatePreviewRef.current = null;
    };
  }, []);

  useEffect(() => {
    setValue(cloneValue(initialValue));
    setSavedValue(cloneValue(initialValue));
    setActiveRevision(revision);
    setPublication(null);
    setPublicationStatus(null);
    setConflictLatest(null);
    setStatus('idle');
  }, [initialValue, revision]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && statusRef.current !== 'saved') {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  async function save(): Promise<void> {
    if (existing && !canUpdate) {
      return;
    }

    if (!existing && !canCreate) {
      return;
    }

    const resolvedIdentifier = existing ? identifier : value[identifierField];

    if (typeof resolvedIdentifier !== 'string' || resolvedIdentifier.length === 0) {
      setFieldErrors({ [identifierField]: 'An identifier is required.' });
      return;
    }

    setStatus('saving');
    setFieldErrors({});
    setFormError(null);
    setConflict(null);
    const response = await fetch(`${apiBasePath}/entries`, {
      method: existing ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        identifier: resolvedIdentifier,
        value: normalizeEntryValue(fields, value),
        ...(existing ? { expectedRevision: activeRevision } : {}),
        csrfToken,
      }),
    });
    const result = (await response.json()) as EditorSuccess | EditorFailure;

    if (!result.ok) {
      setStatus('idle');

      if (result.error.code === 'REPOSITORY_CONFLICT') {
        setConflict(result.error);
        void loadConflictLatest();
        return;
      }

      setFormError(result.error.message);
      setFieldErrors(toFieldErrors(result.error.fieldErrors));
      return;
    }

    setStatus('saved');
    setSavedValue(cloneValue(value));
    setActiveRevision(result.data.revision);
    setPublication(result.data.publication ?? null);
    setPublicationStatus(null);
    previewWindowRef.current?.close();
    previewWindowRef.current = null;
    setPreview({ url: null, expiresAt: null });
    router.refresh();

    if (!existing) {
      router.push(
        `${basePath}/collections/${collection}/${encodeURIComponent(resolvedIdentifier)}`,
      );
      return;
    }
  }

  async function loadConflictLatest(): Promise<void> {
    if (!identifier) {
      return;
    }

    try {
      const response = await fetch(
        `${apiBasePath}/entries?collection=${encodeURIComponent(collection)}&identifier=${encodeURIComponent(identifier)}`,
      );
      const result = (await response.json()) as
        | { readonly ok: true; readonly data: { readonly value?: Record<string, unknown> } }
        | EditorFailure;

      if (result.ok && result.data.value && typeof result.data.value === 'object') {
        setConflictLatest(result.data.value);
      }
    } catch {
      // Keep the submitted value available even when the latest file cannot be read safely.
    }
  }

  async function deleteEntry(): Promise<void> {
    if (!existing || !canDelete || !activeRevision) {
      return;
    }

    setStatus('saving');
    setFormError(null);
    const response = await fetch(`${apiBasePath}/entries`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        identifier,
        expectedRevision: activeRevision,
        confirmDelete: true,
        csrfToken,
      }),
    });
    const result = (await response.json()) as EditorSuccess | EditorFailure;

    if (!result.ok) {
      setStatus('idle');
      setFormError(result.error.message);

      if (result.error.code === 'REPOSITORY_CONFLICT') {
        setConflict(result.error);
      }

      return;
    }

    window.location.assign(`${basePath}/collections/${collection}`);
  }

  async function previewEntry(): Promise<void> {
    if (!canPreview) {
      return;
    }

    const resolvedIdentifier = existing ? identifier : value[identifierField];

    if (typeof resolvedIdentifier !== 'string' || resolvedIdentifier.length === 0) {
      setFieldErrors({ [identifierField]: 'An identifier is required.' });
      return;
    }

    setFormError(null);
    setFieldErrors({});
    try {
      const response = await fetch(`${apiBasePath}/preview/entry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          identifier: resolvedIdentifier,
          operation: existing ? 'update' : 'create',
          value: normalizeEntryValue(fields, value),
          ...(existing && activeRevision ? { baseRevision: activeRevision } : {}),
          csrfToken,
        }),
      });
      const result = (await response.json()) as EditorSuccess | EditorFailure;

      if (!result.ok || !result.data.url || !result.data.expiresAt) {
        setFormError(
          result.ok ? 'This entry does not have a configured preview path.' : result.error.message,
        );
        return;
      }

      setPreview({ url: result.data.url, expiresAt: result.data.expiresAt });
      setPreviewedValue(cloneValue(value));
      previewWindowRef.current?.location.reload();
      previewWindowRef.current?.focus();
    } catch {
      setFormError('Preview could not be created. Please try again.');
    }
  }

  async function exitPreview(): Promise<void> {
    setPreviewAction('exiting');
    await disablePreview(apiBasePath, previewWindowRef, setPreview);
    setPreviewAction('idle');
    router.refresh();
  }

  async function previewPullRequest(): Promise<void> {
    if (!publication?.branch || publication.mode !== 'pull-request' || !identifier) {
      return;
    }

    const previewWindow = openPreviewWindow();

    if (!previewWindow) {
      setFormError(
        'Your browser blocked the preview tab. Allow pop-ups for this site and try again.',
      );
      return;
    }

    try {
      const response = await fetch(`${apiBasePath}/preview/ref`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          identifier,
          operation: 'update',
          ref: publication.branch,
          publication: {
            provider: publication.provider,
            mode: publication.mode,
            branch: publication.branch,
            ...(publication.commitSha ? { commitSha: publication.commitSha } : {}),
            ...(publication.reviewNumber ? { reviewNumber: publication.reviewNumber } : {}),
          },
          csrfToken,
        }),
      });
      const result = (await response.json()) as EditorSuccess | EditorFailure;

      if (!result.ok || !result.data.url) {
        previewWindow.close();
        setFormError(result.ok ? 'The pull request cannot be previewed.' : result.error.message);
        return;
      }

      previewWindow.location.replace(result.data.url);
    } catch {
      previewWindow.close();
      setFormError('Preview could not be created. Please try again.');
    }
  }

  async function refreshPublication(): Promise<void> {
    if (!publication || !identifier) {
      return;
    }

    const response = await fetch(`${apiBasePath}/publication/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        identifier,
        publication: {
          provider: publication.provider,
          mode: publication.mode,
          ...(publication.branch ? { branch: publication.branch } : {}),
          ...(publication.commitSha ? { commitSha: publication.commitSha } : {}),
          ...(publication.reviewNumber ? { reviewNumber: publication.reviewNumber } : {}),
        },
        csrfToken,
      }),
    });
    const result = (await response.json()) as EditorSuccess | EditorFailure;

    if (!result.ok || !result.data.status) {
      setFormError(result.ok ? 'Publication state could not be refreshed.' : result.error.message);
      return;
    }

    setPublicationStatus(result.data.status);
  }

  return (
    <form
      className="pith-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {formError ? (
        <div aria-live="polite" className="pith-editor-alert" role="alert">
          {formError}
        </div>
      ) : null}
      {conflict ? (
        <section aria-live="assertive" className="pith-editor-conflict">
          <h2>Content changed elsewhere</h2>
          <p>{conflict.message}</p>
          {conflictLatest ? (
            <ConflictComparison loaded={savedValue} latest={conflictLatest} submitted={value} />
          ) : (
            <p>
              The latest file could not be compared safely. Your unsaved content remains available.
            </p>
          )}
          <div className="pith-editor-actions">
            <button onClick={() => window.location.reload()} type="button">
              Reload latest version
            </button>
            <button
              onClick={() => void navigator.clipboard?.writeText(JSON.stringify(value, null, 2))}
              type="button"
            >
              Copy unsaved content
            </button>
          </div>
        </section>
      ) : null}
      {publication ? (
        <PublicationNotice
          onPreview={previewPullRequest}
          onRefresh={refreshPublication}
          publication={publication}
          status={publicationStatus}
        />
      ) : null}
      <div className="pith-editor-form-body">
        <div className="pith-editor-fields">
          {fields.map((field) => (
            <EditorFieldControl
              field={field}
              key={field.name}
              onChange={(nextValue) =>
                setValue((current) => ({ ...current, [field.name]: nextValue }))
              }
              path={[field.name]}
              value={value[field.name]}
              {...(existing && field.name === identifierField ? { disabled: true } : {})}
              {...(fieldErrors[field.name] === undefined ? {} : { error: fieldErrors[field.name] })}
            />
          ))}
        </div>
        <div className="pith-editor-form-sidebar">
          <div className="pith-editor-form-sidebar-info">
            {collectionFormat || entryPath ? (
              <div className="pith-editor-form-sidebar-info-schema">
                {collectionFormat ? (
                  <span>
                    Format: <strong>.{collectionFormat === 'markdown' ? 'md' : 'json'}</strong>
                  </span>
                ) : null}
                {entryPath && rootPath ? (
                  <span>
                    File: <strong>{entryPath}</strong>
                  </span>
                ) : null}
                {entryPath && rootPath && isLocalDev ? (
                  <span>
                    <a
                      href={`vscode://file/${rootPath}/${entryPath}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open in VS Code
                    </a>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="pith-editor-form-sidebar-footer">
            {canPreview ? (
              <p className="pith-editor-form-sidebar-description">
                {preview.expiresAt
                  ? 'Preview mode is active. View your changes in the banner above.'
                  : 'Preview your unsaved changes. A preview banner will appear above.'}
              </p>
            ) : null}
            <div className="pith-editor-form-sidebar-actions">
              <button
                disabled={
                  status === 'saving' ||
                  publication?.mode === 'pull-request' ||
                  (existing ? !canUpdate : !canCreate)
                }
                type="submit"
              >
                {status === 'saving' ? 'Saving\u2026' : existing ? 'Save' : 'Create'}
              </button>
              {canPreview ? (
                <button
                  disabled={status === 'saving' || previewAction === 'exiting'}
                  onClick={() => {
                    if (preview.expiresAt) {
                      void exitPreview();
                    } else {
                      void previewEntry();
                    }
                  }}
                  type="button"
                >
                  {previewAction === 'exiting'
                    ? 'Exiting\u2026'
                    : preview.expiresAt
                      ? 'Exit preview'
                      : 'Preview'}
                </button>
              ) : null}
              {existing && canDelete ? (
                <button
                  className="pith-editor-danger"
                  onClick={() => setConfirmingDelete(true)}
                  type="button"
                >
                  Delete
                </button>
              ) : null}
            </div>
            {confirmingDelete ? (
              <section
                aria-labelledby="pith-delete-heading"
                className="pith-editor-delete"
                role="dialog"
              >
                <h2 id="pith-delete-heading">Delete this entry?</h2>
                <p>This permanently removes the file. This action cannot be undone.</p>
                <div className="pith-editor-actions">
                  <button
                    className="pith-editor-danger"
                    onClick={() => void deleteEntry()}
                    type="button"
                  >
                    Confirm delete
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} type="button">
                    Cancel
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}

function ConflictComparison({
  loaded,
  submitted,
  latest,
}: {
  readonly loaded: Record<string, unknown>;
  readonly submitted: Record<string, unknown>;
  readonly latest: Record<string, unknown>;
}) {
  const paths = new Set([
    ...flattenValue(loaded).keys(),
    ...flattenValue(submitted).keys(),
    ...flattenValue(latest).keys(),
  ]);
  const initial = flattenValue(loaded);
  const yours = flattenValue(submitted);
  const current = flattenValue(latest);
  const changed = [...paths]
    .filter((path) => {
      const loadedValue = initial.get(path);
      return !sameValue(loadedValue, yours.get(path)) || !sameValue(loadedValue, current.get(path));
    })
    .sort();

  if (changed.length === 0) {
    return null;
  }

  return (
    <section className="pith-editor-conflict-comparison">
      <h3>Field comparison</h3>
      <dl>
        {changed.map((path) => (
          <div key={path}>
            <dt>{path || 'Entry'}</dt>
            <dd>Loaded: {displayConflictValue(initial.get(path))}</dd>
            <dd>Your version: {displayConflictValue(yours.get(path))}</dd>
            <dd>Latest version: {displayConflictValue(current.get(path))}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function flattenValue(
  value: unknown,
  path = '',
  result = new Map<string, unknown>(),
): Map<string, unknown> {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      result.set(path, value);
      return result;
    }
    value.forEach((item, index) =>
      flattenValue(item, path ? `${path}.${index}` : String(index), result),
    );
    return result;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      result.set(path, value);
      return result;
    }
    entries.forEach(([key, item]) => flattenValue(item, path ? `${path}.${key}` : key, result));
    return result;
  }

  result.set(path, value);
  return result;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function displayConflictValue(value: unknown): string {
  if (value === undefined) {
    return '—';
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return serialized.length > 400 ? `${serialized.slice(0, 397)}…` : serialized;
}

export function EditorPreviewControls({ apiBasePath }: { readonly apiBasePath: string }) {
  const { preview, setPreview, previewWindowRef, isPreviewDirty, updatePreviewRef } = usePreview();

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;

    async function check() {
      try {
        const response = await fetch(`${apiBasePath}/preview/status`);

        if (!active) {
          return;
        }

        if (!response.ok) {
          timeout = setTimeout(check, 30_000);
          return;
        }

        const result = (await response.json()) as {
          readonly ok: boolean;
          readonly data?: { readonly expiresAt?: string; readonly url?: string } | null;
        };

        if (!active) {
          return;
        }

        if (result?.ok && result.data?.expiresAt) {
          setPreview({ url: result.data.url ?? null, expiresAt: result.data.expiresAt });
          const expiresMs = new Date(result.data.expiresAt).getTime();
          const delay = expiresMs - Date.now() + 2000;
          timeout = setTimeout(check, Math.max(10_000, delay));
          return;
        }

        setPreview((current) => (current.expiresAt ? { url: null, expiresAt: null } : current));
        timeout = setTimeout(check, 30_000);
      } catch {
        timeout = setTimeout(check, 30_000);
      }
    }

    void check();
    const onFocus = () => {
      clearTimeout(timeout);
      void check();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      clearTimeout(timeout);
      window.removeEventListener('focus', onFocus);
    };
  }, [apiBasePath, previewWindowRef, setPreview]);

  if (!preview.expiresAt) {
    return null;
  }

  return (
    <section aria-live="polite" className="pith-editor-preview-bar" role="status">
      <span className="pith-editor-preview-bar-message">
        <strong>Preview mode is active.</strong> It expires at{' '}
        <time dateTime={preview.expiresAt}>{preview.expiresAt}</time>
      </span>
      <span className="pith-editor-preview-bar-buttons">
        <button
          disabled={!isPreviewDirty}
          onClick={() => updatePreviewRef.current?.()}
          type="button"
        >
          Update
        </button>
        {preview.url ? (
          <a
            href={preview.url}
            onClick={(event) => {
              if (!preview.url) {
                return;
              }

              const existing = previewWindowRef.current;

              if (existing && !existing.closed) {
                existing.focus();
                event.preventDefault();
                return;
              }

              const opened = window.open(preview.url, '_blank');

              if (opened) {
                previewWindowRef.current = opened;
                event.preventDefault();
              }
            }}
            rel="noopener"
            target="_blank"
          >
            View
          </a>
        ) : null}
      </span>
    </section>
  );
}

function PublicationNotice({
  publication,
  onPreview,
  onRefresh,
  status,
}: {
  readonly publication: EditorPublication;
  readonly onPreview: () => Promise<void>;
  readonly onRefresh: () => Promise<void>;
  readonly status: PublicationStatus | null;
}) {
  const isPullRequest = publication.mode === 'pull-request';
  const commit = publication.commitSha ? publication.commitSha.slice(0, 12) : undefined;

  return (
    <section aria-live="polite" className="pith-editor-publication" role="status">
      <strong>{isPullRequest ? 'Pull request created' : 'Published to GitHub'}</strong>
      {publication.branch ? <p>Branch: {publication.branch}</p> : null}
      {commit ? <p>Commit: {commit}</p> : null}
      {publication.commitUrl ? (
        <p>
          <a href={publication.commitUrl} rel="noreferrer" target="_blank">
            View commit
          </a>
        </p>
      ) : null}
      {publication.reviewUrl ? (
        <p>
          <a href={publication.reviewUrl} rel="noreferrer" target="_blank">
            View pull request{publication.reviewNumber ? ` #${publication.reviewNumber}` : ''}
          </a>
        </p>
      ) : null}
      <p>
        {isPullRequest
          ? 'This content is not public until the pull request is merged and your site deploys.'
          : 'The repository change succeeded. Your hosting platform may still need to deploy it.'}
      </p>
      {isPullRequest ? (
        <>
          <button onClick={() => void onPreview()} type="button">
            Preview pull request
          </button>
          <button onClick={() => void onRefresh()} type="button">
            Refresh publication state
          </button>
        </>
      ) : null}
      {status ? <p>{publicationStateMessage(status)}</p> : null}
    </section>
  );
}

function publicationStateMessage(status: PublicationStatus): string {
  switch (status.state) {
    case 'committed':
      return 'Committed. Deployment is not verified.';
    case 'review-open':
      return 'Review pending. Canonical site content is unchanged.';
    case 'review-merged':
      return 'Merged. Canonical repository content changed; deployment is not verified.';
    case 'review-closed':
      return 'Closed without merge. Canonical site content is unchanged.';
    default:
      return 'Publication state is currently unknown.';
  }
}

interface EditorFieldControlProps {
  readonly field: EditorField;
  readonly value: unknown;
  readonly path: readonly (string | number)[];
  readonly error?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: unknown) => void;
}

function EditorFieldControl({
  field,
  value,
  path,
  error,
  disabled = false,
  onChange,
}: EditorFieldControlProps) {
  const id = `pith-field-${path.join('-')}`;
  const label = field.options.label ?? humanize(field.name);
  const required = field.options.required === true;

  if (field.kind === 'object') {
    const objectValue = isRecord(value) ? value : {};
    const [collapsed, setCollapsed] = useState(false);
    const headerRef = useRef<HTMLLegendElement>(null);

    return (
      <fieldset className="pith-editor-group">
        <legend
          className="pith-editor-group-header"
          onClick={() => setCollapsed((v) => !v)}
          ref={headerRef}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setCollapsed((v) => !v);
          }}
        >
          <span>{label}</span>
          <span
            className={`pith-editor-group-chevron ${collapsed ? '' : 'pith-editor-group-chevron--open'}`}
          >
            {'\u25B6'}
          </span>
        </legend>
        {field.options.description ? <p>{field.options.description}</p> : null}
        {!collapsed ? (
          <div className="pith-editor-group-body">
            {field.options.fields?.map((child) => (
              <EditorFieldControl
                field={child}
                key={child.name}
                onChange={(nextValue) => onChange({ ...objectValue, [child.name]: nextValue })}
                path={[...path, child.name]}
                value={objectValue[child.name]}
              />
            ))}
          </div>
        ) : null}
      </fieldset>
    );
  }

  if (field.kind === 'list') {
    const items = Array.isArray(value) ? value : [];
    const itemField = field.options.item;

    return (
      <fieldset className="pith-editor-group">
        <legend>{label}</legend>
        {field.options.description ? <p>{field.options.description}</p> : null}
        {itemField
          ? items.map((item, index) => (
              <div className="pith-editor-list-item" key={`${id}-${index}`}>
                <div className="pith-editor-list-item-content">
                  <EditorFieldControl
                    field={{ ...itemField, name: `${field.name}-${index}` }}
                    onChange={(nextValue) =>
                      onChange(
                        items.map((current, currentIndex) =>
                          currentIndex === index ? nextValue : current,
                        ),
                      )
                    }
                    path={[...path, index]}
                    value={item}
                  />
                </div>
                <button
                  className="pith-editor-list-item-remove"
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                  aria-label={`Remove ${label} item ${index + 1}`}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 1a.5.5 0 0 0-.447.276L4.382 2H2.5a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1h-1.882l-.671-1.276A.5.5 0 0 0 10.5 1zM3 4.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .498.542l-.773 8.5A1.5 1.5 0 0 1 10.736 14H5.264a1.5 1.5 0 0 1-1.49-1.458l-.773-8.5A.5.5 0 0 1 3.5 4z" />
                  </svg>
                </button>
              </div>
            ))
          : null}
        {itemField ? (
          <button onClick={() => onChange([...items, defaultValue(itemField)])} type="button">
            Add item
          </button>
        ) : null}
      </fieldset>
    );
  }

  if (field.kind === 'boolean') {
    return (
      <div className="pith-editor-field">
        <label className="pith-editor-field-checkbox">
          <input
            aria-describedby={error ? `${id}-error` : undefined}
            checked={value === true}
            disabled={disabled}
            id={id}
            onChange={(event) => onChange(event.target.checked)}
            type="checkbox"
          />
          {label}
          {required ? ' *' : ''}
        </label>
        {field.options.description ? <p id={`${id}-help`}>{field.options.description}</p> : null}
        {error ? (
          <p className="pith-editor-field-error" id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const describedBy =
    [field.options.description ? `${id}-help` : undefined, error ? `${id}-error` : undefined]
      .filter((description): description is string => description !== undefined)
      .join(' ') || undefined;

  return (
    <div className="pith-editor-field">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      {renderPrimitiveControl(field, value, id, describedBy, disabled, onChange)}
      {field.options.description ? <p id={`${id}-help`}>{field.options.description}</p> : null}
      {error ? (
        <p className="pith-editor-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function openPreviewWindow(): Window | null {
  const previewWindow = window.open('', '_blank');

  if (!previewWindow) {
    return null;
  }

  previewWindow.opener = null;
  previewWindow.document.title = 'Preparing Pith preview';
  return previewWindow;
}

function renderPrimitiveControl(
  field: EditorField,
  value: unknown,
  id: string,
  describedBy: string | undefined,
  disabled: boolean,
  onChange: (value: unknown) => void,
) {
  if (field.kind === 'select') {
    return (
      <select
        aria-describedby={describedBy}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={field.options.required}
        value={typeof value === 'string' ? value : ''}
      >
        <option value="">Select an option</option>
        {field.options.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'multiselect') {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];

    return (
      <div aria-describedby={describedBy} className="pith-editor-options" id={id}>
        {field.options.options?.map((option) => (
          <label key={option.value}>
            <input
              checked={selected.includes(option.value)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
              type="checkbox"
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === 'markdown' || (field.kind === 'text' && field.options.multiline)) {
    return (
      <textarea
        aria-describedby={describedBy}
        disabled={disabled}
        id={id}
        maxLength={field.options.maxLength}
        minLength={field.options.minLength}
        onChange={(event) => onChange(event.target.value)}
        required={field.options.required}
        rows={field.kind === 'markdown' ? 16 : 5}
        value={typeof value === 'string' ? value : ''}
      />
    );
  }

  const type = inputType(field.kind);
  const normalizedValue =
    field.kind === 'datetime' && typeof value === 'string' ? datetimeLocalValue(value) : value;

  return (
    <input
      aria-describedby={describedBy}
      disabled={disabled}
      id={id}
      max={field.options.max}
      maxLength={field.options.maxLength}
      min={field.options.min}
      minLength={field.options.minLength}
      onChange={(event) =>
        onChange(field.kind === 'number' ? event.target.value : event.target.value)
      }
      required={field.options.required}
      step={field.kind === 'number' && field.options.integer ? 1 : undefined}
      type={type}
      value={
        typeof normalizedValue === 'number' || typeof normalizedValue === 'string'
          ? normalizedValue
          : ''
      }
    />
  );
}

interface EditorLoginFormProps {
  readonly apiBasePath: string;
  readonly returnPath: string;
}

export function EditorLoginForm({ apiBasePath, returnPath }: EditorLoginFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch(`${apiBasePath}/csrf?purpose=login`)
      .then(async (response) => (await response.json()) as { token?: string })
      .then((result) => setCsrfToken(typeof result.token === 'string' ? result.token : null))
      .catch(() => setError('Unable to prepare the login form. Refresh and try again.'));
  }, [apiBasePath]);

  async function submit(): Promise<void> {
    if (!csrfToken) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const response = await fetch(`${apiBasePath}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, csrfToken }),
    });

    if (!response.ok) {
      setSubmitting(false);
      setError('Unable to sign in with those credentials.');
      return;
    }

    window.location.assign(returnPath);
  }

  return (
    <form
      className="pith-editor-login"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1 className="pith-editor-login-title">Sign in</h1>
      <label htmlFor="pith-password">Password</label>
      <input
        autoComplete="current-password"
        id="pith-password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />
      {error ? (
        <p aria-live="polite" className="pith-editor-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={!csrfToken || submitting} suppressHydrationWarning type="submit">
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function EditorLogoutButton({ apiBasePath, returnPath }: EditorLoginFormProps) {
  const [submitting, setSubmitting] = useState(false);

  async function logout(): Promise<void> {
    setSubmitting(true);
    const csrfResponse = await fetch(`${apiBasePath}/csrf`);
    const csrf = (await csrfResponse.json()) as { token?: string };

    if (typeof csrf.token !== 'string') {
      setSubmitting(false);
      return;
    }

    const response = await fetch(`${apiBasePath}/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csrfToken: csrf.token }),
    });

    if (response.ok) {
      window.location.assign(returnPath);
      return;
    }

    setSubmitting(false);
  }

  return (
    <button disabled={submitting} onClick={() => void logout()} type="button">
      {submitting ? 'Signing out\u2026' : 'Sign out'}
    </button>
  );
}

export function EditorThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });

  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem('pith-editor-theme', next);
    } catch {
      /* noop */
    }
    setTheme(next);
  }

  return (
    <button
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="pith-editor-theme-toggle"
      onClick={toggle}
      type="button"
    >
      {theme}
    </button>
  );
}

function Token({
  kw,
  str,
  id,
  jsx,
  children,
}: {
  readonly kw?: boolean;
  readonly str?: boolean;
  readonly id?: boolean;
  readonly jsx?: boolean;
  readonly children: ReactNode;
}) {
  const className = kw ? 't-kw' : str ? 't-str' : id ? 't-id' : jsx ? 't-jsx' : undefined;
  return className ? <span className={className}>{children}</span> : <>{children}</>;
}

export function MissingThemeScriptBanner({ docsUrl }: { readonly docsUrl?: string }) {
  const dismissKey = 'pith-editor-theme-banner-dismissed';
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = [
    `import { ThemeScript } from "./(cms)/_components/theme-script";`,
    '',
    `export default function RootLayout({ children }) {`,
    `  return (`,
    `    <html lang="en" suppressHydrationWarning>`,
    `      <head>`,
    `        <ThemeScript />`,
    `      </head>`,
    `      <body>{children}</body>`,
    `    </html>`,
    `  );`,
    `}`,
  ].join('\n');

  useEffect(() => {
    const hasTheme = document.documentElement.hasAttribute('data-theme');
    if (!hasTheme) {
      try {
        if (sessionStorage.getItem(dismissKey) !== '1') {
          setVisible(true);
        }
      } catch {
        setVisible(true);
      }
    }
  }, []);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="pith-editor-theme-banner">
      <div className="pith-editor-theme-banner-body">
        <p>
          The theme script is not configured — the editor may not render correctly. Add the&nbsp;
          <code>ThemeScript</code> component to your root layout&rsquo;s <code>&lt;head&gt;</code>:
        </p>
        <div className="pith-editor-theme-banner-code-wrapper">
          <pre>
            <code>
              <Token kw>import</Token>
              {' { '}
              <Token id>ThemeScript</Token>
              {' } '}
              <Token str>"./(cms)/_components/theme-script"</Token>
              {';\n\n'}
              <Token kw>export default function</Token> <Token id>RootLayout</Token>
              {'({ children }) {\n'}
              {'  '}
              <Token kw>return</Token>
              {' (\n'}
              {'    '}
              <Token jsx>&lt;html lang="en" suppressHydrationWarning&gt;</Token>
              {'\n      '}
              <Token jsx>&lt;head&gt;</Token>
              {'\n        '}
              <Token jsx>&lt;ThemeScript /&gt;</Token>
              {'\n      '}
              <Token jsx>&lt;/head&gt;</Token>
              {'\n      '}
              <Token jsx>&lt;body&gt;{'{\\u0063hildren}'}&lt;/body&gt;</Token>
              {'\n    '}
              <Token jsx>&lt;/html&gt;</Token>
              {'\n  );\n}'}
            </code>
          </pre>
          <button className="pith-editor-theme-banner-copy" onClick={handleCopy} type="button">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {docsUrl ? (
          <p>
            <a href={docsUrl} target="_blank" rel="noopener">
              See the documentation
            </a>
          </p>
        ) : null}
      </div>
      <button
        aria-label="Dismiss theme warning"
        className="pith-editor-theme-banner-dismiss"
        onClick={() => {
          setVisible(false);
          try {
            sessionStorage.setItem(dismissKey, '1');
          } catch {
            /* noop */
          }
        }}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

interface EditorInvalidEntryActionsProps {
  readonly apiBasePath: string;
  readonly basePath: string;
  readonly collection: string;
  readonly identifier: string;
  readonly revision?: string;
  readonly csrfToken: string;
}

export function EditorSidebar({
  links,
  currentCollection,
  entries,
  currentEntry,
  version,
}: {
  readonly links: readonly SidebarLink[];
  readonly currentCollection?: string;
  readonly entries?: Record<
    string,
    readonly { readonly name: string; readonly label: string; readonly href: string }[]
  >;
  readonly currentEntry?: string;
  readonly version?: string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (currentCollection) {
      return { [currentCollection]: true };
    }
    return {};
  });

  function toggleCollection(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <>
      <button
        className="pith-editor-sidebar-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close sidebar' : 'Open sidebar'}
        type="button"
      >
        {open ? '\u2715' : '\u2630'}
      </button>
      <nav className={`pith-editor-sidebar ${open ? 'pith-editor-sidebar--open' : ''}`}>
        {open ? (
          <div className="pith-editor-sidebar-backdrop" onClick={() => setOpen(false)} />
        ) : null}
        <div className="pith-editor-sidebar-inner">
          <span className="pith-editor-sidebar-label">Collections</span>
          {links.map((link) => {
            const linkEntries = entries?.[link.name];
            const isExpanded = expanded[link.name];

            return (
              <div key={link.name}>
                <div
                  className={`pith-editor-sidebar-collection ${link.name === currentCollection ? 'pith-editor-sidebar-collection--active' : ''}`}
                  onClick={() => toggleCollection(link.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleCollection(link.name);
                  }}
                >
                  <span>{link.label}</span>
                  {linkEntries && linkEntries.length > 0 ? (
                    <span
                      className={`pith-editor-sidebar-collection-chevron ${isExpanded ? 'pith-editor-sidebar-collection-chevron--open' : ''}`}
                    >
                      {'\u25B6'}
                    </span>
                  ) : null}
                </div>
                {isExpanded && linkEntries ? (
                  <div>
                    {linkEntries.map((entry) => (
                      <a
                        className={`pith-editor-sidebar-entry ${entry.name === currentEntry ? 'pith-editor-sidebar-entry--active' : ''}`}
                        href={entry.href}
                        key={entry.name}
                        onClick={() => setOpen(false)}
                      >
                        {entry.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {version ? <div className="pith-editor-sidebar-version">{version}</div> : null}
      </nav>
    </>
  );
}

export function EditorInvalidEntryActions({
  apiBasePath,
  basePath,
  collection,
  identifier,
  revision,
  csrfToken,
}: EditorInvalidEntryActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!revision) {
    return null;
  }

  async function deleteEntry(): Promise<void> {
    setDeleting(true);
    setError(null);
    const response = await fetch(`${apiBasePath}/entries`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        identifier,
        expectedRevision: revision,
        confirmDelete: true,
        csrfToken,
      }),
    });
    const result = (await response.json()) as EditorSuccess | EditorFailure;

    if (!result.ok) {
      setDeleting(false);
      setError(result.error.message);
      return;
    }

    window.location.assign(`${basePath}/collections/${collection}`);
  }

  return (
    <section className="pith-editor-delete">
      {error ? (
        <p aria-live="polite" className="pith-editor-field-error" role="alert">
          {error}
        </p>
      ) : null}
      {confirming ? (
        <div aria-label="Delete invalid entry confirmation" role="dialog">
          <p>This permanently deletes the invalid file.</p>
          <div className="pith-editor-actions">
            <button disabled={deleting} onClick={() => void deleteEntry()} type="button">
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button disabled={deleting} onClick={() => setConfirming(false)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="pith-editor-danger" onClick={() => setConfirming(true)} type="button">
          Delete invalid entry
        </button>
      )}
    </section>
  );
}

function inputType(kind: EditorField['kind']): string {
  switch (kind) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime-local';
    case 'url':
      return 'url';
    case 'email':
      return 'email';
    default:
      return 'text';
  }
}

function normalizeEntryValue(
  fields: readonly EditorField[],
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field.name, normalizeFieldValue(field, value[field.name])]),
  );
}

function normalizeFieldValue(field: EditorField, value: unknown): unknown {
  if (field.kind === 'number' && typeof value === 'string') {
    return value === '' ? value : Number(value);
  }

  if (field.kind === 'datetime' && typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
  }

  if (field.kind === 'object' && isRecord(value)) {
    return Object.fromEntries(
      field.options.fields?.map((child) => [
        child.name,
        normalizeFieldValue(child, value[child.name]),
      ]) ?? [],
    );
  }

  if (field.kind === 'list' && Array.isArray(value) && field.options.item) {
    return value.map((item) => normalizeFieldValue(field.options.item as EditorField, item));
  }

  return value;
}

function defaultValue(field: EditorField): unknown {
  if (field.options.defaultValue !== undefined) {
    return cloneValue(field.options.defaultValue);
  }

  if (field.kind === 'object') {
    return Object.fromEntries(
      field.options.fields?.map((child) => [child.name, defaultValue(child)]) ?? [],
    );
  }

  if (field.kind === 'boolean') {
    return false;
  }

  if (field.kind === 'list') {
    return [];
  }

  return '';
}

function toFieldErrors(
  errors: EditorFailure['error']['fieldErrors'] | undefined,
): Record<string, string> {
  if (!errors) {
    return {};
  }

  return Object.fromEntries(errors.map((error) => [error.path.join('.'), error.message]));
}

function datetimeLocalValue(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.valueOf() - offset).toISOString().slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}
