#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files with "Unexpected token: )" errors
const files = [
  'templates/fault/fault-comfort-deviation.trio',
  'templates/fault/fault-communication-loss.trio',
  'templates/fault/fault-energy-spike.trio',
  'templates/fault/fault-equipment-offline.trio',
  'templates/fault/fault-sensor-failure.trio'
];

function diagnoseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  console.log(`\n=== ${path.basename(filePath)} ===`);
  
  let parenStack = [];
  let doStack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Track parentheses
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '(') {
        parenStack.push({ line: lineNum, col: j + 1 });
      } else if (char === ')') {
        if (parenStack.length === 0) {
          console.log(`Line ${lineNum}: Extra closing paren at col ${j + 1}`);
          console.log(`  ${line}`);
        } else {
          parenStack.pop();
        }
      }
    }
    
    // Track do/end balance
    const doMatches = line.match(/\bdo\b/g);
    const endMatches = line.match(/\bend\b/g);
    
    if (doMatches) {
      doMatches.forEach(() => doStack.push(lineNum));
    }
    if (endMatches) {
      endMatches.forEach(() => {
        if (doStack.length === 0) {
          console.log(`Line ${lineNum}: Extra 'end' keyword`);
        } else {
          doStack.pop();
        }
      });
    }
  }
  
  if (parenStack.length > 0) {
    console.log(`Unclosed parentheses: ${parenStack.length}`);
    parenStack.slice(0, 5).forEach(p => {
      console.log(`  Line ${p.line}, col ${p.col}`);
    });
  }
  
  if (doStack.length > 0) {
    console.log(`Unclosed 'do' blocks: ${doStack.length}`);
    doStack.slice(0, 5).forEach(lineNum => {
      console.log(`  Line ${lineNum}`);
    });
  }
}

files.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    diagnoseFile(fullPath);
  }
});