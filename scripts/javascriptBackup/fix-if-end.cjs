#!/usr/bin/env node

/**
 * Fix incorrect 'end' keywords after single-line if-else expressions
 * In Axon, simple if-expressions don't need 'end':
 *   Correct: if(x) a else b
 *   Incorrect: if(x) a else b end
 * The 'end' should only be used for do-blocks
 */

const fs = require('fs');
const path = require('path');

function findTrioFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTrioFiles(fullPath));
    } else if (entry.name.endsWith('.trio')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixIfEnd(content) {
  let modified = false;
  let result = content;
  const changes = [];
  
  // Pattern: if(...) expr else expr end
  // This should be: if(...) expr else expr
  // We need to be careful to only match single-line if-else-end, not do-blocks
  
  // Match: if (cond) simple_expr else simple_expr end
  // Where simple_expr doesn't contain 'do'
  const pattern = /if\s*\([^)]+\)\s+([^d][^\n]*?)\s+else\s+([^d][^\n]*?)\s+end(?=\s|$)/g;
  
  result = result.replace(pattern, (match, trueExpr, falseExpr) => {
    // Check if either expression contains 'do' - if so, don't modify
    if (trueExpr.includes(' do') || falseExpr.includes(' do')) {
      return match;
    }
    
    modified = true;
    const replacement = `if (${match.match(/if\s*\(([^)]+)\)/)[1]}) ${trueExpr.trim()} else ${falseExpr.trim()}`;
    changes.push({
      original: match,
      replacement: replacement
    });
    return replacement;
  });
  
  return { content: result, modified, changes };
}

function main() {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const files = findTrioFiles(templatesDir);
  
  console.log(`Found ${files.length} Trio template files\n`);
  
  let totalFixed = 0;
  let totalChanges = 0;
  
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const { content: newContent, modified, changes } = fixIfEnd(content);
    
    if (modified) {
      // Backup original
      const backupPath = filePath + '.backup2';
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, content, 'utf8');
      }
      
      // Write fixed version
      fs.writeFileSync(filePath, newContent, 'utf8');
      
      totalFixed++;
      totalChanges += changes.length;
      
      const relativePath = path.relative(templatesDir, filePath);
      console.log(`✓ ${relativePath}`);
      console.log(`  Fixed ${changes.length} if-else-end expression(s)`);
      console.log('');
    }
  }
  
  console.log('=====================================');
  console.log(`Summary:`);
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files modified: ${totalFixed}`);
  console.log(`  Total changes: ${totalChanges}`);
  console.log('=====================================\n');
  
  if (totalFixed > 0) {
    console.log('Backups created with .backup2 extension');
    console.log('Run validation to check if templates now parse correctly');
  } else {
    console.log('No changes needed');
  }
}

main();