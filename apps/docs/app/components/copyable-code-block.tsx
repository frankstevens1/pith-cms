'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

interface CopyableCodeBlockProps {
  readonly children: ReactNode;
  readonly code: string;
  readonly language?: string | undefined;
}

export function CopyableCodeBlock({ children, code, language }: CopyableCodeBlockProps) {
  const [status, setStatus] = useState<'Copy' | 'Copied' | 'Copy failed'>('Copy');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Copied');
      window.setTimeout(() => setStatus('Copy'), 1_800);
    } catch {
      setStatus('Copy failed');
    }
  }

  return (
    <div className="copyable-code-block">
      {language ? <span className="code-language">{language}</span> : null}
      <button
        aria-live="polite"
        className="copy-button"
        onClick={() => void copyCode()}
        type="button"
      >
        {status}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
