import type { ReactNode } from 'react';

import '../globals.css';
import { DocumentationNav } from '../components/documentation-nav';

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main>
      <DocumentationNav />
      <div className="docs-shell">{children}</div>
    </main>
  );
}
