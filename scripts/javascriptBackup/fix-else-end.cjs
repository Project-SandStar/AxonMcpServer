#!/usr/bin/env node

/**
 * Fix incorrect 'end' after multi-line if-else chains
 * Pattern: else "value" end, or else expr end,
 * These should just be: else "value", or else expr,
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

function fixElseEnd(content) {
  let modified = false;
  let result = content;
  const changes = [];
  
  // Pattern: else "value" end, or else value end,
  // Match else followed by expression and then end followed by comma or closing brace/bracket
  // We want to remove the 'end' keyword when it follows an else clause in a dict/list context
  
  // This is tricky because we need to detect when 'end' is incorrectly used
  // A simple heuristic: if we see 'end' followed by a comma or }, it's likely wrong
  const pattern = /\belse\s+([^e][^\n]*?)\s+end\s*([,\}])/g;
  
  result = result.replace(pattern, (match, expr, terminator) => {
    // Make sure this isn't "else do ... end" - those are valid
    if (expr.trim().endsWith('do')) {
      return match;
    }
    
    modified = true;
    const replacement = `else ${expr} ${terminator}`;
    changes.push({
      original: match.substring(0, 50),
      replacement: replacement.substring(0, 50)
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
    const { content: newContent, modified, changes } = fixElseEnd(content);
    
    if (modified) {
      // Backup original
      const backupPath = filePath + '.backup4';
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, content, 'utf8');
      }
      
      // Write fixed version
      fs.writeFileSync(filePath, newContent, 'utf8');
      
      totalFixed++;
      totalChanges += changes.length;
      
      const relativePath = path.relative(templatesDir, filePath);
      console.log(`✓ ${relativePath}`);
      console.log(`  Fixed ${changes.length} else-end expression(s)`);
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
    console.log('Backups created with .backup4 extension');
    console.log('Run validation to check if templates now parse correctly');
  } else {
    console.log('No changes needed');
  }
}

main();