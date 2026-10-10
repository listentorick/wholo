import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
    // Vitest 4 no longer skips build output by default; without this the
    // compiled copies of the specs are collected too.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    // Unit-test coverage (`pnpm test:coverage`, docs/testing/coverage.md). `include`
    // lists the source so files no test imports still count, at 0%.
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.{spec,test}.*', '**/*.d.ts', '**/generated/**', '**/*.generated.*', 'src/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wholo/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
      '@wholo/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
});
