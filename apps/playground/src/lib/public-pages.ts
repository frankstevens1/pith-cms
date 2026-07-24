import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { pith } from './pith';

/**
 * Playground policy: unpublished pages stay editable in Pith but are not
 * public. A matching authenticated preview overlay remains visible so editors
 * can review a change before saving it.
 */
export async function getPublicPage(identifier: string) {
  // These routes support authenticated previews and publication changes, so
  // their shell must be rendered for the current request rather than reused
  // from the build-time route cache. Pith's entry cache remains available.
  await connection();
  const content = await pith.content.forRequest();
  const page = await content.getEntry('pages', identifier);

  if (page.value.published !== true && page.preview === undefined) {
    notFound();
  }

  return page;
}
