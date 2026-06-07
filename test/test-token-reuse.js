#!/usr/bin/env node

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testTokenReuse() {
  console.log('Testing authentication token reuse...\n');
  
  const config = {
    host: 'localhost',
    port: 8080,
    protocol: 'http',
    project: 'mobilytik',
    username: 'su',
    password: 'su'
  };
  
  const client = new HaystackSkySparkClient(config);
  
  console.log('Making 10 consecutive requests...\n');
  
  for (let i = 1; i <= 10; i++) {
    const start = Date.now();
    const result = await client.evalAxon('now()');
    const duration = Date.now() - start;
    
    console.log(`Request ${i.toString().padStart(2)}: ${result.toString()} (${duration}ms)`);
  }
  
  console.log('\n✓ All requests completed successfully!');
  console.log('\nNote: First request includes authentication (~50-100ms extra)');
  console.log('Subsequent requests should be much faster (~10-30ms) because');
  console.log('they reuse the same authToken without re-authenticating.');
}

testTokenReuse().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
