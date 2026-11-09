/** End-to-end integration tests: *.e2e-spec.ts files under test/. Runs as native ESM. */
export default {
  rootDir: 'test',
  testRegex: '.*\\.e2e-spec\\.ts$',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
};
