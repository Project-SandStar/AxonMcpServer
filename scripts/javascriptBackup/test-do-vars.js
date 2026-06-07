#!/usr/bin/env node

import { AxonParser } from '../axon-parser-full.js';

const code = `do
  x: 1
  y: 2
end`;

console.log('Testing do block with variables:');
console.log(code);
console.log();

try {
  const parser = new AxonParser(code);
  const ast = parser.parse();
  console.log('✓ Success!');
} catch (e) {
  console.log('✗ Error:', e.message);
  console.error(e.stack);
}