// ESM-only tests (tree-sitter parser uses import.meta). Run: npm run test:esm
import base from './jest.config.js';

export default {
  ...base,
  testMatch: ['**/src/**/*.esm.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
