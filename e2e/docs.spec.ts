import { expect, test } from '@playwright/test';

test('the Markdown docs render copyable code and persist an explicit theme', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('pith-public-theme') === null) {
      window.localStorage.setItem('pith-public-theme', 'dark');
    }
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3101',
  });
  await page.goto('http://localhost:3101/quick-start');

  await expect(page.getByRole('heading', { name: 'Quick start' })).toBeVisible();
  await expect(page.locator('.code-language').first()).toHaveText('sh');
  await expect(page.locator('.copyable-code-block .hljs-keyword').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const installBlock = page.locator('.copyable-code-block', { hasText: 'pnpm add' });
  await installBlock.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain(
    '@pith-cms/cli',
  );

  await page.getByRole('link', { name: 'collections' }).click();
  await expect(page).toHaveURL('http://localhost:3101/collections');
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
});
