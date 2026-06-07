#!/usr/bin/env node

import { AxonParser } from '../axon-parser-full.js';

const code = '[1, 2, 3]';
console.log('Testing:', code);

try {
  const parser = new AxonParser(code);
  const ast = parser.parse();
  console.log('✓ Success!');
  console.log('AST:', JSON.stringify(ast, null, 2));
} catch (e) {
  console.log('✗ Error:', e.message);
  console.error(e.stack);
}