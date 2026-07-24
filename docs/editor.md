# Editor and preview

The editor is opt-in. It renders native controls from your collection fields and writes only through
the configured repository.

## Mount it

```tsx
// app/layout.tsx
import '@pith-cms/next/editor.css';

// app/pith/[[...pithPath]]/page.tsx
import { pith } from '@/lib/pith';
export default pith.editor.page;

// app/api/pith/[...pithRoute]/route.ts
import { pith } from '@/lib/pith';
export const { GET, POST, PUT, DELETE } = pith.editor.handlers;
```

The editor needs an auth adapter. `createPasswordAuth` accepts only a precomputed Argon2id hash and
a separate session secret. Existing identifiers are intentionally immutable.

## Save safely

Creates reject existing files. Updates and deletes require the revision loaded with the entry. If the
file changed, Pith preserves the submitted value and shows a comparison. It does not merge or force
overwrite.

The editor enforces permissions, CSRF tokens, exact trusted origins, request content type, and body
size on the server. Hiding a button never grants permission.

## Preview without saving

Configure a separate preview secret and a same-origin path resolver:

```ts
preview: {
  secret: process.env.PITH_PREVIEW_SECRET!,
  resolvePath: ({ collection, identifier }) =>
    collection === 'posts' ? `/posts/${identifier}` : null,
}
```

Use `await pith.content.forRequest()` only in public pages that should honor a valid authenticated
preview. It can overlay one unsaved create, update, or delete, or read a trusted GitHub pull-request
branch. `pith.content` always remains canonical.

Clicking **Preview** starts a preview session and shows a banner in the editor with a **View**
control. While a preview is active, the same sidebar button becomes **Exit preview**. Saving or
clicking **Exit preview** ends the session immediately and closes the tracked preview tab, so the
next public request falls back to canonical content. The banner polls the server so it disappears
automatically if the preview is disabled from another tab.

Preview sessions are short lived, user-bound, private, and noindex. They do not put unsaved content
in a URL or cookie. The default memory store is shared across all module instances in a single
process (for example, route handlers and page renders in `next dev`), so previews work reliably in
local development. Provide a shared store when running multiple processes.
