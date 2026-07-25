import Link from 'next/link';

import { getDocumentationPages } from '../../src/lib/documentation';

export default async function DocumentationHomePage() {
  const documentationPages = await getDocumentationPages();

  return (
    <main className="docs-page">
      <section className="docs-hero">
        <p className="eyebrow">Pith documentation</p>
        <h1>Content in files.</h1>
        <p className="lede">
          Define content once, read it with types, and choose the storage that fits your deployment.
        </p>
        <Link className="button button-primary" href="/quick-start">
          Start locally
        </Link>
      </section>

      <section aria-labelledby="guides-heading" className="docs-index-section">
        <div className="section-heading">
          <p className="eyebrow">Guides</p>
          <h2 id="guides-heading">Only the parts you need.</h2>
        </div>
        <div className="docs-index-list">
          {documentationPages.map((page, index) => (
            <Link className="docs-index-link" href={`/${page.slug}`} key={page.slug}>
              <span className="docs-index-number">0{index + 1}</span>
              <span>
                <strong>{page.title}</strong>
                <span>{page.description}</span>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-note">
        <p>
          Pith is for Next.js App Router sites on the Node.js runtime. It is not a hosted CMS, media
          library, database, or deployment service.
        </p>
      </section>
    </main>
  );
}
