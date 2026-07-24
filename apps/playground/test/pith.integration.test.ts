import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContentNotFoundError, defineCollection, definePith, field } from '@pith-cms/core';
import { createPith, createPasswordAuth, hashPassword } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
import { afterEach, describe, expect, it } from 'vitest';

const config = definePith({
  contentRoot: 'content',
  collections: {
    pages: defineCollection({
      path: 'pages',
      format: 'json',
      identifierField: 'slug',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ required: true }),
      },
    }),
    posts: defineCollection({
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

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('the public Next.js and filesystem integration', () => {
  it('reads, lists, validates, and refreshes content through logical paths', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'pith-next-'));
    temporaryRoots.push(rootDirectory);
    await mkdir(join(rootDirectory, 'content/pages'), { recursive: true });
    await mkdir(join(rootDirectory, 'content/posts/nested'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'content/pages/home.json'),
      '{\n  "title": "Home",\n  "slug": "home"\n}\n',
      'utf8',
    );
    await writeFile(
      join(rootDirectory, 'content/posts/first.md'),
      '---\ntitle: First\nslug: first\n---\n\nFirst body.\n',
      'utf8',
    );
    await writeFile(
      join(rootDirectory, 'content/posts/broken.md'),
      '---\ntitle: Broken\n---\n',
      'utf8',
    );
    await writeFile(
      join(rootDirectory, 'content/posts/nested/hidden.md'),
      '---\ntitle: Hidden\nslug: hidden\n---\n\nHidden.\n',
      'utf8',
    );
    await writeFile(join(rootDirectory, 'content/posts/.pith-tmp-owned'), 'temporary', 'utf8');

    const repository = createFilesystemRepository({ rootDirectory });
    const pith = createPith({ config, repository, cache: { mode: 'no-store' } });
    const page = await pith.content.getEntry('pages', 'home');
    const post = await pith.content.getEntry('posts', 'first');
    const listed = await pith.content.listEntries('posts');

    expect(page).toMatchObject({ path: 'content/pages/home.json', value: { title: 'Home' } });
    expect(post.value.body).toBe('First body.\n');
    expect(listed.entries.map((entry) => entry.identifier)).toEqual(['first']);
    expect(listed.invalidEntries.map((entry) => entry.path)).toEqual(['content/posts/broken.md']);
    expect(await pith.content.getEntryIdentifiers('posts')).toEqual(['broken', 'first']);
    expect(page.path.startsWith(rootDirectory)).toBe(false);

    const updated = await repository.write({
      path: page.path,
      content: '{\n  "title": "Updated",\n  "slug": "home"\n}\n',
      expectedRevision: page.revision,
      message: 'Update fixture content',
    });
    const refreshed = await pith.content.getEntry('pages', 'home');

    expect(updated.revision).not.toBe(page.revision);
    expect(refreshed.value.title).toBe('Updated');
    await expect(pith.content.getEntry('pages', 'missing')).rejects.toBeInstanceOf(
      ContentNotFoundError,
    );
  });

  it('authenticates and mutates real filesystem content through editor handlers', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'pith-editor-filesystem-'));
    temporaryRoots.push(rootDirectory);
    const passwordHash = await hashPassword('editor-password');
    const pith = createPith({
      config,
      repository: createFilesystemRepository({ rootDirectory }),
      cache: { mode: 'no-store' },
      auth: createPasswordAuth({
        passwordHash,
        sessionSecret: 'a test-only session secret longer than thirty two characters',
        secure: false,
      }),
      editor: { trustedOrigins: ['http://pith.test'] },
    });
    const handlers = pith.editor.handlers;
    const loginCsrf = await handlers.GET(
      new Request('http://pith.test/api/pith/csrf?purpose=login'),
      routeContext('csrf'),
    );
    const loginToken = (await loginCsrf.json()).token as string;
    const loginCookie = cookiePair(loginCsrf.headers.get('set-cookie'));
    const login = await handlers.POST(
      jsonRequest(
        'POST',
        'login',
        { password: 'editor-password', csrfToken: loginToken },
        loginCookie,
      ),
      routeContext('login'),
    );

    expect(login.status).toBe(200);
    const sessionCookie = cookiePair(login.headers.get('set-cookie'));
    const mutationCsrf = await handlers.GET(
      new Request('http://pith.test/api/pith/csrf', { headers: { cookie: sessionCookie } }),
      routeContext('csrf'),
    );
    const csrfToken = (await mutationCsrf.json()).token as string;
    const create = await handlers.POST(
      jsonRequest(
        'POST',
        'entries',
        {
          collection: 'pages',
          identifier: 'editor-page',
          value: { title: 'Created by editor', slug: 'editor-page' },
          csrfToken,
        },
        sessionCookie,
      ),
      routeContext('entries'),
    );

    expect(create.status).toBe(200);
    const created = await pith.content.getEntry('pages', 'editor-page');
    const update = await handlers.PUT(
      jsonRequest(
        'PUT',
        'entries',
        {
          collection: 'pages',
          identifier: 'editor-page',
          value: { title: 'Updated by editor', slug: 'editor-page' },
          expectedRevision: created.revision,
          csrfToken,
        },
        sessionCookie,
      ),
      routeContext('entries'),
    );

    expect(update.status).toBe(200);
    const updated = await pith.content.getEntry('pages', 'editor-page');
    expect(updated.value.title).toBe('Updated by editor');
    await expect(
      readFile(join(rootDirectory, 'content', 'pages', 'editor-page.json'), 'utf8'),
    ).resolves.toBe('{\n  "title": "Updated by editor",\n  "slug": "editor-page"\n}\n');

    const deletion = await handlers.DELETE(
      jsonRequest(
        'DELETE',
        'entries',
        {
          collection: 'pages',
          identifier: 'editor-page',
          expectedRevision: updated.revision,
          confirmDelete: true,
          csrfToken,
        },
        sessionCookie,
      ),
      routeContext('entries'),
    );

    expect(deletion.status).toBe(200);
    await expect(pith.content.getOptionalEntry('pages', 'editor-page')).resolves.toBeNull();
  });
});

function routeContext(route: string) {
  return { params: Promise.resolve({ pithRoute: [route] }) };
}

function jsonRequest(method: string, route: string, body: unknown, cookie: string): Request {
  return new Request(`http://pith.test/api/pith/${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'http://pith.test',
    },
    body: JSON.stringify(body),
  });
}

function cookiePair(cookie: string | null): string {
  return cookie?.split(';')[0] ?? '';
}
