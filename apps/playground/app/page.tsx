import { CopyableCodeBlock } from './components/copyable-code-block';
import { PublicShell } from './components/public-shell';
import { getPublicPage } from '../src/lib/public-pages';
import { docsUrl } from '../src/lib/site-config';

const installCommand = 'pnpm add @pith-cms/cli\npnpm pith init';

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
          <a className="public-button public-button-primary" href={`${docsUrl}/quick-start`}>
            Get started
          </a>
          <a className="public-button public-button-secondary" href="/posts">
            View content
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

      <section aria-labelledby="editor-mockup-heading" className="public-section">
        <p className="public-eyebrow">Pith editor</p>
        <h2 className="public-section-title" id="editor-mockup-heading">
          Write where your content lives.
        </h2>
        <div className="public-skeleton-row">
          <div className="public-skeleton-mockup">
            <div className="public-editor-mockup">
              <div className="editor-mockup-header">
                <div className="editor-mockup-wordmark">Pith</div>
                <div className="editor-mockup-header-end">
                  <div className="editor-mockup-avatar" />
                </div>
              </div>
              <div className="editor-mockup-body">
                <div className="editor-mockup-sidebar">
                  <div className="editor-mockup-sidebar-label">Collections</div>
                  <div className="editor-mockup-collection-row active">Pages</div>
                  <div className="editor-mockup-collection-row">Posts</div>
                  <div className="editor-mockup-collection-row">Authors</div>
                </div>
                <div className="editor-mockup-main">
                  <div className="editor-mockup-breadcrumb">Pages &frasl; home</div>
                  <div className="editor-mockup-form">
                    <div className="editor-mockup-field">
                      <div className="editor-mockup-field-label">Title</div>
                      <div className="editor-mockup-field-input">Home</div>
                    </div>
                    <div className="editor-mockup-field">
                      <div className="editor-mockup-field-label">Slug</div>
                      <div className="editor-mockup-field-input small">home</div>
                    </div>
                    <div className="editor-mockup-field">
                      <div className="editor-mockup-field-label">Description</div>
                      <div className="editor-mockup-field-textarea">A Pith site.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="public-skeleton-desc">
            <p>
              A typed content editor that reads and writes directly to your repository files. Define
              collections once — the editor generates the form. No database, no migration, no
              external service.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="cli-mockup-heading" className="public-section">
        <p className="public-eyebrow">Pith CLI</p>
        <h2 className="public-section-title" id="cli-mockup-heading">
          Scaffold and manage from the terminal.
        </h2>
        <div className="public-skeleton-row">
          <div className="public-skeleton-mockup">
            <div className="editor-mockup-terminal">
              <div>
                <span className="terminal-prompt">$</span> <span>pnpm pith init</span>
              </div>
              <div>
                <span className="terminal-success">✓ </span>
                <span>Scaffolded pith.config.ts, src/lib/pith.ts, editor routes</span>
              </div>
              <div>
                <span className="terminal-success">✓ </span>
                <span>Installed dependencies</span>
              </div>
              <div className="terminal-blank">&nbsp;</div>
              <div>
                <span className="terminal-prompt">$</span> <span>pnpm pith collection add</span>
              </div>
              <div className="terminal-dim">
                <span>{'>'} Collection name: posts</span>
              </div>
              <div className="terminal-dim">
                <span>{'>'} Fields: title, slug, publishedAt, body</span>
              </div>
              <div>
                <span className="terminal-success">✓ </span>
                <span>Added "Posts" collection and created content/posts/</span>
              </div>
              <div className="terminal-blank">&nbsp;</div>
              <div>
                <span className="terminal-prompt">$</span> <span>pnpm pith content check</span>
              </div>
              <div>
                <span className="terminal-success">✓ </span>
                <span>All content entries are valid.</span>
              </div>
            </div>
          </div>
          <div className="public-skeleton-desc">
            <p>
              Scaffold a new project, define collections interactively, and validate every entry
              against your schema — all from the terminal. No running services, no dashboards, just
              real files.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
