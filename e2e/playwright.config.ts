import { defineConfig, devices } from '@playwright/test';

import { bffOrigin, foreignHost } from './shared.js';

// The browser tests (TDD-identity-experience-001 §Cross-Site Request Forgery, TDD-identity-experience-003
// §Accessibility in a Browser): Chromium against the BFF serving the built applications, started by
// stack.ts. They need the applications built (pnpm build) and the PostgreSQL the BFF's tests use.
export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: bffOrigin,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      // The foreign site resolves to this machine, under a host the BFF does not share, so a page
      // there is cross-site to the BFF as an attacker's page would be.
      args: [`--host-resolver-rules=MAP ${foreignHost} 127.0.0.1`],
    },
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'tsx stack.ts',
    url: `${bffOrigin}/healthz`,
    reuseExistingServer: false,
    // A SIGTERM lets the stack close the BFF and drop its schema before it exits.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // Small files the stand-in kernel writes stay in this package's ignored output, never in /tmp.
    env: { TMPDIR: `${import.meta.dirname}/test-results/.tmp` },
  },
});
