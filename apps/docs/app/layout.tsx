import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { DocumentationNav } from './components/documentation-nav';
import { ThemeScript } from './components/theme-script';

export const metadata: Metadata = {
  title: {
    default: 'Pith documentation',
    template: '%s · Pith',
  },
  description: 'Direct documentation for Pith, the files-first CMS toolkit for Next.js.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <DocumentationNav />
        <div className="docs-shell">{children}</div>
      </body>
    </html>
  );
}
