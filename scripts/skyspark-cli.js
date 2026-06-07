#!/usr/bin/env node
import { SkySparkConfigManager } from './dist/config/skysparkConfig.js';
import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';
import * as readline from 'readline';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

const configManager = new SkySparkConfigManager('./config');
const client = new HaystackSkySparkClient(configManager);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function listInstances() {
  const instances = configManager.getInstances();
  console.log('\n📊 Available SkySpark Instances:\n');
  instances.forEach((inst, i) => {
    console.log(`${i + 1}. ${inst.name}`);
    console.log(`   Host: ${inst.host}:${inst.port}`);
    console.log(`   Projects: ${inst.projects.length}`);
    console.log('');
  });
  return instances;
}

async function listProjects(instanceName) {
  const instance = configManager.getInstance(instanceName);
  if (!instance) {
    console.log(`❌ Instance "${instanceName}" not found`);
    return [];
  }
  
  console.log(`\n📦 Projects in "${instanceName}":\n`);
  instance.projects.forEach((proj, i) => {
    console.log(`${i + 1}. ${proj.name}`);
    if (proj.description) {
      console.log(`   ${proj.description}`);
    }
  });
  console.log('');
  return instance.projects;
}

async function switchProject(instanceName, projectName) {
  try {
    client.switchTo(instanceName, projectName);
    const config = client.getCurrentConfig();
    console.log('\n✅ Switched successfully!');
    console.log(`   Instance: ${config.instance}`);
    console.log(`   Project: ${config.project}`);
    console.log(`   URL: ${config.url}`);
    return true;
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    return false;
  }
}

async function getCurrentConfig() {
  try {
    const config = client.getCurrentConfig();
    console.log('\n🎯 Current Configuration:');
    console.log(`   Instance: ${config.instance}`);
    console.log(`   Project: ${config.project}`);
    console.log(`   URL: ${config.url}`);
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
}

async function executeQuery(query) {
  try {
    console.log(`\n🔍 Executing: ${query}\n`);
    const result = await client.evalAxon(query);
    console.log('✅ Result:');
    console.log(result.toString());
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
}

async function interactiveMode() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     SkySpark CLI - Interactive Mode        ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  await getCurrentConfig();
  
  while (true) {
    console.log('\n📋 Commands:');
    console.log('  1. List instances');
    console.log('  2. List projects');
    console.log('  3. Switch project');
    console.log('  4. Show current config');
    console.log('  5. Execute Axon query');
    console.log('  6. Exit\n');
    
    const choice = await question('Choose command (1-6): ');
    
    switch (choice.trim()) {
      case '1':
        await listInstances();
        break;
        
      case '2':
        const instanceName = await question('Instance name: ');
        await listProjects(instanceName.trim());
        break;
        
      case '3':
        const inst = await question('Instance name: ');
        const proj = await question('Project name: ');
        await switchProject(inst.trim(), proj.trim());
        break;
        
      case '4':
        await getCurrentConfig();
        break;
        
      case '5':
        const query = await question('Axon query: ');
        await executeQuery(query.trim());
        break;
        
      case '6':
        console.log('\n👋 Goodbye!\n');
        rl.close();
        process.exit(0);
        
      default:
        console.log('Invalid choice');
    }
  }
}

// CLI argument handling
const args = process.argv.slice(2);

if (args.length === 0) {
  // Interactive mode
  interactiveMode();
} else {
  // Direct command mode
  const command = args[0];
  
  switch (command) {
    case 'list':
      if (args[1]) {
        await listProjects(args[1]);
      } else {
        await listInstances();
      }
      rl.close();
      break;
      
    case 'switch':
      if (args.length < 3) {
        console.log('Usage: skyspark-cli.js switch <instance> <project>');
      } else {
        await switchProject(args[1], args[2]);
      }
      rl.close();
      break;
      
    case 'current':
      await getCurrentConfig();
      rl.close();
      break;
      
    case 'eval':
      if (args.length < 2) {
        console.log('Usage: skyspark-cli.js eval "<axon query>"');
      } else {
        await executeQuery(args.slice(1).join(' '));
      }
      rl.close();
      break;
      
    default:
      console.log('Unknown command. Available commands:');
      console.log('  list [instance]  - List instances or projects');
      console.log('  switch <instance> <project> - Switch project');
      console.log('  current - Show current configuration');
      console.log('  eval "<query>" - Execute Axon query');
      console.log('  (no arguments) - Interactive mode');
      rl.close();
  }
}
