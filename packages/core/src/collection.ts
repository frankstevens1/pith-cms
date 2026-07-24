import type { AnyFieldDefinition, FieldRecord, InferFieldsEntry } from './fields.js';

export type EntryFormat = 'json' | 'markdown';

export interface CollectionDefinition<TFields extends FieldRecord = FieldRecord> {
  readonly label?: string;
  readonly path: string;
  readonly format: EntryFormat;
  // Widened to `string` (versus the input's `Extract<keyof TFields, string>`) so that
  // TFields stays covariant: a concrete CollectionDefinition must remain assignable to
  // CollectionDefinition<FieldRecord> for generic helpers constrained on it.
  readonly identifierField: string;
  readonly displayField?: string;
  readonly fields: TFields;
}

export interface CollectionDefinitionInput<TFields extends FieldRecord> {
  readonly label?: string;
  readonly path: string;
  readonly format: EntryFormat;
  readonly identifierField: Extract<keyof TFields, string>;
  readonly displayField?: Extract<keyof TFields, string>;
  readonly fields: TFields;
}

export type InferCollectionEntry<TCollection> =
  TCollection extends CollectionDefinition<infer TFields> ? InferFieldsEntry<TFields> : never;

export function defineCollection<TFields extends Readonly<Record<string, AnyFieldDefinition>>>(
  definition: CollectionDefinitionInput<TFields>,
): CollectionDefinition<TFields> {
  return Object.freeze({
    ...definition,
    fields: Object.freeze({ ...definition.fields }),
  });
}
