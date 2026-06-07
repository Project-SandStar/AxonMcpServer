#!/usr/bin/env node

import { HaystackAuthClient } from './dist/skyspark/haystackAuth.js';

async function testEndpoints() {
  const authClient = new HaystackAuthClient({
    baseUrl: 'http://localhost:8080',
    username: 'su',
    password: 'su',
    authPath: '/api/demo/about'
  });
  
  console.log('Authenticating...');
  await authClient.getAuthToken();
  console.log('✓ Authenticated\n');
  
  const testPaths = [
    '/eval',
    '/evalAll',
    '/api/demo/eval',
    '/api/demo/evalAll',
    '/api/demo/ops',
    '/demo/ops',
    '/ops',
    '/read',
    '/api/demo/read'
  ];
  
  for (const path of testPaths) {
    try {
      const resp = await authClient.fetch(path);
      console.log(`${path.padEnd(25)} -> ${resp.status} ${resp.statusText}`);
      if (resp.status !== 404) {
        const text = await resp.text();
        console.log(`  Preview: ${text.substring(0, 100)}`);
      }
    } catch (err) {
      console.log(`${path.padEnd(25)} -> ERROR: ${err.message}`);
    }
  }
}

testEndpoints().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
