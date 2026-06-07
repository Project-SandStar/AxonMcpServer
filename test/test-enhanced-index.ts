#!/usr/bin/env ts-node

import { EnhancedAxonIndexer, EnhancedAxonFunction } from './src/indexer/enhancedAxonIndexer.js';
import * as path from 'path';

console.log('🔍 Testing Enhanced Axon Indexer\n');
console.log('='.repeat(70));

async function main() {
  const indexer = new EnhancedAxonIndexer();
  
  // Index the mobilytik project
  const projectDir = path.join(process.cwd(), 'proj/local/mobilytik/func');
  
  console.log(`\n📂 Indexing: ${projectDir}\n`);
  
  const index = await indexer.buildIndex(projectDir);
  
  console.log('✅ Indexing complete!\n');
  console.log('='.repeat(70));
  
  // Get statistics
  const stats = indexer.getIndexStats(index);
  
  console.log('\n📊 Index Statistics:\n');
  console.log(`Total Functions: ${stats.total}`);
  console.log(`\nBy Category:`);
  Object.entries(stats.byCategory).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count}`);
  });
  
  console.log(`\nDefComp Analysis:`);
  console.log(`  DefComp Functions: ${stats.defCompCount} (${Math.round(stats.defCompCount / stats.total * 100)}%)`);
  console.log(`  With Bindings: ${stats.withBindings}`);
  console.log(`  With Tuning: ${stats.withTuning}`);
  
  if (Object.keys(stats.ruleTypes).length > 0) {
    console.log(`\n  Rule Types:`);
    Object.entries(stats.ruleTypes).forEach(([type, count]) => {
      console.log(`    - ${type}: ${count}`);
    });
  }
  
  // Show some example functions
  console.log('\n' + '='.repeat(70));
  console.log('\n🎯 Sample DefComp Functions:\n');
  
  let sampleCount = 0;
  for (const func of index.functions.values()) {
    const enhanced = func as EnhancedAxonFunction;
    
    if (enhanced.defComp?.isDefComp && sampleCount < 3) {
      console.log(`\n${sampleCount + 1}. ${enhanced.name}`);
      console.log(`   Category: ${enhanced.category}`);
      console.log(`   Rule Type: ${enhanced.defComp.ruleType || 'N/A'}`);
      console.log(`   Slots: ${enhanced.defComp.slots?.length || 0}`);
      console.log(`   Bindings: ${enhanced.defComp.bindingCount || 0}`);
      
      if (enhanced.bindings) {
        if (enhanced.bindings.input.length > 0) {
          console.log(`   Input Binds:`);
          enhanced.bindings.input.slice(0, 2).forEach(b => {
            console.log(`     - ${b.substring(0, 60)}${b.length > 60 ? '...' : ''}`);
          });
        }
        if (enhanced.bindings.tuning.length > 0) {
          console.log(`   Tuning Parameters: ${enhanced.bindings.tuning.join(', ')}`);
        }
      }
      
      sampleCount++;
    }
  }
  
  // Show tags
  console.log('\n' + '='.repeat(70));
  console.log('\n🏷️  Tags:\n');
  
  const sortedTags = Array.from(index.tags.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  
  sortedTags.forEach(([tag, ids]) => {
    console.log(`  ${tag.padEnd(20)} - ${ids.length} functions`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ Enhanced indexing test complete!\n');
}

main().catch(console.error);
