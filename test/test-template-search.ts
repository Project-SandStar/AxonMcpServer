#!/usr/bin/env ts-node
import { TemplateLoader } from './src/templates/templateLoader';

async function testTemplateSearch() {
  console.log('🚀 Testing template search functionality...\n');
  
  // Initialize template loader with actual templates directory
  const templateLoader = new TemplateLoader('./templates');
  await templateLoader.loadTemplates();
  
  // Get all templates to see what we have
  const allTemplates = templateLoader.getAllTemplates();
  console.log(`Total templates loaded: ${allTemplates.length}`);
  allTemplates.forEach(t => {
    console.log(`  - ${t.name} (${t.id}): ${t.description}`);
  });
  
  // Test keywords that should match our templates
  const testKeywords = ['energy', 'temperature', 'hvac', 'equipment', 'fault', 'meter'];
  
  console.log('\n\nTesting template search by intent:');
  for (const keyword of testKeywords) {
    const matches = templateLoader.findTemplatesByIntent(keyword);
    console.log(`\nKeyword: "${keyword}"`);
    console.log(`  Matches: ${matches.length}`);
    matches.forEach(t => {
      console.log(`    - ${t.name} (${t.id}): ${t.description}`);
      console.log(`      Tags: ${t.tags.join(', ')}`);
      console.log(`      Hint: Use generateAxonCode with templateId: '${t.id}'`);
    });
  }
  
  // Show how this would appear in searchExamples response
  console.log('\n\nExample searchExamples response structure:');
  const exampleResponse = {
    count: 5, // example function count
    functions: [
      // ... function results would go here
    ],
    templateSuggestions: templateLoader.findTemplatesByIntent('energy').slice(0, 3).map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      hint: `Use generateAxonCode with templateId: '${t.id}' to generate this code`
    }))
  };
  
  console.log(JSON.stringify(exampleResponse, null, 2));
  
  console.log('\n✅ Template search test completed successfully!');
}

// Run the test
testTemplateSearch().catch(console.error);

export { testTemplateSearch };
