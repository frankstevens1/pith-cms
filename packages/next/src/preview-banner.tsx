import 'server-only';

import type { PithPreview } from './types.js';

/**
 * Optional server component for consumer layouts. It deliberately receives a
 * Pith preview instance instead of relying on global state, so multiple Pith
 * instances cannot leak preview context into one another.
 */
export async function PithPreviewBanner({
  preview,
  editorPath = '/pith',
}: {
  readonly preview?: PithPreview;
  readonly editorPath?: string;
}) {
  const context = await preview?.getContext();

  if (!context) {
    return null;
  }

  const source =
    context.source.type === 'entry-overlay' ? 'unsaved changes' : 'a repository review';

  return (
    <aside aria-live="polite" data-pith-preview="active" role="status">
      <strong>Preview mode is active.</strong> You are viewing {source}; it expires at{' '}
      <time dateTime={context.expiresAt}>{context.expiresAt}</time>.{' '}
      <a href={editorPath}>Return to Pith to exit preview</a>
    </aside>
  );
}
