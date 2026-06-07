#!/usr/bin/env node

import { AxonParser } from '../axon-parser-full.js';
import fs from 'fs';
import yaml from 'js-yaml';

const filePath = 'templates/hvac/ahu-status.yaml';
const content = fs.readFileSync(filePath, 'utf8');
const doc = yaml.load(content);
const template = doc.template;

console.log('Template code:');
console.log('='.repeat(60));
console.log(template);
console.log('='.repeat(60));

const parser = new AxonParser(template);
const result = parser.parse();

console.log('\nParser result:');
console.log(`  Do count: ${result.doCount}`);
console.log(`  End count: ${result.endCount}`);
console.log(`  Balanced: ${result.balanced}`);
console.log(`  Errors: ${result.errors.length}`);
console.log(`  Warnings: ${result.warnings.length}`);

console.log('\nEnd tokens:');
result.tokens
  .filter(t => t.type === 'end')
  .forEach(t => console.log(`  Line ${t.line}, Col ${t.col}: '${t.value}'`));

console.log('\nDo tokens:');
result.tokens
  .filter(t => t.type === 'do')
  .forEach(t => console.log(`  Line ${t.line}, Col ${t.col}: '${t.value}'`));

console.log('\nErrors:');
result.errors.forEach(e => console.log(`  [${e.type}] ${e.message} at line ${e.line}, col ${e.col}`));

console.log('\nWarnings:');
result.warnings.forEach(w => console.log(`  ${w.message}`));