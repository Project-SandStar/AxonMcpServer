#!/usr/bin/env node
/**
 * Test the quality dashboard
 */
import { QualityDashboardAnalyzer } from './dist/analytics/qualityDashboard.js';

const analyzer = new QualityDashboardAnalyzer('proj');

async function testDashboard() {
  console.log('\n📊 Testing Quality Dashboard\n');
  console.log('='.repeat(70));
  
  try {
    const dashboard = await analyzer.generateDashboard('local', 'mobilytik');
    
    console.log(`\n🎯 PROJECT: ${dashboard.instance}/${dashboard.project}`);
    console.log('='.repeat(70));
    
    console.log('\n📈 SUMMARY:');
    console.log(`   Total Functions: ${dashboard.summary.totalFunctions}`);
    console.log(`   Last Sync: ${new Date(dashboard.summary.lastSync).toLocaleString()}`);
    
    console.log('\n✅ QUALITY METRICS:');
    console.log(`   Well Documented: ${dashboard.quality.wellDocumented} (${dashboard.quality.wellDocumentedPercent}%)`);
    console.log(`   Has Examples: ${dashboard.quality.hasExamples} (${dashboard.quality.hasExamplesPercent}%)`);
    console.log(`   Error Handling: ${dashboard.quality.hasErrorHandling} (${dashboard.quality.hasErrorHandlingPercent}%)`);
    
    console.log('\n🔧 COMPLEXITY:');
    console.log(`   Average LOC: ${dashboard.complexity.averageLOC}`);
    console.log(`   Average Cyclomatic Complexity: ${dashboard.complexity.averageCyclomaticComplexity}`);
    console.log(`   High Complexity (>10): ${dashboard.complexity.highComplexity} (${dashboard.complexity.highComplexityPercent}%)`);
    console.log(`   Max Complexity: ${dashboard.complexity.maxComplexity}`);
    if (dashboard.complexity.mostComplexFunction) {
      console.log(`   Most Complex: ${dashboard.complexity.mostComplexFunction}`);
    }
    
    console.log('\n⚡ PERFORMANCE:');
    console.log(`   Fast: ${dashboard.performance.fast}`);
    console.log(`   Medium: ${dashboard.performance.medium}`);
    console.log(`   Slow: ${dashboard.performance.slow}`);
    console.log(`   Batch: ${dashboard.performance.batch}`);
    console.log(`   Has Loops: ${dashboard.performance.hasLoops}`);
    
    console.log('\n💾 OPERATIONS:');
    console.log(`   Functions with Commits: ${dashboard.operations.functionsWithCommits}`);
    console.log(`   Functions with Jobs: ${dashboard.operations.functionsWithJobs}`);
    console.log(`   Functions with Emails: ${dashboard.operations.functionsWithEmails}`);
    console.log(`   Total Reads: ${dashboard.operations.totalReads}`);
    console.log(`   Total Writes: ${dashboard.operations.totalWrites}`);
    
    console.log('\n♻️  REUSABILITY:');
    console.log(`   Reusable: ${dashboard.reusability.reusable} (${dashboard.reusability.reusablePercent}%)`);
    console.log(`   Site-Specific: ${dashboard.reusability.siteSpecific} (${dashboard.reusability.siteSpecificPercent}%)`);
    
    console.log('\n📁 CATEGORIES:');
    Object.entries(dashboard.categories).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
    
    console.log('\n🏷️  TOP KEYWORDS (Top 10):');
    dashboard.topKeywords.slice(0, 10).forEach(({keyword, count}) => {
      console.log(`   ${keyword}: ${count}`);
    });
    
    console.log('\n🏭 EQUIPMENT TYPES:');
    Object.entries(dashboard.equipmentTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Quality dashboard test complete!\n');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

testDashboard();
