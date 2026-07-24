'use client';

import { useState } from 'react';

interface CopyableCodeBlockProps {
  readonly code: string;
}

export function CopyableCodeBlock({ code }: CopyableCodeBlockProps) {
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
    <div className="public-code-block">
      <button
        aria-live="polite"
        className="public-copy-button"
        onClick={() => void copyCode()}
        type="button"
      >
        {status}
      </button>
      <pre>{code}</pre>
    </div>
  );
}
