#!/usr/bin/env node

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testSkyOne() {
  console.log('Testing SkyOne (production) authentication...\n');
  
  // Load skyone config
  const config = {
    host: '<skyspark-host>',
    port: 80,
    protocol: 'http',
    project: 'demoProject',
    username: 'alper',
    password: '<password>'
  };
  
  console.log(`Connecting to: ${config.protocol}://${config.host}:${config.port}`);
  console.log(`Project: ${config.project}`);
  console.log(`Username: ${config.username}\n`);
  
  try {
    const client = new HaystackSkySparkClient(config);
    
    console.log('Step 1: Authenticating with SCRAM...');
    const start1 = Date.now();
    const now = await client.evalAxon('now()');
    console.log(`✓ Authentication successful! (${Date.now() - start1}ms)`);
    console.log(`  Current server time: ${now.toString()}\n`);
    
    console.log('Step 2: Testing token reuse...');
    const start2 = Date.now();
    const version = await client.evalAxon('about().version');
    console.log(`✓ Token reused! (${Date.now() - start2}ms)`);
    console.log(`  SkySpark version: ${version.toString()}\n`);
    
    console.log('Step 3: Discovering projects...');
    const projects = await client.getAvailableProjects();
    console.log(`✓ Found ${projects.length} projects:`);
    projects.forEach(p => console.log(`  - ${p}`));
    console.log();
    
    console.log('Step 4: Testing read operation...');
    const sites = await client.readAll('site');
    console.log(`✓ Found ${sites.length} sites\n`);
    
    if (sites.length > 0) {
      console.log('Sample sites:');
      for (let i = 0; i < Math.min(3, sites.length); i++) {
        const site = sites.get(i);
        if (site) {
          const dis = site.get('dis')?.toString() || 'unnamed';
          const id = site.get('id')?.toString() || 'no-id';
          console.log(`  ${i + 1}. ${dis} (${id})`);
        }
      }
      console.log();
    }
    
    console.log('Step 5: Getting project functions...');
    const funcs = await client.listFunctions();
    console.log(`✓ Found ${funcs.length} functions`);
    if (funcs.length > 0) {
      console.log('Sample functions:');
      for (let i = 0; i < Math.min(5, funcs.length); i++) {
        const func = funcs[i];
        const name = func.get('name')?.toString() || 'unnamed';
        const sig = func.get('sig')?.toString() || '';
        console.log(`  ${i + 1}. ${name}${sig}`);
      }
      console.log();
    }
    
    console.log('Step 6: Testing multiple rapid requests...');
    const rapidStart = Date.now();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(client.evalAxon(`"Request ${i + 1}"`));
    }
    const results = await Promise.all(promises);
    console.log(`✓ Completed 5 concurrent requests in ${Date.now() - rapidStart}ms`);
    results.forEach((r, i) => console.log(`  ${i + 1}. ${r.toString()}`));
    console.log();
    
    console.log('=== All SkyOne tests passed! ===');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testSkyOne();
