import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import { SkySparkConfigManager } from './src/config/skysparkConfig';
import * as dotenv from 'dotenv';

// Load both configuration files
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

async function test() {
  console.log('🔍 Testing SkySpark connection...');
  
  // Create configuration manager
  const configManager = new SkySparkConfigManager('./config');
  
  // Create client with configuration manager for multi-project support
  const client = new HaystackSkySparkClient(configManager);
  
  // Show current configuration
  const config = client.getCurrentConfig();
  console.log(`SkySpark: ${config.url}`);
  console.log(`Project: ${config.project} (${config.instance})`);
  console.log('');
  
  try {
    console.log('1️⃣ Testing Axon evaluation...');
    const result = await client.evalAxon('now()');
    console.log('✅ Success! Current time:', result.toZinc());
    
    console.log('\n2️⃣ Testing validation...');
    const validation = await client.validateAxon('readAll(site).size');
    console.log('✅ Validation:', validation);
    
    console.log('\n3️⃣ Project information...');
    const sites = await client.evalAxon('readAll(site).size');
    const equips = await client.evalAxon('readAll(equip).size');
    const points = await client.evalAxon('readAll(point).size');
    console.log(`Sites: ${sites.toZinc()}, Equipment: ${equips.toZinc()}, Points: ${points.toZinc()}`);
    
    console.log('\n📊 Your SkySpark is ready for development!');
    
    // Show all available projects
    console.log('\nAvailable projects:');
    const allProjects = configManager.getAllProjects();
    for (const proj of allProjects) {
      const current = proj.project === config.project ? ' (current)' : '';
      console.log(`- ${proj.instance}/${proj.project}${current}: ${proj.description}`);
    }
    
    console.log('\n💡 Tips:');
    console.log('- Use test-multi-project.ts to switch between projects');
    console.log('- Export functions: npx ts-node test-multi-project.ts --export mobilytik');
    console.log('- Add new instances in config/ directory');
    
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if SkySpark is running');
    console.log('2. Verify credentials in .env.skyspark');
    console.log('3. Try running: npx ts-node test-skyspark-projects.ts');
  }
}

test();
