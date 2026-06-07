#!/usr/bin/env node

import { SkySparkConfigManager } from './dist/config/skysparkConfig.js';

console.log('Testing config loading...\n');

const configManager = new SkySparkConfigManager('./config');
const instances = configManager.getInstances();

console.log(`✓ Found ${instances.length} instance(s):\n`);

for (const instance of instances) {
  console.log(`📦 ${instance.name}`);
  console.log(`   Host: ${instance.host}:${instance.port}`);
  console.log(`   Projects: ${instance.projects.length}`);
  instance.projects.forEach(p => {
    console.log(`     - ${p.name}${p.description ? ': ' + p.description : ''}`);
  });
  console.log();
}

const active = configManager.getActiveConfig();
console.log(`Active: ${active.instance.name} / ${active.project.name}`);
