import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  // Keep the last valid declarations available while a watcher rebuilds. This
  // prevents dependent package watchers from resolving an empty dist folder.
  clean: !options.watch,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
}));
