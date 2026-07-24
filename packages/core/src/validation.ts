import type { ZodError } from 'zod';

import type { CollectionDefinition, InferCollectionEntry } from './collection.js';
import { applyEntryDefaults } from './defaults.js';
import type { ValidationErrorDetail } from './errors.js';
import { compileCollectionSchema } from './schema.js';

export type ValidationError = ValidationErrorDetail;

export type ValidationResult<TValue> =
  | {
      readonly success: true;
      readonly data: TValue;
    }
  | {
      readonly success: false;
      readonly errors: readonly ValidationError[];
    };

export function validateEntry<TCollection extends CollectionDefinition>({
  collection,
  value,
}: {
  readonly collection: TCollection;
  readonly value: unknown;
}): ValidationResult<InferCollectionEntry<TCollection>> {
  const result = compileCollectionSchema(collection).safeParse(
    applyEntryDefaults(collection, value),
  );

  if (result.success) {
    return {
      success: true,
      data: result.data as InferCollectionEntry<TCollection>,
    };
  }

  return {
    success: false,
    errors: toValidationErrors(result.error),
  };
}

export function toValidationErrors(error: ZodError): readonly ValidationError[] {
  return error.issues.flatMap((issue) => {
    const path = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    );

    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        code: 'unrecognized_key',
        path: [...path, key],
        message: `Unknown field "${key}".`,
      }));
    }

    return [
      {
        code: validationCode(issue.code),
        path,
        message: issue.message,
      },
    ];
  });
}

function validationCode(code: string): string {
  switch (code) {
    case 'too_small':
    case 'too_big':
    case 'invalid_type':
    case 'invalid_format':
    case 'invalid_value':
    case 'custom':
      return code;
    default:
      return 'invalid_value';
  }
}
