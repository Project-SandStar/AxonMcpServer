#!/usr/bin/env node

/**
 * Load Trio templates using haystack-core TrioReader
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { TrioReader } from '../src/haystack-core/dist/index.es.js';

/**
 * Read and parse a single Trio template file
 */
export function readTrioTemplate(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const reader = new TrioReader(content);
  const dicts = reader.readAllDicts();
  
  // Convert the first dict to a plain JavaScript object
  if (dicts.length > 0) {
    const dict = dicts[0];
    
    // HDict.toJSON() converts it to a plain JavaScript object
    const obj = dict.toJSON ? dict.toJSON() : {};
    obj._file = filePath;
    return obj;
  }
  
  return null;
}

/**
 * Read all Trio template files from a directory
 */
export function readAllTrioTemplates(dirPath) {
  const templates = [];
  
  function scanDirectory(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.name.endsWith('.trio')) {
        try {
          const template = readTrioTemplate(fullPath);
          if (template) {
            templates.push(template);
          }
        } catch (e) {
          console.error(`Error reading ${fullPath}: ${e.message}`);
        }
      }
    }
  }
  
  scanDirectory(dirPath);
  return templates;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node load-trio-templates.js <trio-file>');
    console.log('       node load-trio-templates.js <directory>');
    process.exit(1);
  }
  
  const target = args[0];
  const stat = statSync(target);
  
  if (stat.isDirectory()) {
    console.log('Reading all Trio templates...\n');
    const templates = readAllTrioTemplates(target);
    console.log(`Found ${templates.length} templates:\n`);
    templates.forEach(t => {
      console.log(`  - ${t.id || 'unnamed'}: ${t.name || 'No name'}`);
      if (t.template) {
        const lines = t.template.split('\n').length;
        console.log(`    Template: ${lines} lines of Axon code`);
      }
    });
  } else {
    const template = readTrioTemplate(target);
    console.log(JSON.stringify(template, null, 2));
  }
}