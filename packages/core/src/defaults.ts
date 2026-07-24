import type { CollectionDefinition } from './collection.js';
import { isRecord } from './config.js';
import type { AnyFieldDefinition, FieldRecord, InferFieldsEntry } from './fields.js';

export function createDefaultEntry<TCollection extends CollectionDefinition>(
  collection: TCollection,
): Partial<InferFieldsEntry<TCollection['fields']>> {
  const result = createDefaultsForFields(collection.fields);
  return result.value as Partial<InferFieldsEntry<TCollection['fields']>>;
}

export function applyEntryDefaults<TCollection extends CollectionDefinition>(
  collection: TCollection,
  value: unknown,
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return applyDefaultsForFields(collection.fields, value).value;
}

function createDefaultsForFields(fields: FieldRecord): { readonly value: Record<string, unknown> } {
  const value: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(fields)) {
    const defaultValue = createDefaultForField(field);

    if (defaultValue.hasValue) {
      value[name] = defaultValue.value;
    }
  }

  return { value };
}

function applyDefaultsForFields(
  fields: FieldRecord,
  value: Record<string, unknown>,
): { readonly value: Record<string, unknown> } {
  const result: Record<string, unknown> = { ...value };

  for (const [name, field] of Object.entries(fields)) {
    const defaultValue = applyDefaultForField(field, result[name]);

    if (defaultValue.hasValue) {
      result[name] = defaultValue.value;
    }
  }

  return { value: result };
}

function createDefaultForField(field: AnyFieldDefinition): DefaultValue<unknown> {
  if (field.options.defaultValue !== undefined) {
    return { hasValue: true, value: cloneValue(field.options.defaultValue) };
  }

  if (field.kind === 'object') {
    const nested = createDefaultsForFields(field.options.fields);

    if (Object.keys(nested.value).length > 0) {
      return { hasValue: true, value: nested.value };
    }
  }

  return { hasValue: false };
}

function applyDefaultForField(field: AnyFieldDefinition, value: unknown): DefaultValue<unknown> {
  if (value === undefined) {
    return createDefaultForField(field);
  }

  if (field.kind === 'object' && isRecord(value)) {
    return { hasValue: true, value: applyDefaultsForFields(field.options.fields, value).value };
  }

  if (field.kind === 'list' && Array.isArray(value)) {
    return {
      hasValue: true,
      value: value.map((item) => {
        const itemValue = applyDefaultForField(field.options.item, item);
        return itemValue.hasValue ? itemValue.value : item;
      }),
    };
  }

  return { hasValue: true, value };
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

type DefaultValue<TValue> =
  | {
      readonly hasValue: true;
      readonly value: TValue;
    }
  | {
      readonly hasValue: false;
    };
