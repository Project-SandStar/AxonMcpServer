#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const files = [
  'templates/fault/fault-comfort-deviation.trio',
  'templates/fault/fault-communication-loss.trio',
  'templates/fault/fault-energy-spike.trio',
  'templates/fault/fault-equipment-offline.trio',
  'templates/fault/fault-sensor-failure.trio'
];

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Count do and end keywords
  const doCount = (content.match(/\bdo\b/g) || []).length;
  const endCount = (content.match(/\bend\b/g) || []).length;
  const missing = doCount - endCount;
  
  if (missing <= 0) {
    console.log(`${path.basename(filePath)}: No missing 'end' keywords`);
    return;
  }
  
  console.log(`${path.basename(filePath)}: Adding ${missing} 'end' keywords`);
  
  // Find the line before "examples:"
  const lines = content.split('\n');
  const examplesLineIndex = lines.findIndex(line => line.startsWith('examples:'));
  
  if (examplesLineIndex === -1) {
    console.log(`  ERROR: Could not find 'examples:' line`);
    return;
  }
  
  // Insert missing 'end' keywords before examples
  const endKeywords = Array(missing).fill('  end');
  lines.splice(examplesLineIndex, 0, ...endKeywords);
  
  // Write back
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`  ✓ Fixed`);
}

files.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath);
  }
});