import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
};

export default config;
