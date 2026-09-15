import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Mirrors the @main/@shared aliases in electron.vite.config.ts and
// tsconfig.node.json so test files resolve imports identically to the
// app's own build.
export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@test': resolve('src/test')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
