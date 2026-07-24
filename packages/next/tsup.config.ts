import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const editorClientPath = fileURLToPath(new URL('./dist/editor-client.js', import.meta.url));

async function markEditorClientAsClient(): Promise<void> {
  const source = await readFile(editorClientPath, 'utf8');

  if (!source.startsWith("'use client';")) {
    await writeFile(editorClientPath, `'use client';\n${source}`, 'utf8');
  }
}

export default defineConfig((options) => ({
  // A watch rebuild must not temporarily remove declarations consumed by apps.
  clean: !options.watch,
  dts: true,
  entry: [
    'src/index.ts',
    'src/password.ts',
    'src/server.ts',
    'src/types.ts',
    'src/editor-client.tsx',
    'src/preview-banner.tsx',
  ],
  external: [
    '@pith-cms/core',
    'next',
    'react',
    'react/jsx-runtime',
    'server-only',
    './editor-client.js',
  ],
  format: ['esm'],
  onSuccess: markEditorClientAsClient,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
}));
