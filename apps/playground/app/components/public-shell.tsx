import type { ReactNode } from 'react';
import Link from 'next/link';

import { pith } from '../../src/lib/pith';
import { PublicPreviewBanner } from './public-preview-banner';
import { ThemeToggle } from './theme-toggle';
import { docsUrl } from '../../src/lib/site-config';

interface PublicShellProps {
  readonly children: ReactNode;
}

export async function PublicShell({ children }: PublicShellProps) {
  const previewContext = await pith.preview?.getContext();

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <Link className="public-wordmark" href="/">
            Pith / Playground
          </Link>
          <div className="public-header-actions">
            <nav aria-label="Public site" className="public-nav">
              <Link className="public-nav-link" href="/about">
                About
              </Link>
              <Link className="public-nav-link" href="/posts">
                Notes
              </Link>
              <Link className="public-nav-link" href="/pith">
                Editor
              </Link>
            </nav>
            <a className="public-docs-link" href={docsUrl} rel="noreferrer" target="_blank">
              Docs
            </a>
          </div>
        </div>
      </header>
      <main className="public-main">{children}</main>
      {previewContext ? (
        <PublicPreviewBanner editorPath="/pith" expiresAt={previewContext.expiresAt} />
      ) : null}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <a
            className="public-footer-credit"
            href="https://www.datafluent.one"
            rel="noreferrer"
            target="_blank"
          >
            datafluent • 2026
          </a>
          <div className="public-footer-actions">
            <ThemeToggle />
            <a
              aria-label="View Pith on GitHub"
              className="public-github-link"
              href="https://github.com/frankstevens1/pith-cms"
              rel="noreferrer"
              target="_blank"
            >
              <svg aria-hidden="true" className="public-github-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.588 2 12.248c0 4.528 2.865 8.367 6.839 9.723.5.096.683-.223.683-.496 0-.245-.009-1.056-.014-1.916-2.782.619-3.369-1.223-3.369-1.223-.455-1.183-1.11-1.498-1.11-1.498-.908-.638.069-.625.069-.625 1.004.073 1.532 1.056 1.532 1.056.892 1.566 2.34 1.113 2.91.851.09-.666.349-1.113.635-1.368-2.22-.261-4.555-1.139-4.555-5.068 0-1.12.391-2.035 1.03-2.752-.104-.262-.447-1.31.098-2.732 0 0 .84-.277 2.75 1.051A9.317 9.317 0 0 1 12 6.162c.85.004 1.705.117 2.504.334 1.909-1.328 2.747-1.051 2.747-1.051.547 1.422.204 2.47.1 2.732.64.717 1.028 1.632 1.028 2.752 0 3.94-2.34 4.804-4.568 5.06.359.32.678.948.678 1.91 0 1.38-.012 2.492-.012 2.831 0 .276.18.598.688.496C19.138 20.61 22 16.774 22 12.248 22 6.588 17.523 2 12 2Z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
