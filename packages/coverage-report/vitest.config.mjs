import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['src/**/*.mjs'],
      exclude: ['**/*.{spec,test}.*'],
    },
  },
});
