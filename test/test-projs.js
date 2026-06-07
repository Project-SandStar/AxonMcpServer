#!/usr/bin/env node

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testProjs() {
  console.log('Testing projs() function on production server...\n');
  
  // Connect to production with proper credentials (using demo project)
  const client = new HaystackSkySparkClient({
    host: '<skyspark-host>',
    port: 80,
    protocol: 'http',
    project: 'demo',  // Initial project to connect
    username: 'alper',
    password: '<password>'
  });
  
  console.log('Step 1: Calling projs()...');
  const projects = await client.getAvailableProjects();
  
  console.log(`\n✓ Discovered ${projects.length} projects:\n`);
  
  // Group by first letter for better display
  const grouped = {};
  for (const project of projects) {
    const firstLetter = project[0].toUpperCase();
    if (!grouped[firstLetter]) {
      grouped[firstLetter] = [];
    }
    grouped[firstLetter].push(project);
  }
  
  // Display grouped
  for (const letter of Object.keys(grouped).sort()) {
    console.log(`  ${letter}:`);
    for (const project of grouped[letter]) {
      console.log(`    - ${project}`);
    }
  }
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`Total: ${projects.length} projects accessible`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  // Test a few specific projects
  console.log('Step 2: Testing access to specific projects...');
  const testProjects = ['demoProject', 'techwind', 'demo'].filter(p => projects.includes(p));
  
  for (const projName of testProjects) {
    try {
      const testClient = new HaystackSkySparkClient({
        host: '<skyspark-host>',
        port: 80,
        protocol: 'http',
        project: projName,
        username: 'alper',
        password: '<password>'
      });
      
      const sites = await testClient.readAll('site');
      console.log(`  ✓ ${projName}: ${sites.length} sites`);
    } catch (error) {
      console.log(`  ✗ ${projName}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Test complete!');
}

testProjs().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
