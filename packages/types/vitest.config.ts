import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    // Unit-test coverage (`pnpm test:coverage`, docs/testing/coverage.md). `include`
    // lists the source so files no test imports still count, at 0%.
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.{spec,test}.*', '**/*.d.ts', '**/generated/**', '**/*.generated.*'],
    },
  },
});
