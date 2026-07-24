import type { Metadata } from 'next';

import { PublicShell } from '../components/public-shell';
import { getPublicPage } from '../../src/lib/public-pages';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPage('about');

  return {
    title: page.value.title,
    description: page.value.seo?.description,
  };
}

export default async function AboutPage() {
  const page = await getPublicPage('about');

  return (
    <PublicShell>
      <article className="public-page">
        <p className="public-eyebrow">Why Pith</p>
        <h1 className="public-page-title">{page.value.title}</h1>
        {page.value.seo?.description ? (
          <p className="public-page-copy">{page.value.seo.description}</p>
        ) : null}
        <p className="public-page-copy">
          Pith does not take ownership of your content or deployment. It gives a Next.js site a
          typed content boundary, a protected editing surface, and a repository contract that stays
          useful when the storage changes.
        </p>
      </article>
    </PublicShell>
  );
}
