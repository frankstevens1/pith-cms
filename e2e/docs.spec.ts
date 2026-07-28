import { expect, test } from '@playwright/test';

test('the Markdown docs render copyable code and persist an explicit theme', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3101',
  });
  await page.goto('http://localhost:3101/quick-start');

  await expect(page.getByRole('heading', { name: 'Quick start' })).toBeVisible();
  await expect(page.locator('.code-language').first()).toHaveText('sh');
  await expect(page.locator('.copyable-code-block .hljs-keyword').first()).toBeVisible();

  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();

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

test('the docs editor applies its declared Markdown authoring profile', async ({ page }) => {
  await page.goto('http://localhost:3101/pith');
  await page.getByLabel('Password').fill('pith-e2e-password');
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/pith/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.goto('http://localhost:3101/pith/collections/docs/editor');

  const bodyEditor = page.getByRole('textbox', { name: 'Body' });
  await expect(bodyEditor).toHaveAttribute('aria-multiline', 'true');
  await expect(page.getByText('GitHub Flavored Markdown')).toBeVisible();
  await expect(page.getByText('12 frontend features declared')).toBeVisible();

  const headingOne = page.getByRole('button', { name: 'Heading level 1' });
  await headingOne.focus();
  await headingOne.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Heading level 2' })).toBeFocused();

  await bodyEditor.fill('Styled text');
  await bodyEditor.selectText();
  await page.getByRole('button', { name: 'Bold text' }).click();
  await expect(bodyEditor).toHaveText('**Styled text**');

  await bodyEditor.fill('Keyboard');
  await bodyEditor.selectText();
  await bodyEditor.press('ControlOrMeta+i');
  await expect(bodyEditor).toHaveText('_Keyboard_');

  await bodyEditor.fill('#### Not declared');
  await expect(page.locator('.cm-lintRange-warning')).toBeVisible();
  // On Linux, Playwright's CDP keyboard dispatch may leave KeyboardEvent.keyCode at 0,
  // breaking CodeMirror's Mod-Shift-m key matching (w3c-keyname base table requires keyCode).
  // Dispatch a proper KeyboardEvent with explicit keyCode directly to .cm-content.
  await page.evaluate(() => {
    const isMac = /Mac/.test(navigator.platform);
    const contentEl = document.querySelector('.cm-content');
    if (!contentEl) return;
    contentEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'M',
        code: 'KeyM',
        keyCode: 77,
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator('.cm-panel-lint')).toContainText(
    "Heading level 4 is not declared in this field's frontend profile.",
  );
});
