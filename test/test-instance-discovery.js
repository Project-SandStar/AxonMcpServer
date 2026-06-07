import { HaystackSkySparkClient } from './dist/skyspark/haystackClient.js';

const client = new HaystackSkySparkClient({
  host: '<skyspark-host>',
  port: 80,
  protocol: 'http',
  project: 'demo',  // Use demo project to connect
  username: 'alper',
  password: '<password>'
});

console.log('Testing connection to DemoInstance...');
console.log('Host: <skyspark-host>:80');
console.log('Project: demo');
console.log('Username: alper');
console.log('');

try {
  console.log('🔍 Discovering projects...');
  const projects = await client.getAvailableProjects();
  console.log(`✅ Found ${projects.length} projects:`);
  projects.forEach((p, i) => console.log(`   ${i+1}. ${p}`));
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.response) {
    console.error('Response status:', error.response.status);
    console.error('Response data:', error.response.data);
  }
}
