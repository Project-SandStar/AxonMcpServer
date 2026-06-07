const fs = require('fs');
const path = require('path');

// Test loading one cache file
const cacheDir = '.cache';
const testFile = 'axon-index-michealsEnergy-kidsfoodbasket.json';
const cachePath = path.join(cacheDir, testFile);

console.log('Testing cache file loading...\n');
console.log('File:', cachePath);

const content = fs.readFileSync(cachePath, 'utf-8');
const projectIndex = JSON.parse(content);

console.log('\nCache structure:');
console.log('- functions type:', Array.isArray(projectIndex.functions) ? 'Array' : typeof projectIndex.functions);
console.log('- functions length:', projectIndex.functions ? projectIndex.functions.length : 0);

if (projectIndex.functions && projectIndex.functions.length > 0) {
  const firstFunc = projectIndex.functions[0];
  console.log('\nFirst function entry:');
  console.log('- Entry type:', Array.isArray(firstFunc) ? 'Array' : typeof firstFunc);
  console.log('- Entry length:', firstFunc.length);
  
  if (Array.isArray(firstFunc) && firstFunc.length === 2) {
    const [funcId, func] = firstFunc;
    console.log('\nFunction details:');
    console.log('- ID:', funcId);
    console.log('- Name:', func.name);
    console.log('- FilePath:', func.filePath);
    console.log('- Category:', func.category);
    console.log('- Tags:', func.tags);
  }
}

// Test searching for the function
console.log('\n\nSearching for "calculateDeltaFromTempCur":');
const found = projectIndex.functions.filter(f => {
  if (Array.isArray(f) && f.length === 2) {
    const [id, func] = f;
    return func.name === 'calculateDeltaFromTempCur';
  }
  return false;
});

console.log('Found:', found.length, 'function(s)');
if (found.length > 0) {
  const [id, func] = found[0];
  console.log('Match:', func.name, 'in', func.filePath);
}
