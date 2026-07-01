import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  testEnvironment: 'node',
  testTimeout: 30000,
};

export default config;
