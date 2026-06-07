import { TypedAxonGenerator } from './src/generation/typedAxonGenerator';
import { TemplateLoader } from './src/templates/templateLoader';
import { HaystackSkySparkClient } from './src/skyspark/haystackClient';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

async function testGeneration() {
  console.log('🧪 Testing Axon Code Generation System\n');
  
  // Initialize components
  const templatesDir = path.join(__dirname, 'templates');
  const loader = new TemplateLoader(templatesDir);
  const generator = new TypedAxonGenerator();
  
  // Load templates
  console.log('1️⃣ Loading templates...');
  await loader.loadTemplates();
  
  const stats = loader.getStatistics();
  console.log(`✅ Loaded ${stats.totalTemplates} templates`);
  console.log('   Categories:', Object.entries(stats.byCategory).map(([k,v]) => `${k}(${v})`).join(', '));
  console.log('');
  
  // Test each template
  const templates = loader.getAllTemplates();
  console.log('2️⃣ Testing code generation for each template:\n');
  
  for (const template of templates) {
    console.log(`📄 Template: ${template.name} (${template.id})`);
    console.log(`   Category: ${template.category}`);
    console.log(`   Parameters: ${template.parameters.map(p => p.name).join(', ')}`);
    
    try {
      // Use first example if available, otherwise generate default params
      const exampleParams = template.examples && template.examples[0] 
        ? template.examples[0].params 
        : generator.suggestParameters(template);
      
      console.log(`   Example params:`, exampleParams);
      
      // Generate code
      const result = generator.generate(template, exampleParams);
      
      console.log(`   ✅ Generated ${result.code.split('\n').length} lines of code`);
      
      if (result.warnings) {
        console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`);
      }
      
      if (result.alternatives) {
        console.log(`   💡 ${result.alternatives.length} alternatives suggested`);
      }
      
      // Show first few lines of generated code
      const preview = result.code.split('\n').slice(0, 3).join('\n');
      console.log(`   Preview:\n${preview.split('\n').map(l => '      ' + l).join('\n')}`);
      
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Test template search
  console.log('3️⃣ Testing template search:\n');
  
  const searches = [
    { text: 'energy consumption' },
    { category: 'hvac' },
    { tags: ['fault'] }
  ];
  
  for (const search of searches) {
    const results = loader.searchTemplates(search);
    console.log(`   Search:`, search);
    console.log(`   Found: ${results.length} templates`);
    if (results.length > 0) {
      console.log(`   - ${results.map(t => t.name).join('\n   - ')}`);
    }
    console.log('');
  }
  
  // Test intent matching
  console.log('4️⃣ Testing natural language intent matching:\n');
  
  const intents = [
    'show me energy usage for meters',
    'find temperature faults',
    'get AHU status',
    'query equipment points'
  ];
  
  for (const intent of intents) {
    const matches = loader.findTemplatesByIntent(intent);
    console.log(`   Intent: "${intent}"`);
    console.log(`   Best matches:`);
    matches.slice(0, 3).forEach((t, i) => {
      console.log(`   ${i+1}. ${t.name} (${t.category})`);
    });
    console.log('');
  }
  
  // If SkySpark is running, test validation
  if (process.env.SKYSPARK_HOST) {
    console.log('5️⃣ Testing with SkySpark validation (if running):\n');
    
    try {
      const client = new HaystackSkySparkClient({
        host: process.env.SKYSPARK_HOST || 'localhost',
        port: parseInt(process.env.SKYSPARK_PORT || '8080'),
        project: process.env.SKYSPARK_PROJECT || 'demo',
        username: process.env.SKYSPARK_USERNAME || 'su',
        password: process.env.SKYSPARK_PASSWORD || 'su'
      });
      
      // Test one generated code
      const testTemplate = loader.getTemplate('data-equipment-query');
      if (testTemplate) {
        const params = { equipFilter: 'equip', sortBy: 'dis' };
        const result = generator.generate(testTemplate, params);
        
        console.log('   Validating generated code...');
        const validation = await client.validateAxon(result.code);
        
        if (validation.valid) {
          console.log('   ✅ Code is valid Axon!');
          
          // Try to execute it
          console.log('   Executing query...');
          const execResult = await client.evalAxon(result.code + '.limit(5)');
          console.log('   ✅ Execution successful!');
        } else {
          console.log('   ❌ Validation error:', validation.error);
        }
      }
    } catch (error: any) {
      console.log('   ⚠️  SkySpark not available:', error.message);
      console.log('   💡 Start SkySpark to test validation');
    }
  }
  
  console.log('\n✨ Code generation system is working!');
  console.log('\n💡 Next steps:');
  console.log('   1. Add more templates to the templates/ directory');
  console.log('   2. Integrate with MCP tools in src/index.ts');
  console.log('   3. Test with Cline for natural language code generation');
}

// Run the test
testGeneration().catch(console.error);