#!/usr/bin/env node
/**
 * Test script to verify function versioning works
 */
import 'dotenv/config';
import { SkySparkConfigManager } from './dist/config/skysparkConfig.js';
import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';
import { FunctionSyncManagerEnhanced } from './dist/sync/functionSyncManagerEnhanced.js';
import { promises as fs } from 'fs';
import * as path from 'path';

const configManager = new SkySparkConfigManager('./config');
const client = new HaystackSkySparkClient(configManager);
const syncManager = new FunctionSyncManagerEnhanced('proj');

async function testVersioning() {
  console.log('\n🧪 Testing Function Versioning\n');
  
  const instance = 'demoInstance';
  const project = 'demoProject';
  const testFunc = 'addBacnetDevices'; // Pick a function we know exists
  
  try {
    // 1. Check if versioning is enabled
    const versioning = process.env.SKYSPARK_FUNCTION_VERSIONING === 'true';
    const maxVersions = process.env.SKYSPARK_MAX_VERSIONS || '4';
    
    console.log(`📋 Configuration:`);
    console.log(`   Versioning enabled: ${versioning}`);
    console.log(`   Max versions: ${maxVersions}\n`);
    
    if (!versioning) {
      console.log('⚠️  Versioning is disabled. Set SKYSPARK_FUNCTION_VERSIONING=true in .env.skyspark\n');
      return;
    }
    
    // 2. Manually modify the local file to simulate a change
    const funcPath = path.join('proj', instance, project, 'func', `${testFunc}.axon`);
    const originalContent = await fs.readFile(funcPath, 'utf-8');
    
    console.log(`📝 Original function: ${testFunc}.axon`);
    console.log(`   Length: ${originalContent.length} bytes\n`);
    
    // Modify the file
    const modifiedContent = originalContent + '\n// Test modification\n';
    await fs.writeFile(funcPath, modifiedContent, 'utf-8');
    console.log(`✏️  Modified local file (added comment)\n`);
    
    // 3. Run sync - this should detect the change and create a backup
    console.log(`🔄 Running sync...\n`);
    client.switchTo(instance, project);
    
    const result = await syncManager.syncFunctions(
      client,
      instance,
      project,
      {
        force: false,
        silent: false,
        checkModTime: true,
        concurrency: 1 // Sync just one at a time for clarity
      }
    );
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Updated: ${result.updated}`);
    
    // 4. List versions
    const versions = await syncManager.listFunctionVersions(instance, project, testFunc);
    
    console.log(`\n📚 Versions of ${testFunc}:`);
    if (versions.length === 0) {
      console.log(`   No versions found (function may not have been updated)\n`);
    } else {
      for (const version of versions) {
        console.log(`   📄 ${version.timestamp}`);
        console.log(`      ${version.filePath}`);
      }
      console.log(`\n   Total versions: ${versions.length}/${maxVersions}`);
    }
    
    // 5. Check .versions directory
    const versionsDir = path.join('proj', instance, project, '.versions');
    try {
      const files = await fs.readdir(versionsDir);
      const funcVersions = files.filter(f => f.startsWith(testFunc));
      console.log(`\n📁 Files in .versions directory for ${testFunc}:`);
      for (const file of funcVersions) {
        const stats = await fs.stat(path.join(versionsDir, file));
        console.log(`   ${file} (${stats.size} bytes)`);
      }
    } catch {
      console.log(`\n📁 No .versions directory found`);
    }
    
    console.log('\n✅ Versioning test complete!\n');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

testVersioning();
