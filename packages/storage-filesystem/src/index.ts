import { version } from '../package.json';

export { createFilesystemRepository } from './repository.js';
export type { FilesystemRepositoryOptions } from './repository.js';

export const filesystemStorageVersion = version;
