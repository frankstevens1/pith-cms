import { pith } from './pith';

export async function getDocumentationPage(slug: string) {
  const content = await pith.content.forRequest();
  return content.getOptionalEntry('docs', slug);
}

export async function getDocumentationPages() {
  const content = await pith.content.forRequest();
  const result = await content.listEntries('docs');

  return result.entries.map((entry) => ({
    slug: entry.value.slug,
    title: entry.value.title,
    description: entry.value.description ?? '',
  }));
}
