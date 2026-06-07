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
console.log(`Balanced: ${result.balanced}`);
console.log(`Errors: ${result.errors.length}`);

console.log('\nErrors:');
result.errors.forEach(e => console.log(`  [${e.type}] ${e.message} at line ${e.line}`));
