#!/usr/bin/env node
/**
 * Test the enhanced Axon parser
 */
import { EnhancedAxonParser } from './dist/parser/enhancedAxonParser.js';
import { promises as fs } from 'fs';
import * as path from 'path';

const parser = new EnhancedAxonParser();

async function testEnhancedParser() {
  console.log('\n🧪 Testing Enhanced Axon Parser\n');
  console.log('='.repeat(60));
  
  try {
    // Test with a real function from mobilytik
    const funcPath = 'proj/local/mobilytik/func/addEnumPoints.axon';
    const source = await fs.readFile(funcPath, 'utf-8');
    
    console.log(`\n📄 Analyzing: addEnumPoints.axon`);
    console.log(`   Size: ${source.length} bytes`);
    console.log(`   Lines: ${source.split('\n').length}`);
    
    // Parse with enhanced parser
    const metadata = parser.parseEnhancedFunction(
      source,
      'addEnumPoints',
      'local',
      'mobilytik',
      'test-hash-123'
    );
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 ENHANCED METADATA RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n1️⃣  SIGNATURE:');
    console.log(`   Parameters: ${metadata.signature.parameters.length}`);
    for (const param of metadata.signature.parameters) {
      console.log(`     • ${param.name}${param.type ? ': ' + param.type : ''}${param.required ? ' (required)' : ' (optional)'}`);
    }
    console.log(`   Return Type: ${metadata.signature.returnType || 'void'}`);
    console.log(`   Async: ${metadata.signature.isAsync}`);
    
    console.log('\n2️⃣  DEPENDENCIES:');
    console.log(`   Functions called: ${metadata.dependencies.functions.length}`);
    if (metadata.dependencies.functions.length > 0) {
      console.log(`     ${metadata.dependencies.functions.slice(0, 5).join(', ')}${metadata.dependencies.functions.length > 5 ? '...' : ''}`);
    }
    console.log(`   Tags used: ${metadata.dependencies.tags.length}`);
    if (metadata.dependencies.tags.length > 0) {
      console.log(`     ${metadata.dependencies.tags.join(', ')}`);
    }
    console.log(`   Queries: ${metadata.dependencies.queries.join(', ') || 'none'}`);
    console.log(`   External APIs: ${metadata.dependencies.externalApis.join(', ') || 'none'}`);
    
    console.log('\n3️⃣  COMPLEXITY:');
    console.log(`   Lines of Code: ${metadata.complexity.linesOfCode}`);
    console.log(`   Cyclomatic Complexity: ${metadata.complexity.cyclomaticComplexity}`);
    console.log(`   Nesting Depth: ${metadata.complexity.nestedDepth}`);
    console.log(`   Comment Ratio: ${(metadata.complexity.commentRatio * 100).toFixed(1)}%`);
    
    console.log('\n4️⃣  OPERATIONS:');
    console.log(`   Reads from: ${metadata.operations.reads.join(', ') || 'none'}`);
    console.log(`   Writes to: ${metadata.operations.writes.join(', ') || 'none'}`);
    console.log(`   Commits: ${metadata.operations.commits ? '✅' : '❌'}`);
    console.log(`   Jobs: ${metadata.operations.jobs ? '✅' : '❌'}`);
    console.log(`   Emails: ${metadata.operations.emails ? '✅' : '❌'}`);
    
    console.log('\n5️⃣  DOCUMENTATION:');
    console.log(`   Description: ${metadata.documentation.description || '(none)'}`);
    console.log(`   Examples: ${metadata.documentation.examples.length}`);
    for (const example of metadata.documentation.examples) {
      console.log(`     • ${example}`);
    }
    console.log(`   Author: ${metadata.documentation.author || '(unknown)'}`);
    console.log(`   Notes: ${metadata.documentation.notes.length}`);
    
    console.log('\n6️⃣  USAGE PATTERNS:');
    console.log(`   Category: ${metadata.patterns.category}`);
    console.log(`   Subcategory: ${metadata.patterns.subcategory || '(none)'}`);
    console.log(`   Use Case: ${metadata.patterns.useCase}`);
    console.log(`   Keywords: ${metadata.patterns.keywords.slice(0, 10).join(', ')}`);
    
    console.log('\n7️⃣  PERFORMANCE:');
    console.log(`   Estimated Runtime: ${metadata.performance.estimatedRuntime}`);
    console.log(`   Has Loops: ${metadata.performance.hasLoops ? '✅' : '❌'}`);
    console.log(`   Has Recursion: ${metadata.performance.hasRecursion ? '✅' : '❌'}`);
    console.log(`   Dataset Size: ${metadata.performance.datasetSize}`);
    
    console.log('\n8️⃣  CONTEXT:');
    console.log(`   Site Specific: ${metadata.context.siteSpecific ? '✅' : '❌'}`);
    console.log(`   Project: ${metadata.context.projectName}`);
    console.log(`   Instance: ${metadata.context.instanceName}`);
    console.log(`   Shared Across Projects: ${metadata.context.sharedAcrossProjects ? '✅' : '❌'}`);
    
    console.log('\n9️⃣  QUALITY:');
    console.log(`   Has Documentation: ${metadata.quality.hasDocumentation ? '✅' : '❌'}`);
    console.log(`   Has Examples: ${metadata.quality.hasExamples ? '✅' : '❌'}`);
    console.log(`   Has Error Handling: ${metadata.quality.hasErrorHandling ? '✅' : '❌'}`);
    console.log(`   Has Tests: ${metadata.quality.hasTests ? '✅' : '❌'}`);
    
    console.log('\n🔟 RELATIONSHIPS:');
    console.log(`   Related Equipment: ${metadata.relationships.relatedEquipTypes.join(', ') || 'none'}`);
    console.log(`   Similar Functions: ${metadata.relationships.similarFunctions.length}`);
    console.log(`   Prerequisites: ${metadata.relationships.prerequisiteFunctions.length}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('📦 METADATA SIZE:');
    const metadataStr = JSON.stringify(metadata, null, 2);
    console.log(`   JSON size: ${metadataStr.length} bytes`);
    console.log(`   Compression ratio: ${(metadataStr.length / source.length * 100).toFixed(1)}%`);
    
    // Save to file for inspection
    await fs.writeFile('test-metadata.json', metadataStr, 'utf-8');
    console.log(`   ✅ Saved to: test-metadata.json`);
    
    console.log('\n✅ Enhanced parsing test complete!\n');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

testEnhancedParser();
