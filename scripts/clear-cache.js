#!/usr/bin/env node
import { CacheManager } from './dist/cache/cacheManager.js';
import { loadConfig } from './dist/config/config.js';

async function clearCache() {
  try {
    // Load configuration
    const configPath = process.argv[2];
    const config = loadConfig(configPath);
    
    // Create cache manager
    const cacheManager = new CacheManager(config.cache?.directory || '.cache');
    
    // Clear the cache
    await cacheManager.clearCache();
    
    console.log('✅ Cache cleared successfully!');
    console.log(`   Cache directory: ${config.cache?.directory || '.cache'}`);
  } catch (error) {
    console.error('❌ Error clearing cache:', error.message);
    process.exit(1);
  }
}

clearCache();