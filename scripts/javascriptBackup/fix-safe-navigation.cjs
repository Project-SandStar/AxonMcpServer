#!/usr/bin/env node

/**
 * Fix invalid safe navigation operators (?-> and ?.) in Trio templates
 * These operators don't exist in Axon and need to be replaced with proper null checks
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

function fixSafeNavigation(content, filePath) {
  let modified = false;
  let result = content;
  const changes = [];
  
  // Pattern 1: array.findAll(...)[0]?->field
  // Replace with: do found: array.findAll(...) if(found.isEmpty.not) found[0]->field else na() end
  const pattern1 = /(\w+\.findAll\([^)]+\))\[0\]\?->(\w+)/g;
  let match;
  
  while ((match = pattern1.exec(content)) !== null) {
    const fullMatch = match[0];
    const findAllExpr = match[1];
    const fieldName = match[2];
    
    // For now, just replace inline with a simpler pattern
    // We'll need context-aware replacement for proper do blocks
    const replacement = `(do found: ${findAllExpr}; if(found.isEmpty.not) found[0]->${fieldName} else na() end)`;
    
    changes.push({
      type: '?->',
      original: fullMatch,
      replacement: replacement,
      position: match.index
    });
  }
  
  // Apply pattern 1 replacements
  result = result.replace(pattern1, (match, findAllExpr, fieldName) => {
    modified = true;
    return `(do found: ${findAllExpr}; if(found.isEmpty.not) found[0]->${fieldName} else na() end)`;
  });
  
  // Pattern 2: variable?.method()
  // Replace with: if(variable != null) variable.method() else null
  const pattern2 = /(\w+)\?\.(\w+)\(([^)]*)\)/g;
  result = result.replace(pattern2, (match, varName, methodName, args) => {
    modified = true;
    changes.push({
      type: '?.',
      original: match,
      replacement: `if(${varName} != null) ${varName}.${methodName}(${args}) else null`,
      position: content.indexOf(match)
    });
    return `if(${varName} != null) ${varName}.${methodName}(${args}) else null`;
  });
  
  // Pattern 3: variable?.field (property access)
  // Replace with: if(variable != null) variable.field else null
  const pattern3 = /(\w+)\?\.(\w+)(?!\()/g;
  result = result.replace(pattern3, (match, varName, fieldName) => {
    modified = true;
    changes.push({
      type: '?.', 
      original: match,
      replacement: `if(${varName} != null) ${varName}.${fieldName} else null`,
      position: content.indexOf(match)
    });
    return `if(${varName} != null) ${varName}.${fieldName} else null`;
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
    const { content: newContent, modified, changes } = fixSafeNavigation(content, filePath);
    
    if (modified) {
      // Backup original
      const backupPath = filePath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, content, 'utf8');
      }
      
      // Write fixed version
      fs.writeFileSync(filePath, newContent, 'utf8');
      
      totalFixed++;
      totalChanges += changes.length;
      
      const relativePath = path.relative(templatesDir, filePath);
      console.log(`✓ ${relativePath}`);
      console.log(`  Fixed ${changes.length} safe navigation operator(s)`);
      
      // Show first few changes as examples
      changes.slice(0, 3).forEach(change => {
        console.log(`    ${change.type}: ${change.original.substring(0, 50)}${change.original.length > 50 ? '...' : ''}`);
      });
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
    console.log('Backups created with .backup extension');
    console.log('Run validation to check if templates now parse correctly');
  } else {
    console.log('No changes needed - all templates already use valid Axon syntax');
  }
}

main();