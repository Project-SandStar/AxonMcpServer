#!/usr/bin/env node

/**
 * CLI tool for syncing SkySpark functions to local filesystem
 * 
 * Usage:
 *   npm run build && node dist/src/sync/sync-functions-cli.js <instance> <project> [options]
 * 
 * Example:
 *   node dist/src/sync/sync-functions-cli.js local mobilytik
 *   node dist/src/sync/sync-functions-cli.js local mobilytik --force
 *   node dist/src/sync/sync-functions-cli.js local mobilytik --fast
 *   node dist/src/sync/sync-functions-cli.js local mobilytik --list
 */

import * as dotenv from 'dotenv';
import { FunctionSyncManagerEnhanced } from './functionSyncManagerEnhanced.js';
import { HaystackSkySparkClient } from '../skyspark/haystackClient.js';
import { SkySparkConfigManager } from '../config/skysparkConfig.js';
import * as path from 'path';

// Load environment variables
dotenv.config();

interface CliArgs {
  instance: string;
  project: string;
  force: boolean;
  fast: boolean;
  list: boolean;
  stats: boolean;
  concurrency: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  
  const parsed: CliArgs = {
    instance: '',
    project: '',
    force: false,
    fast: false,
    list: false,
    stats: false,
    concurrency: 10,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--force' || arg === '-f') {
      parsed.force = true;
    } else if (arg === '--fast') {
      parsed.fast = true;
    } else if (arg === '--list' || arg === '-l') {
      parsed.list = true;
    } else if (arg === '--stats' || arg === '-s') {
      parsed.stats = true;
    } else if (arg === '--concurrency' || arg === '-c') {
      parsed.concurrency = parseInt(args[++i], 10);
    } else if (!parsed.instance) {
      parsed.instance = arg;
    } else if (!parsed.project) {
      parsed.project = arg;
    }
  }
  
  return parsed;
}

function printHelp() {
  console.log(`
SkySpark Function Sync CLI

Usage:
  sync-functions-cli <instance> <project> [options]

Arguments:
  instance          The SkySpark instance name (e.g., 'local', 'prod')
  project           The project name (e.g., 'mobilytik', 'demo')

Options:
  --force, -f       Force re-download all functions (ignore cache)
  --fast            Use fast sync (skip modification time checks)
  --list, -l        List all synced projects
  --stats, -s       Show sync statistics for the project
  --concurrency, -c Number of parallel downloads (default: 10)
  --help, -h        Show this help message

Examples:
  # Normal sync (smart, checks for changes)
  sync-functions-cli local mobilytik

  # Force re-download everything
  sync-functions-cli local mobilytik --force

  # Fast sync (only checks file existence)
  sync-functions-cli local mobilytik --fast

  # Sync with 20 parallel downloads
  sync-functions-cli local mobilytik -c 20

  # List all synced projects
  sync-functions-cli --list

  # Show sync stats for a project
  sync-functions-cli local mobilytik --stats

Environment:
  SKYSPARK_FUNCTION_VERSIONING=true     Enable function versioning (backups)
  SKYSPARK_MAX_VERSIONS=4               Max versions to keep per function
  SKYSPARK_ENHANCED_PARSING=true        Enable enhanced metadata parsing (default)

Notes:
  - Both .axon (source) and .trio (metadata) files are synced
  - Smart sync only downloads new/changed functions
  - Fast sync is quicker but may miss updates
  - Force sync re-downloads everything
  `);
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  const syncManager = new FunctionSyncManagerEnhanced('proj');
  
  // Handle --list command
  if (args.list) {
    console.log('\n📋 Synced Projects:\n');
    const projects = await syncManager.listSyncedProjects();
    
    if (projects.length === 0) {
      console.log('  No projects synced yet.\n');
      process.exit(0);
    }
    
    for (const proj of projects) {
      const age = Date.now() - new Date(proj.lastSync).getTime();
      const ageHours = Math.floor(age / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const ageStr = ageDays > 0 
        ? `${ageDays}d ${ageHours % 24}h ago`
        : `${ageHours}h ago`;
      
      console.log(`  📦 ${proj.instance}/${proj.project}`);
      console.log(`     Functions: ${proj.functionCount}`);
      console.log(`     Last sync: ${ageStr}`);
      console.log();
    }
    
    process.exit(0);
  }
  
  // Handle --stats command
  if (args.stats) {
    if (!args.instance || !args.project) {
      console.error('❌ Error: instance and project are required for --stats\n');
      printHelp();
      process.exit(1);
    }
    
    console.log(`\n📊 Sync Statistics for ${args.instance}/${args.project}:\n`);
    const stats = await syncManager.getSyncStats(args.instance, args.project);
    
    if (!stats) {
      console.log('  No sync data found. Run a sync first.\n');
      process.exit(0);
    }
    
    const age = Date.now() - new Date(stats.lastSync || '').getTime();
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    const ageStr = ageDays > 0 
      ? `${ageDays} days, ${ageHours % 24} hours ago`
      : `${ageHours} hours ago`;
    
    console.log(`  Total functions:     ${stats.functionCount}`);
    console.log(`  With modification:   ${stats.withModTimes}`);
    console.log(`  With hash:           ${stats.withHashes}`);
    console.log(`  Last sync:           ${ageStr}`);
    console.log(`  Has metadata:        ${stats.hasMetadata ? '✅' : '❌'}`);
    console.log();
    
    process.exit(0);
  }
  
  // Validate required arguments for sync
  if (!args.instance || !args.project) {
    console.error('❌ Error: instance and project are required\n');
    printHelp();
    process.exit(1);
  }
  
  try {
    // Load config from config folder
    const configPath = process.env.SKYSPARK_CONFIG_DIR || path.join(process.cwd(), 'config');
    const configManager = new SkySparkConfigManager(configPath);
    
    // Verify instance and project exist
    const instance = configManager.getInstance(args.instance);
    if (!instance) {
      throw new Error(`Instance '${args.instance}' not found in config files.\nAvailable instances: ${configManager.getInstances().map(i => i.name).join(', ')}`);
    }
    
    const projects = instance.projects || [];
    const project = projects.find(p => p.name === args.project);
    if (!project) {
      throw new Error(`Project '${args.project}' not found in instance '${args.instance}'.\nAvailable projects: ${projects.map(p => p.name).join(', ')}`);
    }
    
    console.log(`\n🔧 Syncing ${args.instance}/${args.project}`);
    console.log(`📁 Output directory: proj/${args.instance}/${args.project}/func/`);
    console.log(`⚙️  Mode: ${args.force ? 'FORCE' : args.fast ? 'FAST' : 'SMART'}`);
    console.log(`🧵 Concurrency: ${args.concurrency}\n`);
    
    // Show configuration
    const versioning = process.env.SKYSPARK_FUNCTION_VERSIONING === 'true';
    const maxVersions = parseInt(process.env.SKYSPARK_MAX_VERSIONS || '4');
    const enhancedParsing = process.env.SKYSPARK_ENHANCED_PARSING !== 'false';
    
    console.log(`📋 Configuration:`);
    console.log(`   Versioning: ${versioning ? `✅ (keep ${maxVersions})` : '❌'}`);
    console.log(`   Enhanced parsing: ${enhancedParsing ? '✅' : '❌'}`);
    console.log();
    
    // Create client with ConfigManager
    const client = new HaystackSkySparkClient(configManager);
    
    // Switch to the requested instance/project
    client.switchTo(args.instance, args.project);
    
    // Perform sync
    const startTime = Date.now();
    
    if (args.fast) {
      const result = await syncManager.syncFunctionsFast(client, args.instance, args.project, {
        force: args.force,
        silent: false
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✨ Sync completed in ${elapsed}s`);
      console.log(`   Downloaded: ${result.downloaded}`);
      console.log(`   Skipped:    ${result.skipped}`);
      console.log(`   Errors:     ${result.errors}`);
    } else {
      const result = await syncManager.syncFunctions(client, args.instance, args.project, {
        force: args.force,
        silent: false,
        checkModTime: true,
        concurrency: args.concurrency
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✨ Sync completed in ${elapsed}s`);
      console.log(`   Downloaded: ${result.downloaded}`);
      console.log(`   Updated:    ${result.updated}`);
      console.log(`   Skipped:    ${result.skipped}`);
      console.log(`   Deleted:    ${result.deleted}`);
      console.log(`   Errors:     ${result.errors}`);
    }
    
    // Show file count
    const fileCount = await syncManager.getSyncedFunctionCount(args.instance, args.project);
    console.log(`\n📂 Total files in proj/${args.instance}/${args.project}/func/:`);
    console.log(`   ${fileCount} .axon files`);
    console.log(`   ${fileCount} .trio files (metadata)\n`);
    
  } catch (error) {
    console.error(`\n❌ Sync failed: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Run CLI
main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}\n`);
  process.exit(1);
});
