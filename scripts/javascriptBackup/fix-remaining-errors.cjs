#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get current errors from validation
console.log('Running validation to identify remaining errors...\n');
const validationOutput = execSync('node scripts/validate-templates.js 2>&1', {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf-8'
});

// Parse errors
const errorLines = validationOutput.split('\n').filter(line => 
  line.includes('Axon parsing failed')
);

const errors = [];
for (let i = 0; i < errorLines.length; i++) {
  const match = errorLines[i].match(/Parser error at (\d+):(\d+): (.+)/);
  if (match) {
    const prevLine = validationOutput.split('\n')[validationOutput.split('\n').indexOf(errorLines[i]) - 1];
    const fileMatch = prevLine && prevLine.match(/templates\/(.+\.trio)/);
    if (fileMatch) {
      errors.push({
        file: fileMatch[1],
        line: parseInt(match[1]),
        col: parseInt(match[2]),
        message: match[3]
      });
    }
  }
}

console.log(`Found ${errors.length} parsing errors\n`);

// Group errors by type
const errorsByType = {};
errors.forEach(err => {
  const type = err.message;
  if (!errorsByType[type]) errorsByType[type] = [];
  errorsByType[type].push(err);
});

console.log('Errors by type:');
Object.keys(errorsByType).forEach(type => {
  console.log(`  ${type}: ${errorsByType[type].length} errors`);
});

module.exports = { errors, errorsByType };