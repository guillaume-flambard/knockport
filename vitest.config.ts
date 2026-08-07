import { defineConfig } from 'vitest/config'
import { join } from 'node:path'

export default defineConfig({
  test: {
    // The core tests live in packages/core/test; the web tests live in
    // apps/web/test. Vitest picks up *.test.ts anywhere, but keeping the
    // include explicit avoids scanning node_modules and the retired crates.
    include: ['packages/**/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
    // The web test files set KNOCKPORT_DB=:memory: before importing the db
    // module. The value must be set before that module's first import, which
    // happens at test file evaluation, so env is configured in the setup.
    setupFiles: ['apps/web/test/setup.ts'],
  },
  resolve: {
    alias: {
      // pnpm keeps `ws` (and `next`) inside apps/web/node_modules, not the
      // root. Tests import attach.ts which imports ws, so point vitest at the
      // real install.
      ws: join(import.meta.dirname, 'apps', 'web', 'node_modules', 'ws'),
    },
  },
})
