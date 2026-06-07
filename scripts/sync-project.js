#!/usr/bin/env node
/**
 * Quick script to sync demoProject functions
 */
import 'dotenv/config';
import { SkySparkConfigManager } from './dist/config/skysparkConfig.js';
import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';
import { FunctionSyncManagerEnhanced } from './dist/sync/functionSyncManagerEnhanced.js';

const configManager = new SkySparkConfigManager('./config');
const client = new HaystackSkySparkClient(configManager);
const syncManager = new FunctionSyncManagerEnhanced('proj');

async function syncDubaiPolice() {
  console.log('\n🚀 Starting Dubai Police function sync...\n');
  
  try {
    // Switch to demoProject project
    client.switchTo('skyone', 'demoProject');
    console.log('✅ Connected to skyone/demoProject\n');
    
    // Sync with enhanced manager
    const result = await syncManager.syncFunctions(
      client,
      'skyone',
      'demoProject',
      {
        force: false,
        silent: false,
        checkModTime: true,
        concurrency: 10
      }
    );
    
    console.log('\n✅ Sync complete!');
    console.log(`   Downloaded: ${result.downloaded}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Deleted: ${result.deleted}`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`\n📁 Location: proj/skyone/demoProject/\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

syncDubaiPolice();
