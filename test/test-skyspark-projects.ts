import axios from 'axios';
import * as dotenv from 'dotenv';

// Load both configuration files
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.skyspark' });

async function testSkySpark() {
  console.log('🔍 Testing SkySpark Connection...\n');
  
  const host = process.env.SKYSPARK_HOST || 'localhost';
  const port = process.env.SKYSPARK_PORT || '8080';
  const username = process.env.SKYSPARK_USERNAME || 'su';
  const password = process.env.SKYSPARK_PASSWORD || 'su';
  
  console.log(`Host: ${host}:${port}`);
  console.log(`Username: ${username}`);
  console.log('');
  
  try {
    // Test 1: Check if SkySpark is responding
    console.log('1️⃣ Checking SkySpark server...');
    const baseURL = `http://${host}:${port}`;
    const response = await axios.get(baseURL, {
      validateStatus: () => true // Accept any status
    });
    console.log(`✅ SkySpark is running (status: ${response.status})`);
    
    // Test 2: List available projects
    console.log('\n2️⃣ Listing available projects...');
    const projects = [
      'demo',
      'cityFurnitureCustomerTraffic',
      'eacDemoV4', 
      'hybDemo',
      'mobilytik',
      'reFuelMarket',
      'test'
    ];
    
    for (const project of projects) {
      try {
        const apiURL = `${baseURL}/api/${project}/about`;
        const projResponse = await axios.get(apiURL, {
          auth: { username, password },
          validateStatus: () => true
        });
        
        if (projResponse.status === 200) {
          console.log(`✅ ${project} - Available`);
        } else if (projResponse.status === 401) {
          console.log(`🔐 ${project} - Requires authentication`);
        } else {
          console.log(`❌ ${project} - Not accessible (${projResponse.status})`);
        }
      } catch (error) {
        console.log(`❌ ${project} - Error`);
      }
    }
    
    // Test 3: Test Axon evaluation on demo project
    console.log('\n3️⃣ Testing Axon evaluation...');
    const demoURL = `${baseURL}/api/demo/eval`;
    try {
      const evalResponse = await axios.post(demoURL, 'now()', {
        auth: { username, password },
        headers: { 'Content-Type': 'text/plain', 'Accept': 'text/zinc' }
      });
      
      if (evalResponse.status === 200) {
        console.log('✅ Axon evaluation working!');
        console.log('Result:', evalResponse.data.slice(0, 100) + '...');
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log('🔐 Authentication required. Please check username/password.');
      } else {
        console.log('❌ Axon evaluation failed:', error.message);
      }
    }
    
    console.log('\n📝 Next steps:');
    console.log('1. If authentication failed, update SKYSPARK_USERNAME and SKYSPARK_PASSWORD in .env.skyspark');
    console.log('2. Choose a project and update SKYSPARK_PROJECT in .env.skyspark');
    console.log('3. Run: npx ts-node test-connection.ts');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure SkySpark is running: cd /Users/<user>/skyspark/skyspark-3.1.8/bin && ./skyspark');
    console.log('2. Check if port 8080 is accessible');
    console.log('3. Verify your credentials');
  }
}

testSkySpark();