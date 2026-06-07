#!/usr/bin/env node

import { HaystackAuthClient } from './dist/skyspark/haystackAuth.js';

async function testBasicOp() {
  console.log('Testing basic Haystack operations...\n');
  
  const authClient = new HaystackAuthClient({
    baseUrl: 'http://localhost:8080',
    username: 'su',
    password: 'su',
    authPath: '/api/demo/about'
  });
  
  console.log('Step 1: Authenticating...');
  const token = await authClient.getAuthToken();
  console.log('✓ Got auth token:', token.substring(0, 20) + '...\n');
  
  console.log('Step 2: Testing /about endpoint...');
  const aboutResp = await authClient.fetch('/api/demo/about');
  console.log('Status:', aboutResp.status);
  const aboutText = await aboutResp.text();
  console.log('Response:', aboutText.substring(0, 200));
  console.log();
  
  console.log('Step 3: Testing /read op...');
  const readResp = await authClient.fetch('/api/demo/read?filter=limit(1)');
  console.log('Status:', readResp.status);
  const readText = await readResp.text();
  console.log('Response:', readText.substring(0, 200));
  console.log();
  
  console.log('Step 4: Listing available ops...');
  const opsResp = await authClient.fetch('/api/demo/ops');
  console.log('Status:', opsResp.status);
  const opsText = await opsResp.text();
  console.log('Response:', opsText.substring(0, 500));
}

testBasicOp().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
