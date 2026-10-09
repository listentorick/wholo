import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  // Unit-test coverage (`pnpm test:coverage`, docs/testing/coverage.md). Every
  // source file counts, tested or not; module wiring and the bootstrap do not.
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.d.ts',
    '!**/generated/**',
    '!**/*.generated.ts',
    '!**/*.module.ts',
    '!main.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['json-summary', 'html', 'text-summary'],
};

export default config;
