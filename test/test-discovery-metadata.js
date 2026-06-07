#!/usr/bin/env node

import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

async function testMetadata() {
  console.log('Testing project discovery with metadata...\n');
  
  // Connect to production demo project
  const client = new HaystackSkySparkClient({
    host: '<skyspark-host>',
    port: 80,
    protocol: 'http',
    project: 'demo',
    username: 'alper',
    password: '<password>'
  });
  
  console.log('Calling projs() with metadata extraction...');
  const projects = await client.getAvailableProjectsWithMetadata();
  
  console.log(`\n✓ Discovered ${projects.length} projects with metadata\n`);
  
  // Group by type
  const local = projects.filter(p => p.type === 'local');
  const remote = projects.filter(p => p.type === 'remote');
  
  console.log(`Local projects: ${local.length}`);
  console.log(`Remote projects (ArcBeam): ${remote.length}\n`);
  
  // Show first 5 of each type
  console.log('Sample LOCAL projects:');
  for (const proj of local.slice(0, 5)) {
    console.log(`  - ${proj.name}: ${proj.dis} (v${proj.version || 'unknown'})`);
  }
  
  console.log('\nSample REMOTE projects (ArcBeam):');
  for (const proj of remote.slice(0, 5)) {
    const status = proj.routeStatus === 'ok' ? '✓' : '✗';
    console.log(`  ${status} ${proj.name}: ${proj.dis}`);
    console.log(`    Route: ${proj.route || 'unknown'} [${proj.routeStatus || 'unknown'}]`);
  }
  
  // Check for down projects
  const down = projects.filter(p => p.routeStatus === 'down');
  if (down.length > 0) {
    console.log(`\n⚠️  Projects with issues (${down.length}):`);
    for (const proj of down) {
      console.log(`  - ${proj.name}: ${proj.routeStatus}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test how descriptions would be generated:');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const proj of projects.slice(0, 10)) {
    let description = proj.dis || proj.name;
    if (proj.type === 'remote') {
      description += ` (ArcBeam remote${proj.route ? ': ' + proj.route : ''})`;
    } else {
      description += ' (local)';
    }
    if (proj.routeStatus && proj.routeStatus !== 'ok') {
      description += ` [${proj.routeStatus}]`;
    }
    
    console.log(`${proj.name}:`);
    console.log(`  "${description}"`);
  }
  
  console.log('\n✅ Metadata extraction working correctly!');
}

testMetadata().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
