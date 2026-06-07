#!/usr/bin/env node

import fs from 'fs';

// Read and evaluate the parser file
const parserCode = fs.readFileSync('./scripts/axon-parser-full.js', 'utf-8');

// Extract the main classes by evaluating the code
const lines = parserCode.split('\n');
let inClass = false;
let classCode = '';
let currentClass = '';

// Simple test
console.log('Testing: foo(1, 2)');
try {
  // This is a hack - we'll just load it directly
  const mod = await import('../axon-parser-full.js');
  console.log('Module keys:', Object.keys(mod));
  
  if (mod.AxonParser) {
    const parser = new mod.AxonParser('foo(1, 2)');
    const ast = parser.parse();
    console.log('✓ Success!');
  } else {
    console.log('✗ AxonParser not exported');
  }
} catch (e) {
  console.log('✗ Error:', e.message);
  console.error(e.stack);
}