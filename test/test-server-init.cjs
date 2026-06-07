#!/usr/bin/env node

/**
 * Test script to observe MCP server initialization logs
 * This script starts the server and keeps it running to see stderr output
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Axon MCP Server...\n');

const serverPath = path.join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'], // stdin: pipe, stdout: pipe, stderr: inherit (show in console)
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code);
});

// Keep the process running for 30 seconds to see initialization
setTimeout(() => {
  console.log('\nStopping test...');
  server.kill();
}, 30000);

console.log('Observing server initialization for 30 seconds...\n');
console.log('=' .repeat(80));
