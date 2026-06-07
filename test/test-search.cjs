const fs = require('fs');

// Read the debug file to check what functions are loaded
const debugContent = fs.readFileSync('debug-index-state.txt', 'utf-8');
console.log('Total functions loaded:', debugContent.match(/Functions loaded: (\d+)/)[1]);

// Check load log for calculateDelta
const loadLog = fs.readFileSync('load-project-caches.log', 'utf-8');
const hasCalcFunc = loadLog.includes('kidsfoodbasket');
console.log('kidsfoodbasket project loaded:', hasCalcFunc);

// The issue: search might be filtering out proj functions
console.log('\nLikely issue: searchAxonExamples filters out functions with "documentation" tag');
console.log('OR: searchIndex tokenization issue with camelCase');
console.log('\nTo debug:');
console.log('1. Check if proj functions have "documentation" tag (they shouldn\'t)');
console.log('2. Check if searchIndex tokenizes "calculateDeltaFromTempCur" correctly');
console.log('3. Try searching for just "delta" or "temp" to see if ANY proj functions are found');
