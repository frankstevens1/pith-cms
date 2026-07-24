import { describe, expect, it } from 'vitest';

import {
  createContentService,
  RepositoryConflictError,
  type ContentRepository,
  type DeleteFileInput,
  type DeleteFileResult,
  type RepositoryFile,
  type RepositoryFileSummary,
  type WriteFileInput,
  type WriteFileResult,
} from '../src/index.js';
import { pith } from './fixtures.js';

describe('content service', () => {
  it('reads, lists, writes, and deletes entries with repository revisions', async () => {
    const repository = new InMemoryRepository({
      'content/pages/home.json': '{\n  "title": "Home",\n  "slug": "home"\n}\n',
      'content/pages/broken.json': '{',
      'content/pages/notes.txt': 'not content',
    });
    const content = createContentService({ config: pith, repository });

    await expect(content.getEntry('pages', 'missing')).resolves.toBeNull();
    await expect(content.getEntry('pages', 'broken')).rejects.toMatchObject({
      code: 'CONTENT_PARSE_ERROR',
    });
    await expect(content.getEntry('pages', 'home')).resolves.toEqual(
      expect.objectContaining({
        identifier: 'home',
        revision: '1',
        value: { title: 'Home', slug: 'home', published: true },
      }),
    );

    const listed = await content.listEntries('pages');
    expect(listed.entries).toHaveLength(1);
    expect(listed.invalidEntries).toEqual([
      expect.objectContaining({ path: 'content/pages/broken.json', error: expect.any(Error) }),
    ]);

    const created = await content.writeEntry({
      collection: 'pages',
      identifier: 'about',
      value: { title: 'About', slug: 'about' },
      message: 'Create about page',
    });
    expect(created).toEqual(
      expect.objectContaining({
        path: 'content/pages/about.json',
        revision: '2',
        value: expect.any(Object),
      }),
    );

    await expect(
      content.writeEntry({
        collection: 'pages',
        identifier: 'about',
        value: { title: 'About', slug: 'about' },
        expectedRevision: 'stale',
        message: 'Update about page',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await expect(
      content.deleteEntry({
        collection: 'pages',
        identifier: 'about',
        expectedRevision: '2',
        message: 'Delete about page',
      }),
    ).resolves.toEqual({ path: 'content/pages/about.json' });
  });
});

class InMemoryRepository implements ContentRepository {
  private readonly files = new Map<string, { content: string; revision: string }>();
  private revision = 1;

  constructor(entries: Record<string, string>) {
    for (const [path, content] of Object.entries(entries)) {
      this.files.set(path, { content, revision: String(this.revision) });
    }
  }

  async read(path: string): Promise<RepositoryFile | null> {
    const file = this.files.get(path);
    return file ? { path, ...file } : null;
  }

  async list(directory: string): Promise<RepositoryFileSummary[]> {
    return [...this.files.entries()]
      .filter(([path]) => path.startsWith(`${directory}/`))
      .map(([path, file]) => ({ path, revision: file.revision }));
  }

  async write(input: WriteFileInput): Promise<WriteFileResult> {
    const current = this.files.get(input.path);

    if (input.expectedRevision !== undefined && current?.revision !== input.expectedRevision) {
      throw new RepositoryConflictError();
    }

    this.revision += 1;
    const revision = String(this.revision);
    this.files.set(input.path, { content: input.content, revision });
    return { path: input.path, revision };
  }

  async delete(input: DeleteFileInput): Promise<DeleteFileResult> {
    const current = this.files.get(input.path);

    if (input.expectedRevision !== undefined && current?.revision !== input.expectedRevision) {
      throw new RepositoryConflictError();
    }

    this.files.delete(input.path);
    return { path: input.path };
  }
}
