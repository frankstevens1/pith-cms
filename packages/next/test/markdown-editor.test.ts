import { history, undoDepth } from '@codemirror/commands';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';

import type { MarkdownEditorFeature } from '@pith-cms/core';

import { markdownFieldErrors } from '../src/editor-client.js';
import type { EditorField } from '../src/editor-client.js';
import {
  externalValueTransactions,
  markdownDiagnostics,
  markdownFeatureTransaction,
} from '../src/markdown-editor.js';

function format(
  document: string,
  feature: MarkdownEditorFeature,
  selection: { readonly anchor: number; readonly head?: number },
  taskListStyle: 'ordered' | 'unordered' = 'unordered',
) {
  const state = EditorState.create({
    doc: document,
    selection: EditorSelection.single(selection.anchor, selection.head),
  });
  const spec = markdownFeatureTransaction(state, feature, taskListStyle);

  if (!spec) {
    throw new Error(`Feature ${feature} did not produce a transaction.`);
  }

  const next = state.update(spec).state;
  return {
    document: next.doc.toString(),
    selection: next.selection.main,
  };
}

describe('Markdown editor formatting', () => {
  it('wraps selected inline content and preserves the inner selection', () => {
    const result = format('Write clearly.', 'strong', { anchor: 6, head: 13 });

    expect(result.document).toBe('Write **clearly**.');
    expect(result.selection.from).toBe(8);
    expect(result.selection.to).toBe(15);
  });

  it('inserts links and selects their destination', () => {
    const result = format('Read Pith', 'link', { anchor: 5, head: 9 });

    expect(result.document).toBe('Read [Pith](https://)');
    expect(result.document.slice(result.selection.from, result.selection.to)).toBe('https://');
  });

  it('converts heading levels and toggles the selected level', () => {
    const converted = format('### Details', 'heading-2', { anchor: 5 });
    const toggled = format(converted.document, 'heading-2', { anchor: 4 });

    expect(converted.document).toBe('## Details');
    expect(toggled.document).toBe('Details');
  });

  it('changes competing list markers and numbers selected lines', () => {
    const result = format('- First\n- Second', 'ordered-list', { anchor: 0, head: 16 });

    expect(result.document).toBe('1. First\n2. Second');
  });

  it('adds and removes task list markers', () => {
    const added = format('First\nSecond', 'task-list', { anchor: 0, head: 12 });
    const removed = format(added.document, 'task-list', {
      anchor: 0,
      head: added.document.length,
    });

    expect(added.document).toBe('- [ ] First\n- [ ] Second');
    expect(removed.document).toBe('First\nSecond');
  });

  it('uses ordered markers when that is the declared task-list style', () => {
    const result = format('First\nSecond', 'task-list', { anchor: 0, head: 12 }, 'ordered');

    expect(result.document).toBe('1. [ ] First\n2. [ ] Second');
  });

  it('wraps selected content in a fenced code block', () => {
    const result = format('before code after', 'code-block', { anchor: 7, head: 11 });

    expect(result.document).toBe('before \n```\ncode\n```\n after');
    expect(result.document.slice(result.selection.from, result.selection.to)).toBe('code');
  });

  it.each([
    ['horizontal-rule', '---'],
    ['table', '| Column | Column |\n| --- | --- |\n| Value | Value |'],
  ] as const)('replaces selected text with the %s template', (feature, expected) => {
    const result = format('Replace this', feature, { anchor: 0, head: 12 });

    expect(result.document).toBe(expected);
  });

  it('clears undo history when an authoritative value replaces the document', () => {
    const historySlot = new Compartment();
    let state = EditorState.create({
      doc: 'Original',
      extensions: historySlot.of(history()),
    });
    state = state.update({
      changes: { from: 8, insert: ' edit' },
      userEvent: 'input.type',
    }).state;
    expect(undoDepth(state)).toBe(1);

    for (const transaction of externalValueTransactions(state, 'Canonical\n', historySlot)) {
      state = state.update(transaction).state;
    }

    expect(state.doc.toString()).toBe('Canonical\n');
    expect(undoDepth(state)).toBe(0);
  });

  it('does not classify an allowed image destination as an undeclared link', () => {
    const state = EditorState.create({
      doc: '![Alt text](image.png)',
      extensions: markdown({ base: commonmarkLanguage }),
    });

    expect(markdownDiagnostics(state, new Set<MarkdownEditorFeature>(['image']))).toEqual([]);
  });

  it('does not classify an allowed image reference definition as an undeclared link', () => {
    const state = EditorState.create({
      doc: '![Alt text][logo]\n\n[logo]: image.png',
      extensions: markdown({ base: commonmarkLanguage }),
    });

    expect(markdownDiagnostics(state, new Set<MarkdownEditorFeature>(['image']))).toEqual([]);
  });

  it('matches escaped image reference labels through the syntax tree', () => {
    const state = EditorState.create({
      doc: '![Alt text][my\\]label]\n\n[my\\]label]: image.png',
      extensions: markdown({ base: commonmarkLanguage }),
    });

    expect(markdownDiagnostics(state, new Set<MarkdownEditorFeature>(['image']))).toEqual([]);
  });

  it('classifies a bare GFM URL as a link', () => {
    const state = EditorState.create({
      doc: 'https://example.com',
      extensions: markdown({ base: commonmarkLanguage, extensions: GFM }),
    });

    expect(markdownDiagnostics(state, new Set())).toEqual([
      expect.objectContaining({
        source: 'Frontend profile',
        message: "Link is not declared in this field's frontend profile.",
      }),
    ]);
  });

  it('validates required Markdown fields nested in objects and lists', () => {
    const fields: readonly EditorField[] = [
      {
        name: 'sections',
        kind: 'list',
        options: {
          item: {
            name: 'item',
            kind: 'object',
            options: {
              fields: [
                {
                  name: 'body',
                  kind: 'markdown',
                  options: { label: 'Section body', required: true },
                },
              ],
            },
          },
        },
      },
    ];

    expect(markdownFieldErrors(fields, { sections: [{ body: '' }] })).toEqual({
      'sections.0.body': 'Section body is required.',
    });
  });
});
