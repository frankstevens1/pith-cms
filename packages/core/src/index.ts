import { version } from '../package.json';

export { defineCollection } from './collection.js';
export type {
  CollectionDefinition,
  CollectionDefinitionInput,
  EntryFormat,
  InferCollectionEntry,
} from './collection.js';

export { definePith, validatePithConfig } from './config.js';
export type { PithConfig } from './config.js';

export { createDefaultEntry } from './defaults.js';

export {
  ConfigurationError,
  ContentAlreadyExistsError,
  ContentNotFoundError,
  ContentParseError,
  ContentPathError,
  ContentValidationError,
  PithError,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
  UnsupportedFormatError,
} from './errors.js';
export type { PithErrorMetadata, ValidationErrorDetail } from './errors.js';

export { field } from './fields.js';
export type {
  AnyFieldDefinition,
  BaseFieldOptions,
  BooleanField,
  DateField,
  DatetimeField,
  EmailField,
  FieldDefinition,
  FieldKind,
  FieldRecord,
  FieldValue,
  InferFieldsEntry,
  ListField,
  ListFieldOptions,
  MarkdownField,
  MultiselectField,
  MultiselectFieldOptions,
  NumberField,
  NumberFieldOptions,
  ObjectField,
  ObjectFieldOptions,
  SelectField,
  SelectFieldOptions,
  SelectOption,
  SlugField,
  SlugFieldOptions,
  StringFieldOptions,
  TextField,
  TextFieldOptions,
  UrlField,
} from './fields.js';

export {
  getCollectionDirectory,
  getEntryPath,
  getIdentifierFromEntryPath,
  normalizeContentPath,
  normalizeIdentifier,
} from './path.js';

export type {
  ContentRepository,
  DeleteFileInput,
  DeleteFileResult,
  RepositoryFile,
  RepositoryFileSummary,
  RepositoryPublication,
  RepositoryPublicationReference,
  RepositoryPublicationStatus,
  RepositoryPublicationStatusReader,
  RepositoryRefReader,
  WriteFileInput,
  WriteFileResult,
} from './repository.js';
export { supportsPublicationStatus, supportsRepositoryRefs } from './repository.js';

export {
  parseJsonEntry,
  parseMarkdownEntry,
  serializeJsonEntry,
  serializeMarkdownEntry,
} from './serialization.js';
export type { ParseEntryResult } from './serialization.js';

export { createContentService } from './service.js';
export type {
  ContentEntry,
  ContentService,
  InvalidContentEntry,
  ListEntriesResult,
} from './service.js';

export { createSlug, isValidSlug } from './slug.js';

export { validateEntry } from './validation.js';
export type { ValidationError, ValidationResult } from './validation.js';

/** The package version marker also serves external integration smoke tests. */
export const pithVersion = version;
