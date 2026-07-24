'use client';

interface PublicPreviewBannerProps {
  readonly expiresAt: string;
  readonly editorPath: string;
}

export function PublicPreviewBanner({ expiresAt, editorPath }: PublicPreviewBannerProps) {
  async function exit() {
    try {
      const csrfResponse = await fetch('/api/pith/csrf');
      const csrf = (await csrfResponse.json()) as { token?: string };

      if (csrf.token) {
        await fetch('/api/pith/preview/disable', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ csrfToken: csrf.token }),
        });
      }
    } catch {
      // Ignore errors and still try to close the preview tab.
    }

    const opener = window.opener;

    if (opener && !opener.closed) {
      opener.focus();
      window.close();
      return;
    }

    window.location.href = editorPath;
  }

  return (
    <aside aria-live="polite" data-pith-preview="active" role="status">
      <strong>Preview mode is active.</strong> Expires at{' '}
      <time dateTime={expiresAt}>{expiresAt}</time>.{' '}
      <button onClick={() => void exit()} type="button">
        Exit preview
      </button>
    </aside>
  );
}
