import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import { SkySparkConfigManager } from './src/config/skysparkConfig';
import * as dotenv from 'dotenv';

// Load configuration
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

async function testMultiProject() {
  console.log('🔄 Testing Multi-Project Support...\n');
  
  // Create configuration manager
  const configManager = new SkySparkConfigManager('./config');
  
  // Create client with configuration manager
  const client = new HaystackSkySparkClient(configManager);
  
  // Show current configuration
  console.log('📍 Current Configuration:');
  console.log(client.getCurrentConfig());
  console.log('');
  
  try {
    // Test 1: Current project (mobilytik)
    console.log('1️⃣ Testing Mobilytik Project...');
    const mobilytikResult = await client.evalAxon('readAll(site).size');
    console.log(`✅ Mobilytik sites: ${mobilytikResult.toZinc()}`);
    
    // Get functions from mobilytik
    const mobilytikFuncs = await client.getProjectFunctions();
    console.log(`   Functions: ${mobilytikFuncs.size}`);
    
    // Get schema info
    const schema = await client.getRecordTypes();
    console.log('   Record types:');
    for (const type of schema) {
      console.log(`   - ${type.get('type')}: ${type.get('count')} records`);
    }
    
    // Test 2: Switch to another project
    console.log('\n2️⃣ Switching to eacDemoV4...');
    client.switchTo('local', 'eacDemoV4');
    console.log('📍 New Configuration:');
    console.log(client.getCurrentConfig());
    
    const eacResult = await client.evalAxon('readAll(site).size');
    console.log(`✅ eacDemoV4 sites: ${eacResult.toZinc()}`);
    
    // Test 3: Read Axon functions from project
    console.log('\n3️⃣ Reading Axon Functions...');
    const funcs = await client.getProjectFunctions();
    console.log(`Found ${funcs.size} functions in eacDemoV4`);
    
    if (funcs.size > 0) {
      console.log('\nFirst 5 functions:');
      let count = 0;
      for (const func of funcs) {
        if (count++ >= 5) break;
        console.log(`- ${func.get('name')}: ${func.get('sig')}`);
      }
    }
    
    // Test 4: Switch back to mobilytik
    console.log('\n4️⃣ Switching back to mobilytik...');
    client.switchTo('local', 'mobilytik');
    console.log('📍 Configuration:', client.getCurrentConfig());
    
    // Test 5: Get schema information
    console.log('\n5️⃣ Analyzing Mobilytik Schema...');
    const tags = await client.getProjectSchema();
    console.log(`Found ${tags.size} unique tags`);
    
    // Show most used tags
    console.log('\nTop 10 most used tags:');
    const sortedTags = Array.from(tags).sort((a, b) => {
      const countA = Number(a.get('count')?.toString() || '0');
      const countB = Number(b.get('count')?.toString() || '0');
      return countB - countA;
    });
    
    for (let i = 0; i < Math.min(10, sortedTags.length); i++) {
      const tag = sortedTags[i];
      console.log(`- ${tag.get('tag')}: ${tag.get('count')} uses`);
    }
    
    // Show all available projects
    console.log('\n📊 All Available Projects:');
    const allProjects = configManager.getAllProjects();
    for (const proj of allProjects) {
      console.log(`- ${proj.instance}/${proj.project}: ${proj.description}`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Add command to read functions from a specific project
async function readProjectFunctions(instanceName: string, projectName: string) {
  const configManager = new SkySparkConfigManager('./config');
  const client = new HaystackSkySparkClient(configManager);
  
  console.log(`\n📚 Reading functions from ${instanceName}/${projectName}...`);
  client.switchTo(instanceName, projectName);
  
  try {
    const funcs = await client.getProjectFunctions();
    console.log(`Found ${funcs.size} functions\n`);
    
    for (const func of funcs) {
      const name = func.get('name')?.toString();
      const sig = func.get('sig')?.toString();
      const doc = func.get('doc')?.toString();
      
      console.log(`Function: ${name}`);
      console.log(`Signature: ${sig}`);
      if (doc) console.log(`Doc: ${doc}`);
      console.log('---');
    }
    
    // Export to file
    const exportData = Array.from(funcs).map(f => ({
      name: f.get('name')?.toString(),
      signature: f.get('sig')?.toString(),
      doc: f.get('doc')?.toString(),
      modified: f.get('mod')?.toString()
    }));
    
    const fs = await import('fs/promises');
    const fileName = `./export/${projectName}-functions.json`;
    await fs.mkdir('./export', { recursive: true });
    await fs.writeFile(fileName, JSON.stringify(exportData, null, 2));
    console.log(`\n💾 Exported to ${fileName}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Main execution
if (process.argv.includes('--export')) {
  // Export functions from a specific project
  const args = process.argv;
  const exportIndex = args.indexOf('--export');
  const project = args[exportIndex + 1] || 'mobilytik';
  readProjectFunctions('local', project);
} else {
  // Run multi-project test
  testMultiProject();
}

// Usage:
// npx ts-node test-multi-project.ts                    # Test multi-project support
// npx ts-node test-multi-project.ts --export mobilytik # Export mobilytik functions
// npx ts-node test-multi-project.ts --export eacDemoV4 # Export eacDemoV4 functions