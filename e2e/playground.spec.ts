import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const aboutPagePath = resolve(process.cwd(), 'apps/playground/content/pages/about.json');

test('the playground renders content through public Pith packages', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Typed content, plain files.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View content' })).toBeVisible();
  await expect(page.locator('pre', { hasText: 'pnpm add @pith-cms/cli' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'datafluent • 2026' })).toHaveAttribute(
    'href',
    'https://www.datafluent.one',
  );
  await expect(page.getByRole('link', { name: 'View Pith on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/frankstevens1/pith-cms',
  );
  await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'http://localhost:3101',
  );

  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Keep content portable.' })).toBeVisible();
  await expect(
    page
      .locator('footer')
      .evaluate((footer) => footer.getBoundingClientRect().bottom >= window.innerHeight - 1),
  ).resolves.toBe(true);

  await page.goto('/posts');
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'A Lightweight CMS' })).toBeVisible();

  await page.goto('/posts/lightweight-cms');
  await expect(page.getByRole('heading', { name: 'A Lightweight CMS' })).toBeVisible();
  await expect(
    page.getByText(
      'Content files that live in your repo, with just enough structure to be useful.',
    ),
  ).toBeVisible();

  await page.goto('/posts/missing');
  await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible();
});

test('the public Playground remembers its theme choice and offers a copyable install command', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('pith-public-theme') === null) {
      window.localStorage.setItem('pith-public-theme', 'dark');
    }
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3100',
  });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain(
    '@pith-cms/cli',
  );
});

test('the protected editor creates, updates, deletes, and logs out', async ({ page }) => {
  const identifier = `e2e-editor-${Date.now()}`;
  let created = false;

  try {
    await page.goto('/pith');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Password').fill('pith-e2e-password');
    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/login') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect((await loginResponse).status()).toBe(200);

    await expect(page.locator('.pith-editor-collection-grid')).toBeVisible();
    await page.getByRole('link', { name: /Posts/ }).click();
    await expect(page.locator('.pith-editor-breadcrumb-current')).toHaveText('Posts');
    await page.getByRole('link', { name: 'New entry' }).click();

    await page.getByLabel('Title').fill('E2E editor post');
    await page.getByLabel('Slug').fill(identifier);
    await page.getByLabel('Body').fill('Created through the protected editor.');
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create' }).click();
    expect((await createResponse).status()).toBe(200);
    created = true;

    await expect(page.locator('.pith-editor-breadcrumb-current')).toHaveText('E2E editor post');
    await page.getByLabel('Body').fill('Updated through the protected editor.');
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await updateResponse).status()).toBe(200);

    await page.goto(`/posts/${identifier}`);
    await expect(page.getByText('Updated through the protected editor.')).toBeVisible();

    await page.goto(`/pith/collections/posts/${identifier}`);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Confirm delete' }).click();
    expect((await deleteResponse).status()).toBe(200);
    created = false;
    await expect(page.locator('.pith-editor-breadcrumb-current')).toHaveText('Posts');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.goto('/pith');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  } finally {
    if (created) {
      await removeEditorEntry(page, identifier);
    }
  }
});

test('the editor previews unsaved changes and closes the preview on save', async ({ page }) => {
  const originalAboutContent = await readFile(aboutPagePath, 'utf8');
  const previewDescription = `Preview-only About description ${Date.now()}`;

  try {
    await signIn(page);
    await page.goto('/pith/collections/pages/about');
    await expect(
      page.getByText(
        'Published pages are visible to visitors. Unpublished pages remain editable and can be previewed without saving.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Preview your unsaved changes. A preview banner will appear above.'),
    ).toBeVisible();
    await page.getByLabel('Description').fill(previewDescription);
    const previewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/preview/entry') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Preview' }).click();
    expect((await previewResponse).status()).toBe(200);

    await expect(
      page.locator('.pith-editor-preview-bar').getByText('Preview mode is active.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { exact: true, name: 'View' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit preview' })).toBeVisible();

    const previewPagePromise = page.context().waitForEvent('page');
    await page.getByRole('link', { exact: true, name: 'View' }).click();
    const previewPage = await previewPagePromise;

    await previewPage.waitForURL('**/about');
    await expect(previewPage.getByText(previewDescription)).toBeVisible();
    await expect(previewPage.getByText('Preview mode is active.')).toBeVisible();
    await expect(page).toHaveURL(/\/pith\/collections\/pages\/about$/);

    const closePromise = previewPage.waitForEvent('close');
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await saveResponse).status()).toBe(200);
    await closePromise;

    await expect(page.locator('.pith-editor-preview-bar')).not.toBeVisible();
    await expect(previewPage.isClosed()).toBe(true);
    await page.goto('/about');
    await expect(page.getByText(previewDescription)).toBeVisible();
  } finally {
    await writeFile(aboutPagePath, originalAboutContent, 'utf8');
  }
});

test('the editor shows an error when preview creation fails', async ({ page }) => {
  await signIn(page);
  await page.goto('/pith/collections/pages/about');
  await page.route('**/api/pith/preview/entry', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'REPOSITORY_ERROR', message: 'Preview backend unavailable.' },
      }),
    }),
  );

  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByText('Preview backend unavailable.')).toBeVisible();
  await expect(page).toHaveURL(/\/pith\/collections\/pages\/about$/);
});

test('unpublished pages are hidden publicly but remain previewable to an editor', async ({
  page,
}) => {
  const originalAboutContent = await readFile(aboutPagePath, 'utf8');

  await signIn(page);
  await page.goto('/pith/collections/pages/about');

  const published = page.getByLabel('Published');
  await published.uncheck();

  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/pith/preview/entry') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Preview' }).click();
  expect((await previewResponse).status()).toBe(200);

  await expect(
    page.locator('.pith-editor-preview-bar').getByText('Preview mode is active.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { exact: true, name: 'View' })).toBeVisible();

  const previewPagePromise = page.context().waitForEvent('page');
  await page.getByRole('link', { exact: true, name: 'View' }).click();
  const previewPage = await previewPagePromise;
  await previewPage.waitForURL('**/about');
  await expect(previewPage.getByRole('heading', { name: 'Keep content portable.' })).toBeVisible();

  await page.goto('/pith/collections/pages/about');
  const disableResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/pith/preview/disable') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Exit preview' }).click();
  expect((await disableResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/pith\/collections\/pages\/about$/);
  await expect(page.locator('.pith-editor-preview-bar')).not.toBeVisible();
  await published.uncheck();

  try {
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await saveResponse).status()).toBe(200);

    await page.goto('/pith/collections/pages/about');

    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible();
  } finally {
    await writeFile(aboutPagePath, originalAboutContent, 'utf8');
  }
});

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/pith');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Password').fill('pith-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.pith-editor-collection-grid')).toBeVisible();
}

async function removeEditorEntry(page: import('@playwright/test').Page, identifier: string) {
  try {
    await page.goto(`/pith/collections/posts/${identifier}`);
    const deleteEntry = page.getByRole('button', { name: 'Delete' });

    if (!(await deleteEntry.isVisible())) {
      return;
    }

    await deleteEntry.click();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/pith/entries') && response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Confirm delete' }).click();
    await deleteResponse;
  } catch {
    // Preserve the original test error if cleanup cannot complete.
  }
}
