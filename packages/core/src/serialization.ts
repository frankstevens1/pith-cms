import { parseDocument, stringify } from 'yaml';

import type { CollectionDefinition, InferCollectionEntry } from './collection.js';
import { isRecord } from './config.js';
import { ContentParseError, ContentValidationError, UnsupportedFormatError } from './errors.js';
import type { FieldRecord } from './fields.js';
import { validateEntry } from './validation.js';

export type ParseEntryResult<TValue> =
  | {
      readonly success: true;
      readonly data: TValue;
    }
  | {
      readonly success: false;
      readonly error: ContentParseError | ContentValidationError;
    };

export function parseJsonEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  content: string,
): ParseEntryResult<InferCollectionEntry<TCollection>> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripByteOrderMark(content));
  } catch {
    return {
      success: false,
      error: new ContentParseError('Content is not valid JSON.'),
    };
  }

  const result = validateEntry({ collection, value: parsed });

  if (result.success) {
    return result;
  }

  return {
    success: false,
    error: new ContentValidationError('JSON content failed validation.', result.errors),
  };
}

export function serializeJsonEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  value: unknown,
): string {
  const data = validateForSerialization(collection, value);
  return `${JSON.stringify(orderFields(collection.fields, data), null, 2)}\n`;
}

export function parseMarkdownEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  content: string,
): ParseEntryResult<InferCollectionEntry<TCollection>> {
  const bodyField = getMarkdownBodyField(collection);
  const normalizedContent = normalizeLineEndings(stripByteOrderMark(content));
  const match = /^---\n([\s\S]*?)\n---(?:\n\n([\s\S]*)|\n?)$/.exec(normalizedContent);

  if (!match) {
    return {
      success: false,
      error: new ContentParseError('Markdown content must begin with valid YAML frontmatter.'),
    };
  }

  const [frontmatterSource, body = ''] = [match[1] ?? '', match[2]];
  const document = parseDocument(frontmatterSource, { schema: 'core' });

  if (document.errors.length > 0) {
    return {
      success: false,
      error: new ContentParseError('Markdown frontmatter is not valid YAML.'),
    };
  }

  const frontmatter = document.toJS();

  if (frontmatter !== null && frontmatter !== undefined && !isRecord(frontmatter)) {
    return {
      success: false,
      error: new ContentParseError('Markdown frontmatter must be a mapping of field values.'),
    };
  }

  if (frontmatter && bodyField in frontmatter) {
    return {
      success: false,
      error: new ContentParseError(
        `Markdown body field "${bodyField}" must not appear in frontmatter.`,
      ),
    };
  }

  const result = validateEntry({
    collection,
    value: {
      ...(frontmatter ?? {}),
      [bodyField]: body,
    },
  });

  if (result.success) {
    return result;
  }

  return {
    success: false,
    error: new ContentValidationError('Markdown content failed validation.', result.errors),
  };
}

export function serializeMarkdownEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  value: unknown,
): string {
  const bodyField = getMarkdownBodyField(collection);
  const data = validateForSerialization(collection, value);
  const body = data[bodyField];

  if (typeof body !== 'string') {
    throw new ContentValidationError('Markdown body must be a string.', [
      {
        code: 'invalid_type',
        path: [bodyField],
        message: 'Markdown body must be a string.',
      },
    ]);
  }

  const frontmatter = orderFields(collection.fields, data, bodyField);
  const serializedFrontmatter =
    Object.keys(frontmatter).length === 0
      ? ''
      : stringify(frontmatter, { lineWidth: 0, sortMapEntries: false });
  const normalizedBody = normalizeLineEndings(body);
  const prefix = `---\n${serializedFrontmatter}---\n`;

  if (normalizedBody.length === 0) {
    return prefix;
  }

  return `${prefix}\n${normalizedBody.endsWith('\n') ? normalizedBody : `${normalizedBody}\n`}`;
}

export function parseEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  content: string,
): ParseEntryResult<InferCollectionEntry<TCollection>> {
  if (collection.format === 'json') {
    return parseJsonEntry(collection, content);
  }

  if (collection.format === 'markdown') {
    return parseMarkdownEntry(collection, content);
  }

  return {
    success: false,
    error: new ContentParseError(`Unsupported entry format "${String(collection.format)}".`),
  };
}

export function serializeEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
  value: unknown,
): string {
  if (collection.format === 'json') {
    return serializeJsonEntry(collection, value);
  }

  if (collection.format === 'markdown') {
    return serializeMarkdownEntry(collection, value);
  }

  throw new UnsupportedFormatError(`Unsupported entry format "${String(collection.format)}".`);
}

function validateForSerialization<TCollection extends CollectionDefinition>(
  collection: TCollection,
  value: unknown,
): Record<string, unknown> {
  const result = validateEntry({ collection, value });

  if (!result.success) {
    throw new ContentValidationError(
      'Content failed validation before serialization.',
      result.errors,
    );
  }

  return result.data as Record<string, unknown>;
}

function getMarkdownBodyField(collection: CollectionDefinition): string {
  const fields = Object.entries(collection.fields).filter(
    ([, definition]) => definition.kind === 'markdown',
  );

  if (fields.length !== 1) {
    throw new UnsupportedFormatError(
      'Markdown collections require exactly one markdown body field.',
    );
  }

  const bodyField = fields[0]?.[0];

  if (!bodyField) {
    throw new UnsupportedFormatError('Markdown collections require a named markdown body field.');
  }

  return bodyField;
}

function orderFields(
  fields: FieldRecord,
  value: Record<string, unknown>,
  excludedField?: string,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(fields)) {
    if (name !== excludedField && value[name] !== undefined) {
      ordered[name] = orderFieldValue(field, value[name]);
    }
  }

  return ordered;
}

function orderFieldValue(field: FieldRecord[string], value: unknown): unknown {
  if (field.kind === 'object' && isRecord(value)) {
    return orderFields(field.options.fields, value);
  }

  if (field.kind === 'list' && Array.isArray(value)) {
    return value.map((item) => orderFieldValue(field.options.item, item));
  }

  return value;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function stripByteOrderMark(value: string): string {
  return value.startsWith('\uFEFF') ? value.slice(1) : value;
}
