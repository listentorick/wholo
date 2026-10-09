import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.spec.js'],
    // Unit-test coverage (`pnpm test:coverage`, docs/testing/coverage.md). `include`
    // lists the source so files no test imports still count, at 0%.
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['themes/**/*.js'],
      exclude: ['**/*.{spec,test}.*', '**/*.d.ts', '**/generated/**', '**/*.generated.*'],
    },
  },
});
