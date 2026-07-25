import type { ReactNode } from 'react';
import { PithPreviewBanner } from '@pith-cms/next/preview';

import { pith } from '../src/lib/pith';

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PithPreviewBanner {...(pith.preview === undefined ? {} : { preview: pith.preview })} />
      </body>
    </html>
  );
}
