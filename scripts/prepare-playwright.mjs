import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'apps', 'playground', '.next');

// Playwright editor flows mutate the Playground's content fixtures. Clearing
// only Next's ignored build output prevents a prior run's persistent data cache
// from leaking into the next production-build fixture.
await rm(outputDirectory, { force: true, recursive: true });
