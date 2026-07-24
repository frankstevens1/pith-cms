import { defineCollection, definePith, field } from '@pith-cms/core';
import type {
  ContentRepository,
  DeleteFileInput,
  DeleteFileResult,
  RepositoryFile,
  RepositoryFileSummary,
  WriteFileInput,
  WriteFileResult,
} from '@pith-cms/core';

export const testConfig = definePith({
  contentRoot: 'content',
  collections: {
    pages: defineCollection({
      label: 'Pages',
      path: 'pages',
      format: 'json',
      identifierField: 'slug',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ required: true }),
        published: field.boolean({ defaultValue: true }),
      },
    }),
    posts: defineCollection({
      label: 'Posts',
      path: 'posts',
      format: 'markdown',
      identifierField: 'slug',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ required: true }),
        body: field.markdown({ required: true }),
      },
    }),
  },
});

export class MemoryRepository implements ContentRepository {
  readonly files = new Map<string, RepositoryFile>();
  readonly readPaths: string[] = [];
  readonly listDirectories: string[] = [];

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, this.toFile(path, content));
    }
  }

  async read(path: string): Promise<RepositoryFile | null> {
    this.readPaths.push(path);
    return this.files.get(path) ?? null;
  }

  async list(directory: string): Promise<RepositoryFileSummary[]> {
    this.listDirectories.push(directory);
    const prefix = `${directory}/`;

    return [...this.files.values()]
      .filter(
        (file) => file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/'),
      )
      .map(({ path, revision, updatedAt }) => ({
        path,
        revision,
        ...(updatedAt === undefined ? {} : { updatedAt }),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async write(input: WriteFileInput): Promise<WriteFileResult> {
    const current = this.files.get(input.path);

    if (input.expectedRevision !== undefined && current?.revision !== input.expectedRevision) {
      throw new Error('Unexpected test repository revision.');
    }

    const file = this.toFile(input.path, input.content);
    this.files.set(input.path, file);
    return { path: file.path, revision: file.revision };
  }

  async delete(input: DeleteFileInput): Promise<DeleteFileResult> {
    this.files.delete(input.path);
    return { path: input.path };
  }

  private toFile(path: string, content: string): RepositoryFile {
    return {
      path,
      content,
      revision: `revision:${content.length}:${content}`,
      updatedAt: '2026-07-20T10:00:00.000Z',
    };
  }
}

export const validFiles = {
  'content/pages/home.json': '{\n  "title": "Home",\n  "slug": "home"\n}\n',
  'content/posts/first-post.md':
    '---\ntitle: First post\nslug: first-post\n---\n\nThe first post.\n',
};
