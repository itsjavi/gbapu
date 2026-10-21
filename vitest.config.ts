import { defineConfig } from 'vitest/config'

// The package's tests. scripts/*.test.ts run with `node --test` (`pnpm test:scripts`).
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
