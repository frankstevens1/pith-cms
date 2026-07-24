import { describe, expect, it } from 'vitest';

import {
  ContentParseError,
  parseJsonEntry,
  parseMarkdownEntry,
  serializeJsonEntry,
  serializeMarkdownEntry,
} from '../src/index.js';
import { pages, posts } from './fixtures.js';

describe('content serialization', () => {
  it('serializes JSON in field order with defaults, Unicode, and a final newline', () => {
    const output = serializeJsonEntry(pages, {
      slug: 'home',
      title: 'Héllo',
      author: { name: 'Ada' },
    });

    expect(output).toBe(
      '{\n  "title": "Héllo",\n  "slug": "home",\n  "published": true,\n  "author": {\n    "name": "Ada"\n  }\n}\n',
    );
    expect(serializeJsonEntry(pages, JSON.parse(output))).toBe(output);
  });

  it('returns structured JSON parse and validation failures', () => {
    const malformed = parseJsonEntry(pages, '{');
    const unknown = parseJsonEntry(pages, '{"title":"Home","slug":"home","extra":true}');

    expect(malformed.success).toBe(false);
    expect(unknown).toEqual({
      success: false,
      error: expect.objectContaining({ code: 'CONTENT_VALIDATION_ERROR' }),
    });

    if (!malformed.success) {
      expect(malformed.error).toBeInstanceOf(ContentParseError);
    }
  });

  it('round-trips Markdown frontmatter and preserves the opaque body', () => {
    const source =
      '---\ntitle: Building Pith\nslug: building-pith\npublishedAt: 2026-07-20T10:00:00.000Z\n---\n\nPith is **lightweight**.\n';
    const parsed = parseMarkdownEntry(posts, source);

    expect(parsed).toEqual({
      success: true,
      data: {
        title: 'Building Pith',
        slug: 'building-pith',
        publishedAt: '2026-07-20T10:00:00.000Z',
        body: 'Pith is **lightweight**.\n',
      },
    });

    if (parsed.success) {
      const output = serializeMarkdownEntry(posts, parsed.data);
      expect(output).toBe(source);
      expect(serializeMarkdownEntry(posts, parsed.data)).toBe(output);
    }
  });

  it('rejects malformed frontmatter and a markdown body in frontmatter', () => {
    const malformed = parseMarkdownEntry(posts, 'title: Missing frontmatter');
    const duplicateBody = parseMarkdownEntry(
      posts,
      '---\ntitle: Post\nslug: post\nbody: should-not-be-here\n---\n\nActual body',
    );

    expect(malformed.success).toBe(false);
    expect(duplicateBody.success).toBe(false);
  });
});
