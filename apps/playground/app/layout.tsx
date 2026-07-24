import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { ThemeScript } from './components/theme-script';

export const metadata: Metadata = {
  title: {
    default: 'Pith — files-first CMS for Next.js',
    template: '%s · Pith',
  },
  description: 'Typed content, a protected editor, preview, and storage you control for Next.js.',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
