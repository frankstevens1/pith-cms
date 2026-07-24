import { pithVersion } from '@pith-cms/core';
import { pithNextVersion } from '@pith-cms/next';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
import { githubStorageVersion } from '@pith-cms/storage-github';

import { CopyableCodeBlock } from './components/copyable-code-block';
import { PublicShell } from './components/public-shell';
import { getPublicPage } from '../src/lib/public-pages';

const installCommand =
  'pnpm add @pith-cms/core @pith-cms/next @pith-cms/storage-filesystem next react react-dom server-only';

const packages = [
  ['@pith-cms/core', pithVersion],
  ['@pith-cms/next', pithNextVersion],
  ['@pith-cms/storage-filesystem', typeof createFilesystemRepository === 'function' ? 'ready' : ''],
  ['@pith-cms/storage-github', githubStorageVersion],
] as const;

const principles = [
  [
    'Define once',
    'Fields drive TypeScript inference, validation, editor controls, and canonical files.',
  ],
  [
    'Keep files portable',
    'Use ordered JSON or Markdown frontmatter. Change storage without changing content.',
  ],
  [
    'Edit with a boundary',
    'Protect mutations, require revisions, preview unsaved work, and surface conflicts.',
  ],
  [
    'Publish your way',
    'Write to a persistent volume, commit directly to GitHub, or create a pull request.',
  ],
] as const;

export default async function HomePage() {
  const page = await getPublicPage('home');

  return (
    <PublicShell>
      <section className="public-hero">
        <p className="public-eyebrow">Files-first CMS for Next.js</p>
        <h1>{page.value.title}</h1>
        {page.value.seo?.description ? (
          <p className="public-lede">{page.value.seo.description}</p>
        ) : null}
        <div className="public-actions">
          <a className="public-button public-button-primary" href="/pith">
            Open the editor
          </a>
          <a className="public-button public-button-secondary" href="/posts">
            Read live content
          </a>
        </div>
        <CopyableCodeBlock code={installCommand} />
      </section>

      <section aria-labelledby="principles-heading" className="public-section">
        <p className="public-eyebrow">What it does</p>
        <h2 className="public-section-title" id="principles-heading">
          The useful parts. Nothing hidden.
        </h2>
        <div className="public-principles">
          {principles.map(([title, description], index) => (
            <article className="public-principle" key={title}>
              <span className="public-number">0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="packages-heading" className="public-section">
        <p className="public-eyebrow">Package surface</p>
        <h2 className="public-section-title" id="packages-heading">
          Small packages. Clear boundaries.
        </h2>
        <dl className="public-package-list">
          {packages.map(([name, version]) => (
            <div className="public-package-row" key={name}>
              <dt className="public-package-name">{name}</dt>
              <dd>{version === 'ready' ? version : `v${version}`}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PublicShell>
  );
}
