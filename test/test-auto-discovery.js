#!/usr/bin/env node

/**
 * Test script to verify if auto-discovery can authenticate and list projects
 */

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testAutoDiscovery() {
  console.log('🔍 Testing auto-discovery authentication...\n');
  
  // Create client with same config as auto-discovery would use
  const config = {
    host: 'localhost',
    port: 8080,
    protocol: 'http',
    project: 'mobilytik',
    username: 'mcpserver',
    password: 'DZSY5-G7R2K-45D7X'
  };
  
  console.log(`Connecting to: ${config.protocol}://${config.host}:${config.port}`);
  console.log(`Project: ${config.project}`);
  console.log(`Username: ${config.username}\n`);
  
  try {
    const client = new HaystackSkySparkClient(config);
    
    console.log('Step 1: Testing authentication...');
    // Try a simple eval to test auth
    const result = await client.evalAxon('about()');
    console.log('✅ Authentication successful!\n');
    
    console.log('Step 2: Trying to list projects with projs()...');
    try {
      const projects = await client.getAvailableProjects();
      console.log(`✅ Successfully discovered ${projects.length} projects:`);
      projects.forEach(p => console.log(`   - ${p}`));
      console.log('\n🎉 Auto-discovery would work! You can keep it enabled.');
    } catch (projsError) {
      console.log(`❌ projs() failed: ${projsError.message}`);
      console.log('\n💡 This means:');
      console.log('   - Authentication works fine');
      console.log('   - But the mcpserver user cannot list all projects');
      console.log('   - This is likely a permissions issue\n');
      console.log('📋 Solutions:');
      console.log('   1. RECOMMENDED: Disable auto-discovery in VSCode settings');
      console.log('      (You already have all 6 projects configured)');
      console.log('   2. Grant the mcpserver user admin permissions in SkySpark');
      console.log('   3. Use a different user (like su) for auto-discovery');
    }
    
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}\n`);
    console.log('💡 Possible causes:');
    console.log('   - SkySpark server is not running');
    console.log('   - Project "mobilytik" doesn\'t exist');
    console.log('   - Username/password is incorrect');
    console.log('   - Network/firewall issue\n');
    console.log('📋 Recommendation:');
    console.log('   Disable auto-discovery and use your existing manual project configuration');
  }
}

testAutoDiscovery().catch(console.error);
