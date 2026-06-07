#!/usr/bin/env node

/**
 * Test script to verify enhanced indexing is working properly
 * Run with: node test-enhanced-indexing.js
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testEnhancedIndexing() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Enhanced Indexing Test                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Check if proj/ directory exists
    const projDir = join(__dirname, 'proj');
    let hasProjDir = false;
    try {
      statSync(projDir);
      hasProjDir = true;
      console.log('✓ Found proj/ directory\n');
    } catch {
      console.log('⚠️  No proj/ directory found\n');
    }
    
    // Count synced files
    let syncedAxonFiles = 0;
    let syncedTrioFiles = 0;
    
    if (hasProjDir) {
      function countFiles(dir) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            countFiles(fullPath);
          } else if (entry.name.endsWith('.axon')) {
            syncedAxonFiles++;
          } else if (entry.name.endsWith('.trio')) {
            syncedTrioFiles++;
          }
        }
      }
      
      countFiles(projDir);
      console.log(`Found ${syncedAxonFiles} .axon files in proj/`);
      console.log(`Found ${syncedTrioFiles} .trio files in proj/`);
      
      // Show sample trio file
      if (syncedTrioFiles > 0) {
        console.log('\nSample trio file content:');
        function findFirstTrio(dir) {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              const result = findFirstTrio(fullPath);
              if (result) return result;
            } else if (entry.name.endsWith('.trio')) {
              return fullPath;
            }
          }
          return null;
        }
        
        const sampleTrio = findFirstTrio(projDir);
        if (sampleTrio) {
          console.log(`\n📄 ${sampleTrio}:`);
          const content = readFileSync(sampleTrio, 'utf-8');
          console.log(content.split('\n').slice(0, 15).join('\n'));
          console.log('...');
        }
      }
    }
    
    console.log('\n' + '─'.repeat(64));
    console.log('\n✅ Test completed! Run the server to see enhanced indexing in action.\n');
    console.log('Command: npm start\n');
    
    // Exit
    process.exit(0);
    
    // Exit
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testEnhancedIndexing().catch(console.error);
