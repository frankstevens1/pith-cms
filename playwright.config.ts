import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // The Playground editor tests intentionally mutate one filesystem-backed
  // content tree, so parallel workers would race its files and cache state.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'node scripts/prepare-playwright.mjs && pnpm --filter pith-playground build && pnpm --filter pith-playground start',
      env: {
        ...process.env,
        PITH_PASSWORD_HASH:
          '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
        PITH_PLAYWRIGHT_PASSWORD_HASH:
          '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
        PITH_SESSION_SECRET:
          'playwright-only-session-secret-that-is-longer-than-thirty-two-characters',
        PITH_PREVIEW_SECRET:
          'playwright-only-preview-secret-that-is-longer-than-thirty-two-characters',
        PITH_REPOSITORY_PROVIDER: 'filesystem',
        PITH_SESSION_SECURE: 'false',
        REDIS_URL: '',
      },
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter pith-docs build && pnpm --filter pith-docs start',
      env: {
        ...process.env,
        PITH_PLAYWRIGHT_PASSWORD_HASH:
          '$argon2id$v=19$m=65536,t=3,p=4$Burn7y4uypR4bfiJKJtjQw$sAMpSgoymDTkB+kH7sq8eOOnwhapl2/5NZwkzTgGW2I',
        PITH_REPOSITORY_PROVIDER: 'filesystem',
        PITH_SESSION_SECRET:
          'playwright-only-docs-session-secret-longer-than-thirty-two-characters',
        PITH_SESSION_SECURE: 'false',
        REDIS_URL: '',
      },
      url: 'http://localhost:3101',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
