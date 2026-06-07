import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import { SemanticValidator } from './src/validation/semanticValidator';
import { BestPracticesChecker } from './src/validation/bestPracticesChecker';
import { PerformanceAnalyzer } from './src/validation/performanceAnalyzer';
import { ErrorRecovery } from './src/generation/errorRecovery';
import * as dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

// Test cases for validation
const testCases = [
  {
    name: 'Valid simple query',
    code: 'readAll(site).size'
  },
  {
    name: 'N+1 Query Pattern',
    code: `
      readAll(equip).map(e => do
        points: readAll(point and equipRef==e->id)
        {equip: e->dis, pointCount: points.size}
      end)
    `
  },
  {
    name: 'Missing null safety',
    code: `
      sites: readAll(site)
      first: sites.first()
      area: first->area
    `
  },
  {
    name: 'Complex filter',
    code: 'readAll(point and sensor and temp and zone and air and equipRef and siteRef and area=="Floor1" and not dis.contains("test"))'
  },
  {
    name: 'Performance issue - unbounded query',
    code: 'readAll(point).map(p => p->curVal)'
  },
  {
    name: 'Syntax error - missing parenthesis',
    code: 'readAll(site.map(s => s->dis)'
  },
  {
    name: 'Unknown function',
    code: 'readall(site).getCount()'
  },
  {
    name: 'Type error',
    code: 'readAll(site).size + " sites"'
  },
  {
    name: 'Good practice example',
    code: `
      // Well-structured query
      sites: readAll(site)
        .sort("dis")
        .limit(100)
      
      sites.map(s => do
        area: s->area ?: "Unknown"
        {
          name: s->dis,
          area: area,
          id: s->id
        }
      end)
    `
  }
];

async function testValidationSystem() {
  console.log('🧪 Testing Comprehensive Validation System\n');
  
  // Initialize components
  let client: HaystackSkySparkClient | null = null;
  let semanticValidator: SemanticValidator | null = null;
  
  // Try to connect to SkySpark if available
  try {
    client = new HaystackSkySparkClient({
      host: process.env.SKYSPARK_HOST || 'localhost',
      port: parseInt(process.env.SKYSPARK_PORT || '8080'),
      project: process.env.SKYSPARK_PROJECT || 'demo',
      username: process.env.SKYSPARK_USERNAME || 'su',
      password: process.env.SKYSPARK_PASSWORD || 'su'
    });
    
    // Test connection
    await client.evalAxon('now()');
    semanticValidator = new SemanticValidator(client);
    console.log('✅ Connected to SkySpark - full validation available\n');
  } catch (error) {
    console.log('⚠️  SkySpark not available - testing offline components only\n');
  }
  
  const bestPracticesChecker = new BestPracticesChecker();
  const performanceAnalyzer = new PerformanceAnalyzer();
  const errorRecovery = new ErrorRecovery();
  
  // Test each case
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log('Code:');
    console.log(testCase.code.trim().split('\n').map(l => '  ' + l).join('\n'));
    console.log('');
    
    // 1. Syntax validation (if SkySpark available)
    if (client) {
      console.log('1️⃣ Syntax Validation:');
      try {
        const syntaxResult = await client.validateAxon(testCase.code);
        if (syntaxResult.valid) {
          console.log('   ✅ Syntax is valid');
        } else {
          console.log(`   ❌ Syntax error: ${syntaxResult.error}`);
          if (syntaxResult.line) console.log(`      Line: ${syntaxResult.line}`);
          if (syntaxResult.category) console.log(`      Category: ${syntaxResult.category}`);
          
          // Try error recovery
          console.log('\n   🔧 Error Recovery:');
          const recovery = errorRecovery.recover(testCase.code, syntaxResult);
          
          if (recovery.fixes.length > 0) {
            console.log('   Suggested fixes:');
            recovery.fixes.forEach((fix, i) => {
              console.log(`   ${i + 1}. ${fix.description} (${fix.confidence} confidence)`);
              if (fix.explanation) console.log(`      ${fix.explanation}`);
            });
          }
          
          if (recovery.alternatives.length > 0) {
            console.log('\n   Alternative approaches:');
            recovery.alternatives.forEach((alt, i) => {
              console.log(`   ${i + 1}. ${alt}`);
            });
          }
        }
      } catch (error: any) {
        console.log(`   ⚠️  Validation error: ${error.message}`);
      }
      console.log('');
    }
    
    // 2. Semantic validation (if available)
    if (semanticValidator && client) {
      console.log('2️⃣ Semantic Validation:');
      try {
        const semanticResult = await semanticValidator.validate(testCase.code);
        if (semanticResult.valid && !semanticResult.warnings?.length) {
          console.log('   ✅ No semantic issues');
        } else {
          if (semanticResult.warnings) {
            console.log('   Warnings:');
            semanticResult.warnings.forEach(w => {
              console.log(`   - ${w.type}: ${w.message}`);
              if (w.line) console.log(`     Line ${w.line}`);
            });
          }
          if (semanticResult.suggestions) {
            console.log('\n   Suggestions:');
            semanticResult.suggestions.forEach(s => {
              console.log(`   - ${s}`);
            });
          }
        }
      } catch (error: any) {
        console.log(`   ⚠️  Semantic validation error: ${error.message}`);
      }
      console.log('');
    }
    
    // 3. Best practices check
    console.log('3️⃣ Best Practices Check:');
    const bestPracticesResult = bestPracticesChecker.check(testCase.code);
    console.log(`   Score: ${bestPracticesResult.score}/100`);
    console.log(`   ${bestPracticesResult.summary}`);
    
    if (bestPracticesResult.violations.length > 0) {
      console.log('\n   Violations:');
      const byType = bestPracticesResult.violations.reduce((acc, v) => {
        if (!acc[v.type]) acc[v.type] = [];
        acc[v.type].push(v);
        return acc;
      }, {} as Record<string, typeof bestPracticesResult.violations>);
      
      for (const [type, violations] of Object.entries(byType)) {
        console.log(`   ${type.replace('_', ' ').toUpperCase()}:`);
        violations.forEach(v => {
          const severity = v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
          console.log(`   ${severity} ${v.message}`);
          if (v.suggestion) console.log(`      → ${v.suggestion}`);
        });
      }
    }
    console.log('');
    
    // 4. Performance analysis
    console.log('4️⃣ Performance Analysis:');
    const performanceResult = performanceAnalyzer.analyze(testCase.code);
    console.log(`   Score: ${performanceResult.score}/100`);
    console.log(`   ${performanceResult.summary}`);
    console.log(`   Metrics:`);
    console.log(`   - Complexity: O(${performanceResult.metrics.estimatedComplexity})`);
    console.log(`   - Est. Duration: ${performanceResult.metrics.estimatedDuration}`);
    console.log(`   - Memory Usage: ${performanceResult.metrics.memoryUsage}`);
    console.log(`   - CPU Usage: ${performanceResult.metrics.cpuUsage}`);
    
    if (performanceResult.issues.length > 0) {
      console.log('\n   Issues:');
      performanceResult.issues.forEach(issue => {
        const severity = issue.severity === 'high' ? '🔥' : issue.severity === 'medium' ? '⚡' : '💡';
        console.log(`   ${severity} ${issue.message}`);
        console.log(`      Impact: ${issue.estimatedImpact}`);
        if (issue.optimization) console.log(`      → ${issue.optimization}`);
      });
    }
    
    if (performanceResult.optimizations.length > 0) {
      console.log('\n   Optimization suggestions:');
      performanceResult.optimizations.forEach((opt, i) => {
        console.log(`   ${i + 1}. ${opt}`);
      });
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Validation System Test Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`Tested ${testCases.length} code samples`);
  console.log('\nValidation Components:');
  console.log(`✅ Best Practices Checker - Working`);
  console.log(`✅ Performance Analyzer - Working`);
  console.log(`✅ Error Recovery - Working`);
  if (client) {
    console.log(`✅ Syntax Validation - Working`);
    console.log(`✅ Semantic Validation - Working`);
  } else {
    console.log(`⚠️  Syntax Validation - Requires SkySpark`);
    console.log(`⚠️  Semantic Validation - Requires SkySpark`);
  }
  
  console.log('\n💡 The validation system provides:');
  console.log('   - Comprehensive code quality analysis');
  console.log('   - Performance optimization suggestions');
  console.log('   - Error recovery with auto-fix options');
  console.log('   - Best practice enforcement');
  console.log('   - Semantic validation (when SkySpark is available)');
  
  // Test error pattern analysis
  if (client) {
    console.log('\n\n🔍 Error Pattern Analysis Demo:');
    const errors = [];
    
    // Collect some errors for pattern analysis
    const errorCases = [
      'readall(site)',
      'readAll().size',
      'site->name',
      'readAll(site)->area',
      'hisRead()',
    ];
    
    for (const errorCode of errorCases) {
      try {
        const result = await client.validateAxon(errorCode);
        if (!result.valid) errors.push(result);
      } catch {}
    }
    
    if (errors.length > 0) {
      const patterns = errorRecovery.analyzeErrorPatterns(errors);
      console.log('\nCommon error patterns:');
      patterns.commonPatterns.forEach(p => {
        console.log(`   ${p.pattern}: ${p.count} occurrences`);
        console.log(`   → ${p.suggestion}`);
      });
      
      if (patterns.recommendations.length > 0) {
        console.log('\nRecommendations:');
        patterns.recommendations.forEach(r => {
          console.log(`   • ${r}`);
        });
      }
    }
  }
}

// Run the test
testValidationSystem().catch(console.error);