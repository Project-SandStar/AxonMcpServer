import { AxonParser } from './scripts/axon-parser-full.js';
import fs from 'fs';
import yaml from 'js-yaml';

const filePath = 'templates/energy/energy-budget-tracking.yaml';
const content = fs.readFileSync(filePath, 'utf8');
const doc = yaml.load(content);
const template = doc.template;

const parser = new AxonParser(template);
const result = parser.parse();

console.log(`Do count: ${result.doCount}`);
console.log(`End count: ${result.endCount}`);

console.log('\nDo tokens:');
result.tokens
  .filter(t => t.type === 'do')
  .forEach((t, i) => console.log(`  ${i+1}. Line ${t.line}, Col ${t.col}`));

console.log('\nEnd tokens:');
result.tokens
  .filter(t => t.type === 'end')
  .forEach((t, i) => console.log(`  ${i+1}. Line ${t.line}, Col ${t.col}`));
