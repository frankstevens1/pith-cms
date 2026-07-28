import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const clientModulePaths = ['editor-client', 'markdown-editor'].map((name) =>
  fileURLToPath(new URL(`./dist/${name}.js`, import.meta.url)),
);

async function markClientModulesAsClient(): Promise<void> {
  await Promise.all(
    clientModulePaths.map(async (clientModulePath) => {
      const source = await readFile(clientModulePath, 'utf8');

      if (!source.startsWith("'use client';")) {
        await writeFile(clientModulePath, `'use client';\n${source}`, 'utf8');
      }
    }),
  );
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
    'src/markdown-editor.tsx',
    'src/preview-banner.tsx',
  ],
  external: [
    '@pith-cms/core',
    'next',
    'react',
    'react/jsx-runtime',
    'server-only',
    './editor-client.js',
    './markdown-editor.js',
  ],
  format: ['esm'],
  onSuccess: markClientModulesAsClient,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
}));
