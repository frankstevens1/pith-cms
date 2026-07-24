import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  // Keep package artifacts available to dependents during watch rebuilds.
  clean: !options.watch,
  dts: true,
  entry: ['src/index.ts'],
  external: ['@pith-cms/core'],
  format: ['esm'],
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
}));
