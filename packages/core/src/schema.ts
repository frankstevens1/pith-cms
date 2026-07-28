import { z } from 'zod';

import type { CollectionDefinition } from './collection.js';
import { assertPublicName, isRecord } from './config.js';
import { ConfigurationError } from './errors.js';
import type {
  AnyFieldDefinition,
  FieldRecord,
  ListFieldOptions,
  MarkdownDialect,
  MarkdownEditorFeature,
  MarkdownFieldOptions,
  MultiselectFieldOptions,
  NumberFieldOptions,
  ObjectFieldOptions,
  SelectFieldOptions,
  SlugFieldOptions,
  StringFieldOptions,
  TextFieldOptions,
} from './fields.js';
import { isValidSlug } from './slug.js';

const collectionSchemaCache = new WeakMap<object, z.ZodType>();

const MARKDOWN_DIALECTS = new Set<MarkdownDialect>(['commonmark', 'gfm']);
const MARKDOWN_EDITOR_FEATURES = new Set<MarkdownEditorFeature>([
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'strong',
  'emphasis',
  'strikethrough',
  'link',
  'image',
  'blockquote',
  'unordered-list',
  'ordered-list',
  'task-list',
  'inline-code',
  'code-block',
  'horizontal-rule',
  'table',
  'html',
]);
const GFM_MARKDOWN_FEATURES = new Set<MarkdownEditorFeature>([
  'strikethrough',
  'task-list',
  'table',
]);

interface CompileOptions {
  readonly allowOptional: boolean;
  readonly applyDefault: boolean;
}

const requiredFieldOptions: CompileOptions = {
  allowOptional: false,
  applyDefault: false,
};

const entryFieldOptions: CompileOptions = {
  allowOptional: true,
  applyDefault: true,
};

export function validateCollectionDefinition(name: string, collection: CollectionDefinition): void {
  if (collection.format !== 'json' && collection.format !== 'markdown') {
    throw new ConfigurationError(`Collection "${name}" must use the "json" or "markdown" format.`);
  }

  if (!isRecord(collection.fields) || Object.keys(collection.fields).length === 0) {
    throw new ConfigurationError(`Collection "${name}" must define at least one field.`);
  }

  if (typeof collection.identifierField !== 'string' || collection.identifierField.length === 0) {
    throw new ConfigurationError(`Collection "${name}" must define an identifierField.`);
  }

  if (!(collection.identifierField in collection.fields)) {
    throw new ConfigurationError(
      `Collection "${name}" identifierField "${collection.identifierField}" does not exist in fields.`,
    );
  }

  if (collection.displayField !== undefined) {
    const displayField = collection.fields[collection.displayField];

    if (!displayField) {
      throw new ConfigurationError(
        `Collection "${name}" displayField "${collection.displayField}" does not exist in fields.`,
      );
    }

    if (!isEditorDisplayField(displayField)) {
      throw new ConfigurationError(
        `Collection "${name}" displayField must refer to a scalar text, number, date, datetime, slug, URL, email, or select field.`,
      );
    }
  }

  for (const [fieldName, definition] of Object.entries(collection.fields)) {
    assertPublicName(fieldName, 'Field');
    validateFieldDefinition(definition, `Collection "${name}" field "${fieldName}"`);
  }

  const markdownFields = Object.entries(collection.fields).filter(
    ([, definition]) => definition.kind === 'markdown',
  );

  if (collection.format === 'markdown' && markdownFields.length !== 1) {
    throw new ConfigurationError(
      `Markdown collection "${name}" must define exactly one markdown body field.`,
    );
  }

  if (collection.format === 'json' && markdownFields.length > 1) {
    throw new ConfigurationError(`Collection "${name}" may define at most one markdown field.`);
  }

  assertDefaultValues(collection.fields, `Collection "${name}"`);
}

export function compileCollectionSchema(collection: CollectionDefinition): z.ZodType {
  const cached = collectionSchemaCache.get(collection);

  if (cached) {
    return cached;
  }

  const shape: Record<string, z.ZodType> = {};

  for (const [name, definition] of Object.entries(collection.fields)) {
    shape[name] = compileFieldSchema(definition, entryFieldOptions);
  }

  const schema = z.object(shape).strict();
  collectionSchemaCache.set(collection, schema);
  return schema;
}

export function compileFieldSchema(
  definition: AnyFieldDefinition,
  options: CompileOptions = entryFieldOptions,
): z.ZodType {
  const schema = compileRequiredFieldSchema(definition);
  const hasDefault = definition.options.defaultValue !== undefined;

  if (options.applyDefault && hasDefault) {
    return schema.default(cloneValue(definition.options.defaultValue));
  }

  if (options.allowOptional && definition.options.required !== true) {
    return schema.optional();
  }

  return schema;
}

function compileRequiredFieldSchema(definition: AnyFieldDefinition): z.ZodType {
  switch (definition.kind) {
    case 'text':
    case 'markdown':
      return compileStringSchema(definition.options as TextFieldOptions, fieldLabel(definition));
    case 'slug':
      return compileStringSchema(
        definition.options as StringFieldOptions,
        fieldLabel(definition),
      ).refine(isValidSlug, {
        error: `${fieldLabel(definition)} must be a lowercase slug using letters, digits, and single hyphens.`,
      });
    case 'url':
      return compileStringSchema(
        definition.options as StringFieldOptions,
        fieldLabel(definition),
      ).refine(isValidHttpUrl, {
        error: `${fieldLabel(definition)} must be a valid HTTP or HTTPS URL.`,
      });
    case 'email':
      return compileStringSchema(
        definition.options as StringFieldOptions,
        fieldLabel(definition),
      ).refine(isValidEmail, {
        error: `Enter a valid email address for ${fieldLabel(definition)}.`,
      });
    case 'date':
      return compileStringSchema(
        definition.options as StringFieldOptions,
        fieldLabel(definition),
      ).refine(isCanonicalDate, {
        error: `${fieldLabel(definition)} must use the YYYY-MM-DD format.`,
      });
    case 'datetime':
      return compileStringSchema(
        definition.options as StringFieldOptions,
        fieldLabel(definition),
      ).refine(isCanonicalDatetime, {
        error: `${fieldLabel(definition)} must use an ISO 8601 UTC timestamp.`,
      });
    case 'number':
      return compileNumberSchema(definition.options as NumberFieldOptions, fieldLabel(definition));
    case 'boolean':
      return z.boolean({ error: `${fieldLabel(definition)} must be true or false.` });
    case 'select':
      return compileSelectSchema(definition.options as SelectFieldOptions, fieldLabel(definition));
    case 'multiselect':
      return compileMultiselectSchema(
        definition.options as MultiselectFieldOptions,
        fieldLabel(definition),
      );
    case 'object':
      return compileObjectSchema(definition.options as ObjectFieldOptions);
    case 'list':
      return compileListSchema(definition.options as ListFieldOptions, fieldLabel(definition));
    default:
      throw new ConfigurationError('Unsupported field type.');
  }
}

function isEditorDisplayField(definition: AnyFieldDefinition): boolean {
  return (
    definition.kind === 'text' ||
    definition.kind === 'number' ||
    definition.kind === 'date' ||
    definition.kind === 'datetime' ||
    definition.kind === 'slug' ||
    definition.kind === 'url' ||
    definition.kind === 'email' ||
    definition.kind === 'select'
  );
}

function compileStringSchema(options: StringFieldOptions, label: string): z.ZodString {
  let schema = z.string({ error: `${label} must be a string.` });

  if (options.minLength !== undefined) {
    schema = schema.min(options.minLength, {
      error: `${label} must contain at least ${options.minLength} characters.`,
    });
  }

  if (options.maxLength !== undefined) {
    schema = schema.max(options.maxLength, {
      error: `${label} must contain at most ${options.maxLength} characters.`,
    });
  }

  return schema;
}

function compileNumberSchema(options: NumberFieldOptions, label: string): z.ZodNumber {
  let schema = z
    .number({ error: `${label} must be a number.` })
    .finite({ error: `${label} must be finite.` });

  if (options.integer) {
    schema = schema.int({ error: `${label} must be an integer.` });
  }

  if (options.min !== undefined) {
    schema = schema.min(options.min, { error: `${label} must be at least ${options.min}.` });
  }

  if (options.max !== undefined) {
    schema = schema.max(options.max, { error: `${label} must be at most ${options.max}.` });
  }

  return schema;
}

function compileSelectSchema(options: SelectFieldOptions, label: string): z.ZodType {
  const values = new Set(options.options.map((option) => option.value));

  return z.string({ error: `${label} must be a string.` }).refine((value) => values.has(value), {
    error: `${label} must use one of the configured options.`,
  });
}

function compileMultiselectSchema(options: MultiselectFieldOptions, label: string): z.ZodType {
  const values = new Set(options.options.map((option) => option.value));
  let schema = z
    .array(
      z.string({ error: `${label} values must be strings.` }).refine((value) => values.has(value), {
        error: `${label} values must use configured options.`,
      }),
      { error: `${label} must be a list.` },
    )
    .superRefine((items, context) => {
      if (new Set(items).size !== items.length) {
        context.addIssue({
          code: 'custom',
          message: `${label} must not include duplicate values.`,
        });
      }
    });

  if (options.minLength !== undefined) {
    schema = schema.min(options.minLength, {
      error: `${label} must include at least ${options.minLength} values.`,
    });
  }

  if (options.maxLength !== undefined) {
    schema = schema.max(options.maxLength, {
      error: `${label} must include at most ${options.maxLength} values.`,
    });
  }

  return schema;
}

function compileObjectSchema(options: ObjectFieldOptions): z.ZodType {
  const shape: Record<string, z.ZodType> = {};

  for (const [name, definition] of Object.entries(options.fields)) {
    shape[name] = compileFieldSchema(definition, entryFieldOptions);
  }

  return z.object(shape).strict();
}

function compileListSchema(options: ListFieldOptions, label: string): z.ZodType {
  let schema = z.array(compileFieldSchema(options.item, requiredFieldOptions), {
    error: `${label} must be a list.`,
  });

  if (options.minLength !== undefined) {
    schema = schema.min(options.minLength, {
      error: `${label} must include at least ${options.minLength} items.`,
    });
  }

  if (options.maxLength !== undefined) {
    schema = schema.max(options.maxLength, {
      error: `${label} must include at most ${options.maxLength} items.`,
    });
  }

  return schema;
}

function validateFieldDefinition(
  definition: unknown,
  location: string,
): asserts definition is AnyFieldDefinition {
  if (
    !isRecord(definition) ||
    typeof definition.kind !== 'string' ||
    !isRecord(definition.options)
  ) {
    throw new ConfigurationError(`${location} must be created with a Pith field definition.`);
  }

  const field = definition as unknown as AnyFieldDefinition;

  if (!FIELD_KINDS.has(field.kind)) {
    throw new ConfigurationError(`${location} has unsupported field type "${field.kind}".`);
  }

  validateBaseOptions(field.options, location);

  if (isStringField(field)) {
    validateStringOptions(field.options as unknown as StringFieldOptions, location);
  }

  if (field.kind === 'markdown') {
    validateMarkdownEditorOptions(field.options as MarkdownFieldOptions, location);
  }

  if (
    field.kind === 'slug' &&
    (field.options as SlugFieldOptions).source !== undefined &&
    typeof (field.options as SlugFieldOptions).source !== 'string'
  ) {
    throw new ConfigurationError(`${location} source must be a string.`);
  }

  if (field.kind === 'number') {
    validateNumberOptions(field.options as NumberFieldOptions, location);
  }

  if (field.kind === 'select' || field.kind === 'multiselect') {
    validateSelectOptions(field.options as SelectFieldOptions, location);
  }

  if (field.kind === 'multiselect') {
    validateListBounds(field.options as MultiselectFieldOptions, location);
  }

  if (field.kind === 'object') {
    const options = field.options as ObjectFieldOptions;

    if (!isRecord(options.fields) || Object.keys(options.fields).length === 0) {
      throw new ConfigurationError(`${location} object fields must not be empty.`);
    }

    for (const [fieldName, child] of Object.entries(options.fields)) {
      assertPublicName(fieldName, 'Field');
      validateFieldDefinition(child, `${location}.${fieldName}`);
    }
  }

  if (field.kind === 'list') {
    const options = field.options as ListFieldOptions;

    if (!options.item) {
      throw new ConfigurationError(`${location} list fields must define an item field.`);
    }

    validateListBounds(options, location);
    validateFieldDefinition(options.item, `${location} item`);
  }
}

function assertDefaultValues(fields: FieldRecord, location: string): void {
  for (const [name, field] of Object.entries(fields)) {
    if (field.options.defaultValue !== undefined) {
      const result = compileFieldSchema(field, requiredFieldOptions).safeParse(
        field.options.defaultValue,
      );

      if (!result.success) {
        throw new ConfigurationError(`${location} field "${name}" has an invalid default value.`);
      }
    }

    if (field.kind === 'object') {
      assertDefaultValues(field.options.fields, `${location} field "${name}"`);
    }
  }
}

function validateBaseOptions(options: object, location: string): void {
  const values = options as Record<string, unknown>;

  for (const name of ['label', 'description']) {
    if (values[name] !== undefined && typeof values[name] !== 'string') {
      throw new ConfigurationError(`${location} ${name} must be a string.`);
    }
  }

  if (values.required !== undefined && typeof values.required !== 'boolean') {
    throw new ConfigurationError(`${location} required must be a boolean.`);
  }
}

function validateStringOptions(options: StringFieldOptions, location: string): void {
  validateLengthBounds(options, location);
}

function validateMarkdownEditorOptions(options: MarkdownFieldOptions, location: string): void {
  if (options.editor === undefined) {
    return;
  }

  if (!isRecord(options.editor)) {
    throw new ConfigurationError(`${location} editor must be an object.`);
  }

  const dialect = options.editor.dialect ?? 'commonmark';

  if (typeof dialect !== 'string' || !MARKDOWN_DIALECTS.has(dialect as MarkdownDialect)) {
    throw new ConfigurationError(`${location} editor dialect must be "commonmark" or "gfm".`);
  }

  if (!Array.isArray(options.editor.features)) {
    throw new ConfigurationError(`${location} editor features must be an array.`);
  }

  const seen = new Set<MarkdownEditorFeature>();

  for (const feature of options.editor.features) {
    if (
      typeof feature !== 'string' ||
      !MARKDOWN_EDITOR_FEATURES.has(feature as MarkdownEditorFeature)
    ) {
      throw new ConfigurationError(`${location} editor has unsupported Markdown feature.`);
    }

    const markdownFeature = feature as MarkdownEditorFeature;

    if (seen.has(markdownFeature)) {
      throw new ConfigurationError(`${location} editor features must be unique.`);
    }

    if (dialect !== 'gfm' && GFM_MARKDOWN_FEATURES.has(markdownFeature)) {
      throw new ConfigurationError(
        `${location} editor feature "${markdownFeature}" requires the "gfm" dialect.`,
      );
    }

    seen.add(markdownFeature);
  }

  if (seen.has('task-list') && !seen.has('unordered-list') && !seen.has('ordered-list')) {
    throw new ConfigurationError(
      `${location} editor feature "task-list" requires "unordered-list" or "ordered-list".`,
    );
  }
}

function validateNumberOptions(options: NumberFieldOptions, location: string): void {
  for (const [name, value] of [
    ['min', options.min],
    ['max', options.max],
  ] as const) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new ConfigurationError(`${location} ${name} must be a finite number.`);
    }
  }

  if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
    throw new ConfigurationError(`${location} min cannot exceed max.`);
  }

  if (options.integer !== undefined && typeof options.integer !== 'boolean') {
    throw new ConfigurationError(`${location} integer must be a boolean.`);
  }
}

function validateSelectOptions(options: SelectFieldOptions, location: string): void {
  if (!Array.isArray(options.options) || options.options.length === 0) {
    throw new ConfigurationError(`${location} must define at least one select option.`);
  }

  const seen = new Set<string>();

  for (const option of options.options) {
    if (!isRecord(option) || typeof option.label !== 'string' || typeof option.value !== 'string') {
      throw new ConfigurationError(
        `${location} options require string label and value properties.`,
      );
    }

    if (option.value.length === 0 || seen.has(option.value)) {
      throw new ConfigurationError(`${location} option values must be non-empty and unique.`);
    }

    seen.add(option.value);
  }
}

function validateLengthBounds(
  options: Pick<StringFieldOptions, 'minLength' | 'maxLength'>,
  location: string,
): void {
  validateBounds(options, location, 'minLength', 'maxLength');
}

function validateListBounds(
  options: Pick<ListFieldOptions, 'minLength' | 'maxLength'>,
  location: string,
): void {
  validateBounds(options, location, 'minLength', 'maxLength');
}

function validateBounds(
  options: Partial<Record<'minLength' | 'maxLength', number>>,
  location: string,
  minName: 'minLength',
  maxName: 'maxLength',
): void {
  for (const name of [minName, maxName]) {
    const value = options[name];

    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new ConfigurationError(`${location} ${name} must be a non-negative integer.`);
    }
  }

  if (
    options[minName] !== undefined &&
    options[maxName] !== undefined &&
    options[minName] > options[maxName]
  ) {
    throw new ConfigurationError(`${location} ${minName} cannot exceed ${maxName}.`);
  }
}

function fieldLabel(field: AnyFieldDefinition): string {
  return field.options.label ?? field.kind.charAt(0).toUpperCase() + field.kind.slice(1);
}

function isStringField(field: AnyFieldDefinition): boolean {
  return (
    field.kind === 'text' ||
    field.kind === 'markdown' ||
    field.kind === 'slug' ||
    field.kind === 'url' ||
    field.kind === 'email' ||
    field.kind === 'date' ||
    field.kind === 'datetime'
  );
}

function isCanonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isCanonicalDatetime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cloneValue<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as TValue;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as TValue;
  }

  return value;
}

const FIELD_KINDS = new Set<string>([
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'slug',
  'url',
  'email',
  'select',
  'multiselect',
  'markdown',
  'object',
  'list',
]);
