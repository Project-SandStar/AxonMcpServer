/**
 * Test script for function usage tracking
 * 
 * This demonstrates the new MCP tools:
 * - findFunctionUsage
 * - getFunctionExamples
 * - getFunctionCallGraph
 * - getFunctionUsageStats
 */

import { AxonMCPServer } from '../src/index.js';

async function testFunctionUsage() {
  console.log('Testing Function Usage Tracking...\n');
  
  // Simulate MCP tool calls
  const mockServer = {
    findFunctionUsage: async (functionName: string, limit: number = 10) => {
      console.log(`\n=== Finding usage of "${functionName}" ===`);
      console.log(`Would return up to ${limit} usage locations with context`);
      console.log('Example output:');
      console.log({
        function: functionName,
        count: 3,
        usages: [
          {
            file: '/axon-library/energy/meterOccUsage.axon',
            line: 15,
            context: 'commit(diff(null, tags, {add}))',
            arguments: ['diff(null, tags, {add})'],
            isMethodCall: false,
            functionType: 'builtin'
          }
        ]
      });
    },
    
    getFunctionExamples: async (functionName: string) => {
      console.log(`\n=== Getting examples for "${functionName}" ===`);
      console.log('Would return real-world usage examples:');
      console.log({
        function: functionName,
        examples: [
          {
            file: '/axon-library/admin/addRec.axon',
            line: 20,
            complexity: 'simple',
            description: '1 argument',
            code: '// Add as new record to the database\ncommit(diff(null, tags, {add}))'
          },
          {
            file: '/axon-library/meter/updatePoints.axon',
            line: 54,
            complexity: 'medium',
            description: '1 argument, called from updatePoints',
            code: 'if (diffMap.vals.size > 0) point = commit(diff(point, diffMap))'
          }
        ]
      });
    },
    
    getFunctionCallGraph: async (functionName: string, depth: number = 1) => {
      console.log(`\n=== Call graph for "${functionName}" (depth: ${depth}) ===`);
      console.log('Would show what calls it and what it calls:');
      console.log({
        function: functionName,
        calledBy: ['importZinc', 'addRec', 'updatePoints'],
        calls: [], // commit doesn't call other functions
        depth: depth
      });
    },
    
    getFunctionUsageStats: async () => {
      console.log('\n=== Function Usage Statistics ===');
      console.log({
        totalFunctions: 523,
        totalUsages: 4821,
        unusedFunctions: ['deprecatedFunc1', 'testFunc2'],
        mostUsedFunctions: [
          { name: 'readAll', count: 287 },
          { name: 'read', count: 245 },
          { name: 'commit', count: 189 },
          { name: 'hisRead', count: 156 },
          { name: 'each', count: 142 }
        ],
        builtinFunctionsFound: 85,
        userDefinedFunctionsFound: 438
      });
    }
  };
  
  // Test cases
  await mockServer.findFunctionUsage('commit', 20);
  await mockServer.getFunctionExamples('commit');
  await mockServer.getFunctionCallGraph('commit', 2);
  await mockServer.findFunctionUsage('readAll', 5);
  await mockServer.getFunctionExamples('hisRead');
  await mockServer.getFunctionUsageStats();
  
  console.log('\n=== Test Complete ===');
  console.log('The actual implementation would parse the entire codebase');
  console.log('and provide real usage data from your Axon files.');
}

// Run the test
testFunctionUsage().catch(console.error);