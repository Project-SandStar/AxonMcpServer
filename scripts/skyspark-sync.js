#!/usr/bin/env node
/**
 * SkySpark Sync - Download/Upload Axon functions without AI tokens
 * 
 * Usage:
 *   node skyspark-sync.js pull [options]     - Download functions from SkySpark
 *   node skyspark-sync.js pull-all [options] - Download functions from all projects
 *   node skyspark-sync.js status             - Show sync status
 * 
 * Options:
 *   --instance <name>    - Instance name (required for pull)
 *   --project <name>     - Project name (required for pull)
 *   --force              - Force re-download all functions
 *   --concurrency <num>  - Number of parallel downloads (default: 10)
 *   --no-check-mod       - Don't check modification times (faster but less accurate)
 */

import { SkySparkConfigManager } from './dist/config/skysparkConfig.js';
import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';
import { FunctionSyncManagerEnhanced } from './dist/sync/functionSyncManagerEnhanced.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

const configManager = new SkySparkConfigManager('./config');
const client = new HaystackSkySparkClient(configManager);
const syncManager = new FunctionSyncManagerEnhanced('proj');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {
    instance: null,
    project: null,
    force: false,
    concurrency: 10,
    checkModTime: true
  };
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--instance' && args[i + 1]) {
      options.instance = args[++i];
    } else if (args[i] === '--project' && args[i + 1]) {
      options.project = args[++i];
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[++i]);
    } else if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--no-check-mod') {
      options.checkModTime = false;
    }
  }
  
  return { command, options };
}

// Pull functions from a specific project
async function pullFunctions(options) {
  try {
    const instanceName = options.instance;
    const projectName = options.project;
    
    if (!instanceName || !projectName) {
      console.error('❌ Error: --instance and --project are required\n');
      console.error('Usage: node skyspark-sync.js pull --instance <name> --project <name> [--force] [--concurrency <num>]\n');
      process.exit(1);
    }
    
    console.log(`\n🔄 Syncing functions from ${instanceName}/${projectName}\n`);
    
    // Switch to the target project
    client.switchTo(instanceName, projectName);
    
    // Sync using enhanced manager
    const result = await syncManager.syncFunctions(
      client,
      instanceName,
      projectName,
      {
        force: options.force,
        silent: false,
        checkModTime: options.checkModTime,
        concurrency: options.concurrency
      }
    );
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Downloaded: ${result.downloaded} new`);
    console.log(`   Updated: ${result.updated} changed`);
    console.log(`   Skipped: ${result.skipped} unchanged`);
    console.log(`   Deleted: ${result.deleted} removed`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`\n📁 Location: proj/${instanceName}/${projectName}/func/\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Pull functions from all projects in all instances
async function pullAllFunctions(options) {
  try {
    console.log('\n🚀 Syncing functions from all projects...\n');
    
    const instances = configManager.getInstances();
    let totalProjects = 0;
    let totalDownloaded = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const instance of instances) {
      console.log(`\n📦 Instance: ${instance.name} (${instance.host}:${instance.port})`);
      console.log(`   Projects: ${instance.projects.length}\n`);
      
      for (const project of instance.projects) {
        totalProjects++;
        console.log(`  📥 ${instance.name}/${project.name}...`);
        
        try {
          client.switchTo(instance.name, project.name);
          
          const result = await syncManager.syncFunctions(
            client,
            instance.name,
            project.name,
            {
              force: options.force,
              silent: false,
              checkModTime: options.checkModTime,
              concurrency: options.concurrency
            }
          );
          
          totalDownloaded += result.downloaded;
          totalUpdated += result.updated;
          totalSkipped += result.skipped;
          totalErrors += result.errors;
        } catch (error) {
          console.error(`    ⚠️  Failed: ${error.message}`);
          totalErrors++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERALL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Projects synced: ${totalProjects}`);
    console.log(`Downloaded: ${totalDownloaded} new`);
    console.log(`Updated: ${totalUpdated} changed`);
    console.log(`Skipped: ${totalSkipped} unchanged`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`\n📁 Location: proj/<instance>/<project>/func/\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}


// Show sync status for all synced projects
async function showStatus(options) {
  try {
    const projects = await syncManager.listSyncedProjects();
    
    if (projects.length === 0) {
      console.log('\n❌ No synced projects found.');
      console.log('💡 Run "pull" or "pull-all" to download functions first.\n');
      return;
    }
    
    console.log('\n📊 Synced Projects:\n');
    
    for (const proj of projects) {
      console.log(`📦 ${proj.instance}/${proj.project}`);
      console.log(`   Last Sync: ${new Date(proj.lastSync).toLocaleString()}`);
      console.log(`   Functions: ${proj.functionCount}`);
      console.log(`   Location: proj/${proj.instance}/${proj.project}/func/\n`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
  }
}

// Main
const { command, options } = parseArgs();

if (!command) {
  console.log(`
SkySpark Sync - Download/Upload Axon functions (No AI tokens needed!)

Usage:
  node skyspark-sync.js pull --instance <name> --project <name> [options]
  node skyspark-sync.js pull-all [options]
  node skyspark-sync.js status

Commands:
  pull         Download functions from a specific project
  pull-all     Download functions from ALL configured projects
  status       Show sync status for all synced projects

Options:
  --instance <name>    Instance name (required for pull)
  --project <name>     Project name (required for pull)
  --force              Force re-download all functions
  --concurrency <num>  Number of parallel downloads (default: 10)
  --no-check-mod       Don't check modification times (faster but less accurate)

Examples:
  # Sync demoProject project
  node skyspark-sync.js pull --instance skyone --project demoProject
  
  # Force full re-sync with higher concurrency
  node skyspark-sync.js pull --instance skyone --project demoProject --force --concurrency 20
  
  # Sync all projects from all instances
  node skyspark-sync.js pull-all
  
  # Quick sync (skip mod time check)
  node skyspark-sync.js pull-all --no-check-mod
  
  # Check status
  node skyspark-sync.js status

Note: Functions are synced to proj/<instance>/<project>/func/
`);
  process.exit(0);
}

switch (command) {
  case 'pull':
    await pullFunctions(options);
    break;
    
  case 'pull-all':
    await pullAllFunctions(options);
    break;
    
  case 'status':
    await showStatus(options);
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "node skyspark-sync.js" without arguments for usage.\n');
    process.exit(1);
}
