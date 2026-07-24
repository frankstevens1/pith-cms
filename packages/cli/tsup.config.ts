import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  clean: !options.watch,
  dts: true,
  entry: ['src/cli.ts'],
  external: [
    '@pith-cms/core',
    '@pith-cms/next',
    '@pith-cms/storage-filesystem',
    '@pith-cms/storage-github',
  ],
  format: ['esm'],
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
  shims: true,
}));
