export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: ['**/*.test.ts'],
  // *.esm.test.ts need ESM (web-tree-sitter): run with `npm run test:esm`.
  // vscode-extension/ is its own npm package with its own jest config and
  // dependencies (the 'vscode' module); the root `npm ci` does not install them.
  testPathIgnorePatterns: ['/node_modules/', '\\.esm\\.test\\.ts$', '<rootDir>/vscode-extension/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};