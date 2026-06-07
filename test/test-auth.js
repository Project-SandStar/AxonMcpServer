#!/usr/bin/env node

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testAuth() {
  console.log('Testing Haystack SCRAM authentication...\n');
  
  // Load config - using local SkySpark
  const config = {
    host: 'localhost',
    port: 8080,
    protocol: 'http',
    project: 'mobilytik',
    username: 'su',
    password: 'su'
  };
  
  console.log(`Connecting to: ${config.protocol}://${config.host}:${config.port}`);
  console.log(`Project: ${config.project}`);
  console.log(`Username: ${config.username}\n`);
  
  try {
    const client = new HaystackSkySparkClient(config);
    
    console.log('Step 1: Authenticating with SCRAM...');
    const result = await client.evalAxon('now()');
    console.log('✓ Authentication successful!\n');
    
    console.log('Step 2: Testing Axon evaluation...');
    console.log('Result:', result.toString());
    console.log('✓ Axon eval works!\n');
    
    console.log('Step 3: Discovering projects...');
    const projects = await client.getAvailableProjects();
    console.log('Available projects:', projects);
    console.log('✓ Project discovery works!\n');
    
    console.log('Step 4: Testing read operation...');
    const sites = await client.readAll('site');
    console.log(`Found ${sites.length} sites`);
    console.log('✓ Read operation works!\n');
    
    console.log('=== All tests passed! ===');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testAuth();
