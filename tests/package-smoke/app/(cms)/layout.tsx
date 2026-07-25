import type { ReactNode } from 'react';

import '@pith-cms/next/editor.css';

export default function PithLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
