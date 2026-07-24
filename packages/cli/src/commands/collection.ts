import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import type { FieldKind, FieldRecord } from '@pith-cms/core';

import { findProjectRoot, findPithConfig, extractPithExport } from '../utils/config.js';
import { prompt, choose, confirm } from '../utils/prompt.js';
import { printLine, printSuccess, configError } from '../utils/output.js';

interface FieldConfig {
  readonly name: string;
  readonly kind: FieldKind;
  readonly options: Record<string, unknown>;
}

export async function collectionAddCommand(): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());

  if (!projectRoot) {
    throw configError('Could not find a project root.');
  }

  const configResult = await findPithConfig(projectRoot);

  if (!configResult) {
    throw configError('Could not find a pith.config.{ts,mts,js,mjs} file. Run `pith init` first.');
  }

  const exported = extractPithExport(configResult.value as Record<string, unknown>);

  if (!exported) {
    throw configError(
      'Config file must export a Pith config via `export default` or `export const pith`.',
    );
  }

  const config = exported.config as {
    collections: Record<string, { path: string; fields: FieldRecord }>;
    contentRoot: string;
  };
  const existingCollections = Object.keys(config.collections);
  const existingPaths = new Set(Object.values(config.collections).map((c) => c.path));

  printLine();
  printLine(`Existing collections: ${existingCollections.join(', ') || '(none)'}`);
  printLine();

  const name = await prompt('Collection identifier (camelCase, no spaces)', {
    required: true,
    hint: 'e.g. blogPosts',
  });

  if (existingCollections.includes(name)) {
    throw configError(`Collection "${name}" already exists.`);
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    throw configError(
      `Invalid collection name "${name}". Use camelCase (e.g. "blogPosts", "teamMembers").`,
    );
  }

  const label = await prompt('Display label', {
    required: true,
    hint: 'e.g. Blog Posts',
  });

  const defaultPath = name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/--+/g, '-');

  const path = await prompt('Content directory path', {
    default: defaultPath,
    hint: 'relative to content root',
  });

  if (!/^[a-z0-9/_-]+$/.test(path)) {
    throw configError(
      'Path must be lowercase with hyphens, underscores, slashes, and digits only.',
    );
  }

  if (existingPaths.has(path)) {
    throw configError(`A collection already uses the path "${path}".`);
  }

  const format = await choose<'json' | 'markdown'>('Entry format', [
    { value: 'json', label: 'JSON' },
    { value: 'markdown', label: 'Markdown (with frontmatter)' },
  ]);

  printLine();
  printLine('Now define the fields. At minimum, include an identifier field (e.g. "slug").');
  printLine();

  const fields = await promptFields(format);

  if (fields.length === 0) {
    throw configError('At least one field is required.');
  }

  const fieldNames = fields.map((f) => f.name);
  const identifierField = await prompt('Identifier field (used as the entry key)', {
    default: fieldNames.includes('slug') ? 'slug' : fieldNames[0],
    required: true,
  });

  if (!fieldNames.includes(identifierField)) {
    throw configError(
      `Identifier field "${identifierField}" must be one of the defined fields: ${fieldNames.join(', ')}`,
    );
  }

  const scalarFields = fieldNames.filter(
    (name) =>
      !['object', 'list', 'markdown'].includes(fields.find((f) => f.name === name)?.kind ?? ''),
  );

  const displayField = await prompt('Display field (shown in editor listings)', {
    default: scalarFields.includes('title') ? 'title' : identifierField,
  });

  if (!fieldNames.includes(displayField)) {
    throw configError(
      `Display field "${displayField}" must be one of the defined fields: ${fieldNames.join(', ')}`,
    );
  }

  printLine();
  printLine('Collection definition:');
  printLine(`  Name: ${name}`);
  printLine(`  Label: ${label}`);
  printLine(`  Path: ${path}`);
  printLine(`  Format: ${format}`);
  printLine(`  Identifier field: ${identifierField}`);
  printLine(`  Display field: ${displayField}`);
  printLine(`  Fields: ${fieldNames.join(', ')}`);
  printLine();

  const confirmed = await confirm('Add this collection?', true);

  if (!confirmed) {
    printLine('Cancelled.');
    return;
  }

  const collectionCode = generateCollectionCode(
    name,
    label,
    path,
    format,
    identifierField,
    displayField,
    fields,
  );
  await addCollectionToConfig(projectRoot, configResult.path, name, collectionCode);

  const contentDir = resolve(projectRoot, config.contentRoot, path);
  await mkdir(contentDir, { recursive: true });

  const gitkeepPath = resolve(contentDir, '.gitkeep');
  await writeFile(gitkeepPath, '', 'utf8');

  printSuccess(`Added collection "${name}" with ${fields.length} field(s).`);
  printLine(`Content directory: ${relative(projectRoot, contentDir)}/`);
}

async function promptFields(format: 'json' | 'markdown'): Promise<FieldConfig[]> {
  const fields: FieldConfig[] = [];
  let hasMarkdownBody = false;

  while (true) {
    printLine();
    const fieldName = await prompt(
      `Field name (empty to finish) [${fields.length > 0 ? fields.length + 1 : 1}]`,
    );

    if (!fieldName) {
      if (fields.length === 0) {
        printLine('At least one field is required. Please add a field.');
        continue;
      }
      break;
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(fieldName)) {
      printLine('Invalid field name. Use camelCase (e.g. "title", "publishedAt").');
      continue;
    }

    if (fields.some((f) => f.name === fieldName)) {
      printLine('Field name already exists. Choose a different name.');
      continue;
    }

    const kind = await chooseFieldKind(format, hasMarkdownBody);

    if (kind === 'markdown') {
      hasMarkdownBody = true;
    }

    const options = await promptFieldOptions(kind);
    fields.push({ name: fieldName, kind, options });

    printLine(`  Added: ${fieldName} (${kind})`);
  }

  return fields;
}

async function chooseFieldKind(format: string, hasMarkdownBody: boolean): Promise<FieldKind> {
  const options: { value: FieldKind; label: string; disabled?: string | undefined }[] = [
    { value: 'text', label: 'Text (string with optional length constraints)' },
    { value: 'number', label: 'Number (optional min/max/integer)' },
    { value: 'boolean', label: 'Boolean (true/false)' },
    { value: 'date', label: 'Date (YYYY-MM-DD)' },
    { value: 'datetime', label: 'Datetime (ISO 8601)' },
    { value: 'slug', label: 'Slug (URL-safe identifier, auto-generated from source)' },
    { value: 'url', label: 'URL (validates http/https)' },
    { value: 'email', label: 'Email' },
    { value: 'select', label: 'Select (single choice from options)' },
    { value: 'multiselect', label: 'Multiselect (multiple choices from options)' },
    { value: 'object', label: 'Object (nested fields)' },
    { value: 'list', label: 'List (array of a given field type)' },
  ];

  if (!hasMarkdownBody) {
    options.push({
      value: 'markdown',
      label: 'Markdown (rich text body)',
      disabled: format === 'json' && hasMarkdownBody ? 'already added' : undefined,
    });
  }

  return choose('Field type', options);
}

async function promptFieldOptions(kind: FieldKind): Promise<Record<string, unknown>> {
  const options: Record<string, unknown> = {};
  const label = await prompt('Field label', { required: true });

  if (label) {
    options.label = label;
  }

  const description = await prompt('Description (optional)');
  if (description) {
    options.description = description;
  }

  const required = await confirm('Required?', false);
  options.required = required;

  if (!required) {
    const hasDefault = await confirm('Has default value?', false);
    if (hasDefault) {
      const defaultVal = await prompt('Default value (as JSON literal)');
      if (defaultVal) {
        try {
          options.defaultValue = JSON.parse(defaultVal);
        } catch {
          printLine('Invalid JSON. Skipping default value.');
        }
      }
    }
  }

  switch (kind) {
    case 'text':
    case 'slug':
    case 'url':
    case 'email': {
      const minStr = await prompt('Min length (optional)');
      if (minStr) options.minLength = parseInt(minStr, 10);

      const maxStr = await prompt('Max length (optional)');
      if (maxStr) options.maxLength = parseInt(maxStr, 10);

      if (kind === 'text') {
        const multiline = await confirm('Multiline?', false);
        options.multiline = multiline;
      }

      if (kind === 'slug') {
        const source = await prompt('Source field for auto-generation');
        if (source) options.source = source;
      }
      break;
    }

    case 'number': {
      const minStr = await prompt('Min value (optional)');
      if (minStr) options.min = parseFloat(minStr);

      const maxStr = await prompt('Max value (optional)');
      if (maxStr) options.max = parseFloat(maxStr);

      const integer = await confirm('Integer only?', false);
      options.integer = integer;
      break;
    }

    case 'select':
    case 'multiselect': {
      const labelOptions = await prompt(
        'Options (comma-separated labels, e.g. "Draft, Published, Archived")',
        { required: true },
      );
      if (labelOptions) {
        options.options = labelOptions.split(',').map((s) => {
          const trimmed = s.trim();
          return { value: trimmed.toLowerCase().replace(/\s+/g, '-'), label: trimmed };
        });
      }
      break;
    }

    case 'object': {
      printLine();
      printLine('Define nested fields for the object:');
      const nestedFields = await promptFields('json');

      if (nestedFields.length > 0) {
        options.fields = Object.fromEntries(
          nestedFields.map((f) => {
            const fieldDef: Record<string, unknown> = {
              kind: f.kind,
              ...f.options,
            };

            if (f.options.fields) {
              fieldDef.fields = f.options.fields;
            }

            if (f.options.item) {
              fieldDef.item = f.options.item;
            }

            return [f.name, fieldDef];
          }),
        );
      }
      break;
    }

    case 'list': {
      printLine();
      printLine('Select the item type for the list:');
      const itemKind = await chooseFieldKind('json', false);
      const itemOptions = await promptFieldOptions(itemKind);

      const itemDef: Record<string, unknown> = {
        kind: itemKind,
        ...itemOptions,
      };

      options.item = itemDef;
      break;
    }

    case 'date':
    case 'datetime':
    case 'boolean':
    case 'markdown': {
      break;
    }
  }

  return options;
}

function generateCollectionCode(
  name: string,
  label: string,
  path: string,
  format: 'json' | 'markdown',
  identifierField: string,
  displayField: string,
  fields: FieldConfig[],
): string {
  const fieldLines = fields.map((f) => generateFieldCode(f));
  const indent = '      ';

  return [
    `${indent}// === @pith-cms/collection:${name} ===`,
    `${indent}${name}: defineCollection({`,
    `${indent}  label: ${JSON.stringify(label)},`,
    `${indent}  path: ${JSON.stringify(path)},`,
    `${indent}  format: ${JSON.stringify(format)},`,
    `${indent}  identifierField: ${JSON.stringify(identifierField)},`,
    `${indent}  displayField: ${JSON.stringify(displayField)},`,
    `${indent}  fields: {`,
    ...fieldLines,
    `${indent}  },`,
    `${indent}}),`,
    `${indent}// === @pith-cms/collection:end:${name} ===`,
  ].join('\n');
}

function generateFieldCode(field: FieldConfig, depth = 3): string {
  const indent = '  '.repeat(depth);
  const kindFnMap: Record<string, string> = {
    text: 'field.text',
    number: 'field.number',
    boolean: 'field.boolean',
    date: 'field.date',
    datetime: 'field.datetime',
    slug: 'field.slug',
    url: 'field.url',
    email: 'field.email',
    select: 'field.select',
    multiselect: 'field.multiselect',
    markdown: 'field.markdown',
    object: 'field.object',
    list: 'field.list',
  };

  const fn = kindFnMap[field.kind] ?? 'field.text';

  const opts: Record<string, unknown> = { ...field.options };

  if (opts.fields) {
    const nestedFields = opts.fields as Record<string, Record<string, unknown>>;
    delete opts.fields;

    const objFields = Object.entries(nestedFields).map(([name, def]) => {
      const nestedFn = kindFnMap[def.kind as string] ?? 'field.text';
      const nestedOpts = { ...def };
      delete nestedOpts.kind;

      const optEntries = Object.entries(nestedOpts).filter(([, v]) => v !== undefined);
      if (optEntries.length === 0) {
        return `${indent}      ${name}: ${nestedFn}({}),`;
      }

      const optStr = optEntries.map(([k, v]) => `${k}: ${formatFieldValue(k, v)}`).join(', ');
      return `${indent}      ${name}: ${nestedFn}({ ${optStr} }),`;
    });

    const optsStr = `{ fields: {\n${objFields.join('\n')}\n${indent}    } }`;
    return `${indent}    ${field.name}: ${fn}(${optsStr}),`;
  }

  if (opts.item) {
    const itemDef = opts.item as Record<string, unknown>;
    delete opts.item;
    const itemFn = kindFnMap[itemDef.kind as string] ?? 'field.text';
    const itemOpts = { ...itemDef };
    delete itemOpts.kind;

    const itemOptStr = Object.entries(itemOpts)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${formatFieldValue(k, v)}`)
      .join(', ');

    let args = optsStr(opts);
    if (args) {
      args += `, item: ${itemFn}({ ${itemOptStr} })`;
    } else {
      args = `item: ${itemFn}({ ${itemOptStr} })`;
    }

    return `${indent}    ${field.name}: ${fn}({ ${args} }),`;
  }

  const args = optsStr(opts);
  return `${indent}    ${field.name}: ${fn}({ ${args} }),`;
}

function optsStr(opts: Record<string, unknown>): string {
  return Object.entries(opts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${formatFieldValue(k, v)}`)
    .join(', ');
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (Array.isArray(value)) {
    const items = value.map((item) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const entries = Object.entries(record)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(', ');
        return `{ ${entries} }`;
      }
      return JSON.stringify(item);
    });
    return `[${items.join(', ')}]`;
  }

  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return JSON.stringify(value);
}

async function addCollectionToConfig(
  projectRoot: string,
  configPath: string,
  collectionName: string,
  collectionCode: string,
): Promise<void> {
  const content = await readFile(configPath, 'utf8');

  const endMarker = `// === @pith-cms/collection:end:`;
  const markerIndex = content.lastIndexOf(endMarker);

  let updated: string;

  if (markerIndex === -1) {
    const collectionsStart = content.indexOf('collections: {');
    const collectionsEnd = content.indexOf('},', collectionsStart);

    if (collectionsStart === -1 || collectionsEnd === -1) {
      throw configError('Could not locate the collections block in the config file.');
    }

    const afterCollections = collectionsEnd;

    const collectionsLines = content.slice(collectionsStart, afterCollections + 2).split('\n');

    const firstCollection = collectionsLines.findIndex((line) =>
      line.includes('defineCollection('),
    );

    if (firstCollection > 0) {
      const insertAt =
        collectionsStart +
        content
          .slice(collectionsStart, afterCollections + 2)
          .indexOf(collectionsLines[firstCollection]!);
      updated = content.slice(0, insertAt) + `${collectionCode},\n` + content.slice(insertAt);
    } else {
      updated =
        content.slice(0, afterCollections) +
        `\n${collectionCode},\n` +
        content.slice(afterCollections);
    }
  } else {
    const lastEndLine = content.lastIndexOf('\n', markerIndex) + 1;
    const afterLastEnd = content.indexOf('\n', markerIndex + endMarker.length);

    if (afterLastEnd === -1) {
      updated = content.slice(0, lastEndLine) + `${collectionCode},\n` + content.slice(lastEndLine);
    } else {
      const lineEnd = content.indexOf('\n', afterLastEnd) + 1;
      updated = content.slice(0, lineEnd) + `${collectionCode},\n` + content.slice(lineEnd);
    }
  }

  await writeFile(configPath, updated, 'utf8');
}
