export type FieldKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'slug'
  | 'url'
  | 'email'
  | 'select'
  | 'multiselect'
  | 'markdown'
  | 'object'
  | 'list';

export interface BaseFieldOptions<TValue = unknown> {
  readonly label?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly defaultValue?: TValue;
}

declare const fieldValue: unique symbol;

export interface FieldDefinition<
  TValue = unknown,
  TOptions extends BaseFieldOptions = BaseFieldOptions,
  TKind extends FieldKind = FieldKind,
> {
  readonly kind: TKind;
  readonly options: TOptions;
  readonly [fieldValue]?: TValue;
}

export interface TextFieldOptions extends BaseFieldOptions<string> {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly multiline?: boolean;
}

export interface NumberFieldOptions extends BaseFieldOptions<number> {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface StringFieldOptions extends BaseFieldOptions<string> {
  readonly minLength?: number;
  readonly maxLength?: number;
}

export type MarkdownDialect = 'commonmark' | 'gfm';

export type MarkdownEditorFeature =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'strong'
  | 'emphasis'
  | 'strikethrough'
  | 'link'
  | 'image'
  | 'blockquote'
  | 'unordered-list'
  | 'ordered-list'
  | 'task-list'
  | 'inline-code'
  | 'code-block'
  | 'horizontal-rule'
  | 'table'
  | 'html';

export interface MarkdownEditorOptions {
  readonly dialect?: MarkdownDialect;
  readonly features: readonly MarkdownEditorFeature[];
}

export interface MarkdownFieldOptions extends StringFieldOptions {
  /** Authoring hints only; rendering and content validation remain consumer-owned. */
  readonly editor?: MarkdownEditorOptions;
}

/**
 * Metadata for editor integrations. It identifies the field from which a
 * future editor may suggest a slug; validation and persistence never mutate
 * a supplied slug.
 */
export interface SlugFieldOptions extends StringFieldOptions {
  readonly source?: string;
}

export interface SelectOption<TValue extends string = string> {
  readonly label: string;
  readonly value: TValue;
}

export interface SelectFieldOptions<
  TOptions extends readonly SelectOption[] = readonly SelectOption[],
> extends BaseFieldOptions<SelectOptionValue<TOptions>> {
  readonly options: TOptions;
}

export interface MultiselectFieldOptions<
  TOptions extends readonly SelectOption[] = readonly SelectOption[],
> extends BaseFieldOptions<ReadonlyArray<SelectOptionValue<TOptions>>> {
  readonly options: TOptions;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface ObjectFieldOptions<
  TFields extends FieldRecord = FieldRecord,
> extends BaseFieldOptions<InferFieldsEntry<TFields>> {
  readonly fields: TFields;
}

export interface ListFieldOptions<
  TItem extends AnyFieldDefinition = AnyFieldDefinition,
> extends BaseFieldOptions<ReadonlyArray<FieldValue<TItem>>> {
  readonly item: TItem;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export type TextField<TOptions extends TextFieldOptions = TextFieldOptions> = FieldDefinition<
  string,
  TOptions,
  'text'
>;
export type NumberField<TOptions extends NumberFieldOptions = NumberFieldOptions> = FieldDefinition<
  number,
  TOptions,
  'number'
>;
export type BooleanField<TOptions extends BaseFieldOptions<boolean> = BaseFieldOptions<boolean>> =
  FieldDefinition<boolean, TOptions, 'boolean'>;
export type DateField<TOptions extends StringFieldOptions = StringFieldOptions> = FieldDefinition<
  string,
  TOptions,
  'date'
>;
export type DatetimeField<TOptions extends StringFieldOptions = StringFieldOptions> =
  FieldDefinition<string, TOptions, 'datetime'>;
export type SlugField<TOptions extends SlugFieldOptions = SlugFieldOptions> = FieldDefinition<
  string,
  TOptions,
  'slug'
>;
export type UrlField<TOptions extends StringFieldOptions = StringFieldOptions> = FieldDefinition<
  string,
  TOptions,
  'url'
>;
export type EmailField<TOptions extends StringFieldOptions = StringFieldOptions> = FieldDefinition<
  string,
  TOptions,
  'email'
>;
export type MarkdownField<TOptions extends MarkdownFieldOptions = MarkdownFieldOptions> =
  FieldDefinition<string, TOptions, 'markdown'>;
export type SelectField<TOptions extends SelectFieldOptions = SelectFieldOptions> = FieldDefinition<
  SelectOptionValue<TOptions['options']>,
  TOptions,
  'select'
>;
export type MultiselectField<TOptions extends MultiselectFieldOptions = MultiselectFieldOptions> =
  FieldDefinition<ReadonlyArray<SelectOptionValue<TOptions['options']>>, TOptions, 'multiselect'>;
export type ObjectField<
  TFields extends FieldRecord,
  TOptions extends ObjectFieldOptions<TFields>,
> = FieldDefinition<InferFieldsEntry<TFields>, TOptions, 'object'>;
export type ListField<
  TItem extends AnyFieldDefinition,
  TOptions extends ListFieldOptions<TItem>,
> = FieldDefinition<ReadonlyArray<FieldValue<TItem>>, TOptions, 'list'>;

export type FieldValue<TField> = TField extends ObjectFieldDefinition
  ? InferFieldsEntry<TField['options']['fields']>
  : TField extends ListFieldDefinition
    ? ReadonlyArray<FieldValue<TField['options']['item']>>
    : TField extends FieldDefinition<infer TValue, BaseFieldOptions, FieldKind>
      ? TValue
      : never;

type SelectOptionValue<TOptions extends readonly SelectOption[]> =
  TOptions[number] extends SelectOption<infer TValue extends string> ? TValue : string;

type IsFieldPresent<TField> = TField extends { readonly options: infer TOptions }
  ? TOptions extends { readonly required: true }
    ? true
    : TOptions extends { readonly defaultValue: unknown }
      ? true
      : TField extends {
            readonly kind: 'object';
            readonly options: { readonly fields: infer TFields };
          }
        ? TFields extends FieldRecord
          ? HasConfiguredDefault<TFields>
          : false
        : false
  : false;

type FieldNames<TFields extends FieldRecord> = Extract<keyof TFields, string>;
type RequiredFieldNames<TFields extends FieldRecord> = {
  [TName in FieldNames<TFields>]: IsFieldPresent<TFields[TName]> extends true ? TName : never;
}[FieldNames<TFields>];
type OptionalFieldNames<TFields extends FieldRecord> = Exclude<
  FieldNames<TFields>,
  RequiredFieldNames<TFields>
>;

type HasConfiguredDefault<TFields extends FieldRecord> = true extends {
  [TName in FieldNames<TFields>]: TFields[TName] extends { readonly options: infer TOptions }
    ? TOptions extends { readonly defaultValue: unknown }
      ? true
      : TFields[TName] extends {
            readonly kind: 'object';
            readonly options: { readonly fields: infer TNestedFields };
          }
        ? TNestedFields extends FieldRecord
          ? HasConfiguredDefault<TNestedFields>
          : false
        : false
    : false;
}[FieldNames<TFields>]
  ? true
  : false;

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

export type InferFieldsEntry<TFields extends FieldRecord> = Simplify<
  { [TName in RequiredFieldNames<TFields>]: FieldValue<TFields[TName]> } & {
    [TName in OptionalFieldNames<TFields>]?: FieldValue<TFields[TName]>;
  }
>;

interface ObjectFieldDefinition {
  readonly kind: 'object';
  readonly options: ObjectFieldOptions<FieldRecord>;
}

interface ListFieldDefinition {
  readonly kind: 'list';
  readonly options: ListFieldOptions<AnyFieldDefinition>;
}

export interface FieldRecord {
  readonly [name: string]: AnyFieldDefinition;
}

export type AnyFieldDefinition =
  | TextField
  | NumberField
  | BooleanField
  | DateField
  | DatetimeField
  | SlugField
  | UrlField
  | EmailField
  | SelectField
  | MultiselectField
  | MarkdownField
  | ObjectFieldDefinition
  | ListFieldDefinition;

function createField<TValue, TOptions extends BaseFieldOptions, TKind extends FieldKind>(
  kind: TKind,
  options: TOptions,
): FieldDefinition<TValue, TOptions, TKind> {
  return Object.freeze({ kind, options: Object.freeze({ ...options }) });
}

export const field = {
  text<TOptions extends TextFieldOptions = TextFieldOptions>(
    options?: TOptions,
  ): TextField<TOptions> {
    return createField('text', options ?? ({} as TOptions));
  },

  number<TOptions extends NumberFieldOptions = NumberFieldOptions>(
    options?: TOptions,
  ): NumberField<TOptions> {
    return createField('number', options ?? ({} as TOptions));
  },

  boolean<TOptions extends BaseFieldOptions<boolean> = BaseFieldOptions<boolean>>(
    options?: TOptions,
  ): BooleanField<TOptions> {
    return createField('boolean', options ?? ({} as TOptions));
  },

  date<TOptions extends StringFieldOptions = StringFieldOptions>(
    options?: TOptions,
  ): DateField<TOptions> {
    return createField('date', options ?? ({} as TOptions));
  },

  datetime<TOptions extends StringFieldOptions = StringFieldOptions>(
    options?: TOptions,
  ): DatetimeField<TOptions> {
    return createField('datetime', options ?? ({} as TOptions));
  },

  slug<TOptions extends SlugFieldOptions = SlugFieldOptions>(
    options?: TOptions,
  ): SlugField<TOptions> {
    return createField('slug', options ?? ({} as TOptions));
  },

  url<TOptions extends StringFieldOptions = StringFieldOptions>(
    options?: TOptions,
  ): UrlField<TOptions> {
    return createField('url', options ?? ({} as TOptions));
  },

  email<TOptions extends StringFieldOptions = StringFieldOptions>(
    options?: TOptions,
  ): EmailField<TOptions> {
    return createField('email', options ?? ({} as TOptions));
  },

  select<const TOptions extends readonly SelectOption[]>(
    options: SelectFieldOptions<TOptions>,
  ): SelectField<SelectFieldOptions<TOptions>> {
    return createField('select', options);
  },

  multiselect<const TOptions extends readonly SelectOption[]>(
    options: MultiselectFieldOptions<TOptions>,
  ): MultiselectField<MultiselectFieldOptions<TOptions>> {
    return createField('multiselect', options);
  },

  markdown<const TOptions extends MarkdownFieldOptions = MarkdownFieldOptions>(
    options?: TOptions,
  ): MarkdownField<TOptions> {
    return createField('markdown', options ?? ({} as TOptions));
  },

  object<TFields extends FieldRecord, TOptions extends ObjectFieldOptions<TFields>>(
    options: TOptions,
  ): ObjectField<TFields, TOptions> {
    return createField('object', options);
  },

  list<TItem extends AnyFieldDefinition, TOptions extends ListFieldOptions<TItem>>(
    options: TOptions,
  ): ListField<TItem, TOptions> {
    return createField('list', options);
  },
};
