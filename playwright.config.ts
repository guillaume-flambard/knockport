import { defineConfig } from '@playwright/test'

// The dev server and the tests share one disposable database file. globalSetup
// seeds the journeys the suite needs; Playwright runs globalSetup before the
// webServer, so the server starts against a prepared database.
const DB = '/tmp/knockport-e2e.db'
const PORT = '3124'

export default defineConfig({
  testDir: './apps/web/test/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: './apps/web/test/e2e/global-setup.ts',
  snapshotPathTemplate: '{testDir}/../visual/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command:
      `bash -c 'pnpm build:terminal && ` +
      `cd apps/web && ` +
      `KNOCKPORT_DB=${DB} KNOCKPORT_STUDIO_PASS=e2epass KNOCKPORT_LOGIN_MAX_ATTEMPTS=1000 ` +
      `PORT=${PORT} HOSTNAME=127.0.0.1 node server.ts'`,
    url: `http://127.0.0.1:${PORT}/studio/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
