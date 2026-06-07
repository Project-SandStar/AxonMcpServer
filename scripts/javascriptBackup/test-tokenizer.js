#!/usr/bin/env node

import { AxonTokenizer } from '../axon-parser-full.js';

const code = '[1, 2, 3]';
console.log('Tokenizing:', code);

const tokenizer = new AxonTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\nTokens:');
tokens.forEach((t, i) => {
  console.log(`${i}: ${t.type} = "${t.value}" at ${t.line}:${t.col}`);
});