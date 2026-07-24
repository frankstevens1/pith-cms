import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';

export function DocumentationNav() {
  return (
    <header className="docs-nav">
      <nav aria-label="Documentation" className="docs-nav-inner">
        <Link className="wordmark" href="/">
          Pith / Docs
        </Link>
        <div className="docs-nav-links">
          <Link className="docs-nav-link" href="/quick-start">
            Start
          </Link>
          <Link className="docs-nav-link" href="/storage">
            Storage
          </Link>
          <Link className="docs-nav-link" href="/security">
            Security
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
