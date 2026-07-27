'use client';

import { useState } from 'react';

type Theme = 'light' | 'dark';

const storageKey = 'pith-public-theme';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    return readTheme();
  });

  function toggleTheme() {
    const nextTheme = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="public-theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      Theme: {theme}
    </button>
  );
}
