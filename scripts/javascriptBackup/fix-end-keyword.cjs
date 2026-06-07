#!/usr/bin/env node

/**
 * Fix 'end' keyword conflicts in dictionary literals
 * The Axon parser treats 'end:' as the end keyword, not a dict key
 * Replace 'end:' with 'endTime:' or 'endTs:' and update all references
 */

const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, '..', 'templates');

// Find all trio files
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

function fixEndKeyword(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modified = content;
  let changes = [];
  
  // Pattern 1: end: value in dict literals
  // Be careful to only match inside {...} blocks, not the standalone 'end' keyword
  const endKeyPattern = /(\{[^}]*?)(\bend:\s)/g;
  let match;
  let tempContent = modified;
  
  while ((match = endKeyPattern.exec(content)) !== null) {
    changes.push({
      line: content.substring(0, match.index).split('\n').length,
      from: match[0],
      context: content.substring(Math.max(0, match.index - 30), Math.min(content.length, match.index + 50))
    });
  }
  
  if (changes.length > 0) {
    // Replace 'end:' with 'endTime:' in dictionary literals
    // Match patterns like: {start: ..., end: ..., ...}
    modified = modified.replace(/\bend:\s+([^,}\n]+)/g, 'endTime: $1');
    
    // Also need to update all references like ->end to ->endTime
    modified = modified.replace(/->end\b/g, '->endTime');
    
    // Update references like evt->end
    modified = modified.replace(/(\w+)->end\b/g, '$1->endTime');
    
    // Update comparisons like (b->end - b->start)
    modified = modified.replace(/(\w+)->end(\s*[-+*/)])/g, '$1->endTime$2');
    
    console.log(`✓ Fixed ${changes.length} 'end:' occurrences in ${path.basename(filePath)}`);
    changes.forEach(change => {
      console.log(`  Line ${change.line}: ${change.context.replace(/\n/g, ' ')}`);
    });
    
    fs.writeFileSync(filePath, modified, 'utf-8');
    return changes.length;
  }
  
  return 0;
}

// Main execution
console.log('Fixing "end" keyword conflicts in Axon templates...\n');

const trioFiles = findTrioFiles(templatesDir);
let totalFixed = 0;

for (const filePath of trioFiles) {
  const fixed = fixEndKeyword(filePath);
  totalFixed += fixed;
}

console.log(`\n✅ Fixed ${totalFixed} total occurrences across ${trioFiles.length} files`);