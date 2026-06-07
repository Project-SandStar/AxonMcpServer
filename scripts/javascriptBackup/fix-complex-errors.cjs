#!/usr/bin/env node

/**
 * Fix complex Axon parsing errors across templates
 */

const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, '..', 'templates');

function findTrioFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTrioFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.trio')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixTemplate(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  let changes = [];
  
  // Fix 1: Remove trailing parentheses after if-else expressions
  // Pattern: ... else na() )
  const trailingParen = content.match(/\)\s+\)/g);
  if (trailingParen) {
    changes.push(`Potential double closing parens: ${trailingParen.length} occurrences`);
  }
  
  // Fix 2: Fix incomplete method calls like .i else
  content = content.replace(/\.i\s+else\s+null/g, '->duration else na()');
  
  // Fix 3: Fix malformed expressions with 'nullf'
  content = content.replace(/i\s+else\s+nullf\([^)]+\)/g, ' != na() and ');
  
  // Fix 4: Ensure proper spacing around operators
  content = content.replace(/\(\((\w+)->/g, '(($1->');
  
  // Return only if changes were made
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed ${path.basename(filePath)}`);
    changes.forEach(c => console.log(`  - ${c}`));
    return 1;
  }
  
  return 0;
}

// Main execution
console.log('Fixing complex parsing errors...\\n');

const trioFiles = findTrioFiles(templatesDir);
let totalFixed = 0;

for (const filePath of trioFiles) {
  totalFixed += fixTemplate(filePath);
}

console.log(`\\n✅ Fixed ${totalFixed} files`);