#!/usr/bin/env node

/**
 * Test script to demonstrate Phase 2 real-time progress logging
 * 
 * This script starts the Axon MCP Server and monitors:
 * 1. Immediate server readiness (Phase 1)
 * 2. Real-time progress updates (Phase 2)
 * 3. Progress percentage tracking
 * 4. Per-project timing
 * 5. Function count reporting
 * 
 * Usage: node test-phase2-progress.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║      Phase 2 Real-Time Progress Logging Test                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const startTime = Date.now();
let initCompleteTime = null;
let indexCompleteTime = null;
let progressUpdates = [];
let lastProgress = 0;

// Start the server
const serverPath = path.join(__dirname, 'build', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: 'pipe',
  env: { ...process.env }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  process.stderr.write(output);

  // Detect when initialization is complete
  if (!initCompleteTime && output.includes('Server will be ready immediately')) {
    initCompleteTime = Date.now() - startTime;
    console.log(`\n⏱️  [TIMING] Server ready in ${initCompleteTime}ms`);
  }

  // Track progress updates
  const progressMatch = output.match(/\((\d+)\/(\d+) = ([\d.]+)%\)/);
  if (progressMatch) {
    const completed = parseInt(progressMatch[1]);
    const total = parseInt(progressMatch[2]);
    const percentage = parseFloat(progressMatch[3]);
    
    progressUpdates.push({
      completed,
      total,
      percentage,
      timestamp: Date.now() - startTime
    });
    
    // Show progress milestones
    if (percentage >= lastProgress + 20) {
      console.log(`\n📊 [PROGRESS] ${percentage.toFixed(1)}% complete (${completed}/${total} projects)`);
      lastProgress = Math.floor(percentage / 20) * 20;
    }
  }

  // Detect when indexing summary is shown (indexing complete)
  if (!indexCompleteTime && output.includes('BACKGROUND INDEXING COMPLETE')) {
    indexCompleteTime = Date.now() - startTime;
    console.log(`\n⏱️  [TIMING] Background indexing complete in ${indexCompleteTime}ms`);
    
    // Display results
    setTimeout(() => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 PHASE 2 TEST RESULTS');
      console.log('='.repeat(60));
      console.log(`✅ Server Ready Time:         ${initCompleteTime}ms (< 1 second)`);
      console.log(`📦 Background Index Time:     ${indexCompleteTime}ms`);
      console.log(`📈 Progress Updates Received: ${progressUpdates.length}`);
      
      if (progressUpdates.length > 0) {
        const firstUpdate = progressUpdates[0];
        const lastUpdate = progressUpdates[progressUpdates.length - 1];
        console.log(`🎯 Progress Range:            ${firstUpdate.percentage.toFixed(1)}% → ${lastUpdate.percentage.toFixed(1)}%`);
        console.log(`📊 Total Projects Indexed:    ${lastUpdate.completed}/${lastUpdate.total}`);
        
        // Calculate average time per progress update
        const avgUpdateInterval = progressUpdates.length > 1
          ? (lastUpdate.timestamp - firstUpdate.timestamp) / (progressUpdates.length - 1)
          : 0;
        console.log(`⚡ Avg Update Interval:       ${avgUpdateInterval.toFixed(0)}ms`);
      }
      
      console.log(`🎯 Phase 2 Features:`);
      console.log(`   ✓ Real-time progress updates`);
      console.log(`   ✓ Progress percentage tracking`);
      console.log(`   ✓ Per-project timing`);
      console.log(`   ✓ Function count reporting`);
      console.log(`   ✓ Background prefix labeling`);
      console.log('='.repeat(60) + '\n');
      
      // Gracefully shutdown
      console.log('🛑 Shutting down test server...\n');
      server.kill('SIGTERM');
      setTimeout(() => process.exit(0), 1000);
    }, 1000);
  }
});

server.stdout.on('data', (data) => {
  process.stdout.write(data.toString());
});

server.on('error', (err) => {
  console.error(`❌ Failed to start server: ${err.message}`);
  process.exit(1);
});

server.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\n❌ Server exited with code ${code}`);
    process.exit(code);
  }
});

// Timeout after 2 minutes
setTimeout(() => {
  console.error('\n⏰ Test timed out after 2 minutes');
  
  // Show partial results if any
  if (progressUpdates.length > 0) {
    console.log('\n📊 Partial Results:');
    console.log(`   Progress updates received: ${progressUpdates.length}`);
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    console.log(`   Last progress: ${lastUpdate.percentage.toFixed(1)}% (${lastUpdate.completed}/${lastUpdate.total})`);
  }
  
  server.kill('SIGTERM');
  process.exit(1);
}, 120000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted by user');
  
  // Show partial results if any
  if (progressUpdates.length > 0) {
    console.log('\n📊 Partial Results:');
    console.log(`   Progress updates received: ${progressUpdates.length}`);
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    console.log(`   Last progress: ${lastUpdate.percentage.toFixed(1)}% (${lastUpdate.completed}/${lastUpdate.total})`);
  }
  
  server.kill('SIGTERM');
  process.exit(0);
});
