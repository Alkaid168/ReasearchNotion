import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/rebuild-native-global-setup.cjs'],
    // Renderer tests temporarily replace browser globals such as navigator.clipboard.
    // Keep files isolated in time so those mocks cannot race across test files.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
})
