'use client';

import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { lintKeymap, linter } from '@codemirror/lint';
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
} from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightSpecialChars, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { GFM } from '@lezer/markdown';
import { useEffect, useRef, useState } from 'react';

import type { Diagnostic } from '@codemirror/lint';
import type { Extension, TransactionSpec } from '@codemirror/state';
import type { MarkdownDialect, MarkdownEditorFeature, MarkdownEditorOptions } from '@pith-cms/core';

interface MarkdownEditorProps {
  readonly describedBy: string | undefined;
  readonly disabled: boolean;
  readonly id: string;
  readonly invalid: boolean;
  readonly labelId: string;
  readonly maxLength: number | undefined;
  readonly minLength: number | undefined;
  readonly onChange: (value: unknown) => void;
  readonly profile: MarkdownEditorOptions | undefined;
  readonly required: boolean | undefined;
  readonly value: string;
}

interface AccessOptions {
  readonly describedBy: string | undefined;
  readonly disabled: boolean;
  readonly id: string;
  readonly invalid: boolean;
  readonly labelId: string;
  readonly maxLength: number | undefined;
  readonly required: boolean;
}

interface MarkdownSyntaxNode {
  readonly from: number;
  readonly to: number;
  getChild(type: string): MarkdownSyntaxNode | null;
  getChildren(type: string): readonly MarkdownSyntaxNode[];
}

const MAX_DIAGNOSTICS = 100;
const externalValueUpdate = Annotation.define<boolean>();

const featureLabels: Readonly<Record<MarkdownEditorFeature, string>> = {
  'heading-1': 'Heading level 1',
  'heading-2': 'Heading level 2',
  'heading-3': 'Heading level 3',
  'heading-4': 'Heading level 4',
  'heading-5': 'Heading level 5',
  'heading-6': 'Heading level 6',
  strong: 'Bold text',
  emphasis: 'Italic text',
  strikethrough: 'Strikethrough',
  link: 'Link',
  image: 'Image',
  blockquote: 'Blockquote',
  'unordered-list': 'Bulleted list',
  'ordered-list': 'Numbered list',
  'task-list': 'Task list',
  'inline-code': 'Inline code',
  'code-block': 'Code block',
  'horizontal-rule': 'Horizontal rule',
  table: 'Table',
  html: 'Raw HTML',
};

const toolbarLabels: Partial<Record<MarkdownEditorFeature, string>> = {
  'heading-1': 'H1',
  'heading-2': 'H2',
  'heading-3': 'H3',
  'heading-4': 'H4',
  'heading-5': 'H5',
  'heading-6': 'H6',
  strong: 'B',
  emphasis: 'I',
  strikethrough: 'S',
  link: 'Link',
  image: 'Image',
  blockquote: 'Quote',
  'unordered-list': 'Bullets',
  'ordered-list': 'Numbers',
  'task-list': 'Tasks',
  'inline-code': 'Code',
  'code-block': 'Block',
  'horizontal-rule': 'Rule',
  table: 'Table',
};

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent, #e06026)', fontWeight: '700' },
  { tag: tags.strong, color: 'var(--code-ink, #f2f0e8)', fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: '#8cc8ff', textDecoration: 'underline' },
  { tag: tags.quote, color: '#b8d99b' },
  { tag: tags.monospace, color: '#f3c47f' },
  { tag: [tags.meta, tags.contentSeparator], color: '#9c9a93' },
]);

function markdownLanguage(dialect: MarkdownDialect): Extension {
  return markdown({
    base: commonmarkLanguage,
    ...(dialect === 'gfm' ? { extensions: GFM } : {}),
    completeHTMLTags: false,
  });
}

function accessExtensions(options: AccessOptions): Extension {
  const attributes: Record<string, string> = {
    id: options.id,
    'aria-labelledby': options.labelId,
    spellcheck: 'true',
  };

  if (options.describedBy) {
    attributes['aria-describedby'] = options.describedBy;
  }

  if (options.required) {
    attributes['aria-required'] = 'true';
  }

  if (options.invalid) {
    attributes['aria-invalid'] = 'true';
  }

  if (options.disabled) {
    attributes['aria-disabled'] = 'true';
    attributes.tabindex = '-1';
  }

  return [
    EditorState.readOnly.of(options.disabled),
    EditorView.editable.of(!options.disabled),
    EditorView.contentAttributes.of(attributes),
    ...(options.maxLength === undefined
      ? []
      : [
          EditorState.changeFilter.of(
            (transaction) =>
              transaction.annotation(externalValueUpdate) === true ||
              !transaction.docChanged ||
              transaction.newDoc.length <= options.maxLength!,
          ),
        ]),
  ];
}

function policyExtensions(profile: MarkdownEditorOptions | undefined): Extension {
  if (!profile) {
    return [];
  }

  const features = new Set(profile.features);
  return [
    linter((view) => markdownDiagnostics(view.state, features), {
      delay: 400,
      needsRefresh: (update) => syntaxTree(update.startState) !== syntaxTree(update.state),
    }),
    Prec.highest(keymap.of(markdownFeatureKeymap(features))),
    keymap.of(lintKeymap),
  ];
}

export function markdownDiagnostics(
  state: EditorState,
  allowed: ReadonlySet<MarkdownEditorFeature>,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const imageReferences = allowed.has('image') ? imageReferenceLabels(state) : new Set<string>();

  syntaxTree(state).iterate({
    enter(node) {
      if (diagnostics.length >= MAX_DIAGNOSTICS) {
        return false;
      }

      if (node.name === 'LinkReference' && imageReferences.has(referenceLabel(state, node.node))) {
        return false;
      }

      const feature = markdownFeatureForNode(node.name);

      if (!feature || node.from === node.to) {
        return;
      }

      if (allowed.has(feature)) {
        return node.name === 'Image' ? false : undefined;
      }

      diagnostics.push({
        from: node.from,
        to: node.to,
        severity: 'warning',
        source: 'Frontend profile',
        message: `${featureLabels[feature]} is not declared in this field's frontend profile.`,
      });
      return false;
    },
  });

  return diagnostics;
}

function imageReferenceLabels(state: EditorState): ReadonlySet<string> {
  const labels = new Set<string>();

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Image') {
        return;
      }

      if (node.node.getChild('URL')) {
        return false;
      }

      const explicitLabel = referenceLabel(state, node.node);
      if (explicitLabel) {
        labels.add(explicitLabel);
        return false;
      }

      const marks = node.node.getChildren('LinkMark');
      if (marks.length >= 2) {
        labels.add(normalizeReferenceLabel(state.doc.sliceString(marks[0]!.to, marks[1]!.from)));
      }
      return false;
    },
  });

  return labels;
}

function referenceLabel(state: EditorState, node: MarkdownSyntaxNode): string {
  const label = node.getChild('LinkLabel');
  return label ? normalizeReferenceLabel(state.doc.sliceString(label.from + 1, label.to - 1)) : '';
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function markdownFeatureForNode(name: string): MarkdownEditorFeature | null {
  const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name);

  if (heading) {
    return `heading-${heading[1]}` as MarkdownEditorFeature;
  }

  switch (name) {
    case 'StrongEmphasis':
      return 'strong';
    case 'Emphasis':
      return 'emphasis';
    case 'Strikethrough':
      return 'strikethrough';
    case 'Link':
    case 'Autolink':
    case 'URL':
      return 'link';
    case 'Image':
      return 'image';
    case 'Blockquote':
      return 'blockquote';
    case 'BulletList':
      return 'unordered-list';
    case 'OrderedList':
      return 'ordered-list';
    case 'Task':
      return 'task-list';
    case 'InlineCode':
      return 'inline-code';
    case 'FencedCode':
    case 'CodeBlock':
      return 'code-block';
    case 'HorizontalRule':
      return 'horizontal-rule';
    case 'Table':
      return 'table';
    case 'HTMLBlock':
    case 'HTMLTag':
    case 'Comment':
    case 'CommentBlock':
    case 'ProcessingInstruction':
    case 'ProcessingInstructionBlock':
      return 'html';
    default:
      return null;
  }
}

function markdownFeatureKeymap(features: ReadonlySet<MarkdownEditorFeature>) {
  return [
    ...(features.has('strong')
      ? [
          {
            key: 'Mod-b',
            run: (view: EditorView) => applyMarkdownFeature(view, 'strong', features),
          },
        ]
      : []),
    ...(features.has('emphasis')
      ? [
          {
            key: 'Mod-i',
            run: (view: EditorView) => applyMarkdownFeature(view, 'emphasis', features),
          },
        ]
      : []),
    ...(features.has('link')
      ? [
          {
            key: 'Mod-k',
            run: (view: EditorView) => applyMarkdownFeature(view, 'link', features),
          },
        ]
      : []),
    ...(features.has('strikethrough')
      ? [
          {
            key: 'Mod-Shift-x',
            run: (view: EditorView) => applyMarkdownFeature(view, 'strikethrough', features),
          },
        ]
      : []),
  ];
}

function applyMarkdownFeature(
  view: EditorView,
  feature: MarkdownEditorFeature,
  enabledFeatures?: ReadonlySet<MarkdownEditorFeature>,
): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const taskListStyle =
    enabledFeatures?.has('ordered-list') && !enabledFeatures.has('unordered-list')
      ? 'ordered'
      : 'unordered';
  const transaction = markdownFeatureTransaction(view.state, feature, taskListStyle);

  if (!transaction) {
    return false;
  }

  view.dispatch({
    ...transaction,
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

export function markdownFeatureTransaction(
  state: EditorState,
  feature: MarkdownEditorFeature,
  taskListStyle: 'ordered' | 'unordered' = 'unordered',
): TransactionSpec | null {
  if (feature.startsWith('heading-')) {
    return prefixSelectedLines(state, `${'#'.repeat(Number(feature.slice(-1)))} `, 'heading');
  }

  switch (feature) {
    case 'strong':
      return wrapSelection(state, '**');
    case 'emphasis':
      return wrapSelection(state, '_');
    case 'strikethrough':
      return wrapSelection(state, '~~');
    case 'link':
      return linkSelection(state, false);
    case 'image':
      return linkSelection(state, true);
    case 'blockquote':
      return prefixSelectedLines(state, '> ', 'blockquote');
    case 'unordered-list':
      return prefixSelectedLines(state, '- ', 'unordered-list');
    case 'ordered-list':
      return prefixSelectedLines(state, '1. ', 'ordered-list');
    case 'task-list':
      return prefixSelectedLines(
        state,
        taskListStyle === 'ordered' ? '1. [ ] ' : '- [ ] ',
        'task-list',
      );
    case 'inline-code':
      return wrapSelection(state, '`');
    case 'code-block':
      return insertBlock(state, '```\n', '\n```', 'code');
    case 'horizontal-rule':
      return insertBlock(state, '', '', '---', false);
    case 'table':
      return insertBlock(
        state,
        '',
        '',
        '| Column | Column |\n| --- | --- |\n| Value | Value |',
        false,
      );
    case 'html':
      return null;
    default:
      return null;
  }
}

function wrapSelection(state: EditorState, marker: string): TransactionSpec {
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to);
  const insert = `${marker}${selected}${marker}`;

  return {
    changes: { from: range.from, to: range.to, insert },
    selection: selected
      ? EditorSelection.range(range.from + marker.length, range.to + marker.length)
      : EditorSelection.cursor(range.from + marker.length),
  };
}

function linkSelection(state: EditorState, image: boolean): TransactionSpec {
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to);
  const label = selected || (image ? 'alt text' : 'link text');
  const prefix = image ? '![' : '[';
  const destination = 'https://';
  const insert = `${prefix}${label}](${destination})`;
  const destinationFrom = range.from + prefix.length + label.length + 2;

  return {
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(destinationFrom, destinationFrom + destination.length),
  };
}

function insertBlock(
  state: EditorState,
  opening: string,
  closing: string,
  placeholder: string,
  useSelection = true,
): TransactionSpec {
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to);
  const content = useSelection && selected ? selected : placeholder;
  const needsLeadingBreak =
    range.from > 0 && state.doc.sliceString(range.from - 1, range.from) !== '\n';
  const needsTrailingBreak =
    range.to < state.doc.length && state.doc.sliceString(range.to, range.to + 1) !== '\n';
  const leading = needsLeadingBreak ? '\n' : '';
  const trailing = needsTrailingBreak ? '\n' : '';
  const insert = `${leading}${opening}${content}${closing}${trailing}`;
  const contentFrom = range.from + leading.length + opening.length;

  return {
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(contentFrom, contentFrom + content.length),
  };
}

function prefixSelectedLines(
  state: EditorState,
  prefix: string,
  kind: 'heading' | 'blockquote' | 'unordered-list' | 'ordered-list' | 'task-list',
): TransactionSpec {
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endPosition =
    range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to;
  const endLine = state.doc.lineAt(endPosition);
  const lines = Array.from(
    { length: endLine.number - startLine.number + 1 },
    (_, index) => state.doc.line(startLine.number + index).text,
  );
  const pattern = linePrefixPattern(kind);
  const targetPattern =
    kind === 'heading'
      ? new RegExp(`^ {0,3}${prefix.trim()}(?!#)\\s+`)
      : kind === 'task-list' && /^\d/.test(prefix)
        ? /^\s*\d+[.)]\s+\[[ xX]\]\s+/
        : pattern;
  const allPrefixed = lines.every((line) => targetPattern.test(line));
  const transformed = lines.map((line, index) => {
    if (allPrefixed) {
      return line.replace(targetPattern, '');
    }

    const clean = stripCompetingPrefix(line, kind);
    const resolvedPrefix =
      kind === 'ordered-list'
        ? `${index + 1}. `
        : kind === 'task-list' && /^\d/.test(prefix)
          ? `${index + 1}. [ ] `
          : prefix;
    return `${resolvedPrefix}${clean}`;
  });
  const insert = transformed.join('\n');
  const change = { from: startLine.from, to: endLine.to, insert };

  if (!range.empty) {
    return {
      changes: change,
      selection: EditorSelection.range(startLine.from, startLine.from + insert.length),
    };
  }

  const offset = range.head - startLine.from;
  const delta = transformed[0]!.length - lines[0]!.length;
  return {
    changes: change,
    selection: EditorSelection.cursor(
      startLine.from + Math.max(0, Math.min(transformed[0]!.length, offset + delta)),
    ),
  };
}

function linePrefixPattern(
  kind: 'heading' | 'blockquote' | 'unordered-list' | 'ordered-list' | 'task-list',
): RegExp {
  switch (kind) {
    case 'heading':
      return /^ {0,3}#{1,6}\s+/;
    case 'blockquote':
      return /^ {0,3}>\s?/;
    case 'unordered-list':
      return /^\s*[-+*]\s+(?!\[[ xX]\]\s)/;
    case 'ordered-list':
      return /^\s*\d+[.)]\s+/;
    case 'task-list':
      return /^\s*[-+*]\s+\[[ xX]\]\s+/;
  }
}

function stripCompetingPrefix(
  line: string,
  kind: 'heading' | 'blockquote' | 'unordered-list' | 'ordered-list' | 'task-list',
): string {
  if (kind === 'heading' || kind === 'blockquote') {
    return line.replace(linePrefixPattern(kind), '');
  }

  return line.replace(/^\s*(?:(?:[-+*]|\d+[.)])\s+)(?:\[[ xX]\]\s+)?/, '');
}

export function externalValueTransactions(
  state: EditorState,
  value: string,
  historySlot: Compartment,
): readonly TransactionSpec[] {
  const nextDocument = state.toText(value);
  const clamp = (position: number) => Math.min(position, nextDocument.length);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) =>
      EditorSelection.range(clamp(range.anchor), clamp(range.head)),
    ),
    state.selection.mainIndex,
  );

  return [
    {
      changes: { from: 0, to: state.doc.length, insert: nextDocument },
      selection,
      effects: historySlot.reconfigure([]),
      annotations: [externalValueUpdate.of(true), Transaction.addToHistory.of(false)],
    },
    { effects: historySlot.reconfigure(history()) },
  ];
}

export default function MarkdownEditor({
  describedBy,
  disabled,
  id,
  invalid,
  labelId,
  maxLength,
  minLength,
  onChange,
  profile,
  required = false,
  value,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValue = useRef(value);
  const initialDialect = useRef(profile?.dialect ?? 'commonmark');
  const initialAccess = useRef<AccessOptions>({
    describedBy,
    disabled,
    id,
    invalid,
    labelId,
    maxLength,
    required,
  });
  const initialProfile = useRef(profile);
  const [languageSlot] = useState(() => new Compartment());
  const [accessSlot] = useState(() => new Compartment());
  const [policySlot] = useState(() => new Compartment());
  const [historySlot] = useState(() => new Compartment());
  const [toolbarFocusIndex, setToolbarFocusIndex] = useState(0);
  const featureKey = profile?.features.join('\u0000') ?? '';
  const toolbarFeatures = profile?.features.filter((feature) => toolbarLabels[feature]) ?? [];
  const resolvedToolbarFocusIndex = Math.min(
    toolbarFocusIndex,
    Math.max(0, toolbarFeatures.length - 1),
  );
  const enabledFeatures = new Set(profile?.features ?? []);

  onChangeRef.current = onChange;

  useEffect(() => {
    const parent = hostRef.current;

    if (!parent) {
      return;
    }

    const view = new EditorView({
      parent,
      doc: initialValue.current,
      extensions: [
        historySlot.of(history()),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        highlightSpecialChars(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        syntaxHighlighting(markdownHighlightStyle),
        languageSlot.of(markdownLanguage(initialDialect.current)),
        accessSlot.of(accessExtensions(initialAccess.current)),
        policySlot.of(policyExtensions(initialProfile.current)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }

          const external = update.transactions.some(
            (transaction) => transaction.annotation(externalValueUpdate) === true,
          );

          if (!external) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    viewRef.current = view;

    return () => {
      if (viewRef.current === view) {
        viewRef.current = null;
      }
      view.destroy();
    };
  }, [accessSlot, historySlot, languageSlot, policySlot]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const nextDocument = view.state.toText(value);

    if (view.state.doc.eq(nextDocument)) {
      return;
    }

    for (const transaction of externalValueTransactions(view.state, value, historySlot)) {
      view.dispatch(transaction);
    }
  }, [historySlot, value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageSlot.reconfigure(markdownLanguage(profile?.dialect ?? 'commonmark')),
    });
  }, [languageSlot, profile?.dialect]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: accessSlot.reconfigure(
        accessExtensions({
          describedBy,
          disabled,
          id,
          invalid,
          labelId,
          maxLength,
          required,
        }),
      ),
    });
  }, [accessSlot, describedBy, disabled, id, invalid, labelId, maxLength, required]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: policySlot.reconfigure(policyExtensions(profile)),
    });
  }, [featureKey, policySlot, profile]);

  return (
    <div className="pith-markdown-editor">
      {toolbarFeatures.length > 0 ? (
        <div
          aria-label="Markdown formatting"
          className="pith-markdown-toolbar"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              return;
            }

            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            );

            if (buttons.length === 0) {
              return;
            }

            const current = Math.max(
              0,
              buttons.indexOf(document.activeElement as HTMLButtonElement),
            );
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : event.key === 'ArrowLeft'
                    ? (current - 1 + buttons.length) % buttons.length
                    : (current + 1) % buttons.length;
            event.preventDefault();
            setToolbarFocusIndex(next);
            buttons[next]?.focus();
          }}
          role="toolbar"
        >
          {toolbarFeatures.map((feature, index) => (
            <button
              aria-label={featureLabels[feature]}
              disabled={disabled}
              data-feature={feature}
              key={feature}
              onClick={() => {
                const view = viewRef.current;
                if (view) applyMarkdownFeature(view, feature, enabledFeatures);
              }}
              onFocus={() => setToolbarFocusIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              tabIndex={disabled || index !== resolvedToolbarFocusIndex ? -1 : 0}
              title={featureLabels[feature]}
              type="button"
            >
              {toolbarLabels[feature]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="pith-markdown-editor-source" ref={hostRef} />
      <div className="pith-markdown-editor-status">
        <span>{profile?.dialect === 'gfm' ? 'GitHub Flavored Markdown' : 'CommonMark'}</span>
        <span>
          {profile
            ? `${profile.features.length} frontend feature${profile.features.length === 1 ? '' : 's'} declared`
            : 'Frontend profile not declared'}
        </span>
        {profile ? <span>Warnings: F8</span> : null}
        <span>
          {value.length} characters
          {maxLength === undefined ? '' : ` / ${maxLength}`}
          {minLength !== undefined && value.length < minLength ? ` (minimum ${minLength})` : ''}
        </span>
      </div>
    </div>
  );
}
