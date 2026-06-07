import { CacheManager } from '../cache/cacheManager';
import { AxonCodeIndex, AxonCategory } from '../types';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const testCacheDir = '.test-cache';
  const testLibraryPath = '/test/library/path';

  beforeEach(async () => {
    cacheManager = new CacheManager(testCacheDir);
    await cacheManager.clearCache();
    await cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.clearCache();
  });

  describe('initialize', () => {
    it('should create cache directory', async () => {
      const stats = await fs.stat(testCacheDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('cache validation', () => {
    it('should return false for non-existent cache', async () => {
      const isValid = await cacheManager.isValidCache(testLibraryPath);
      expect(isValid).toBe(false);
    });

    it('should validate cache after saving', async () => {
      const testIndex: AxonCodeIndex = {
        functions: new Map([['test', {
          id: 'test',
          name: 'testFunction',
          filePath: '/test.axon',
          sourceCode: '() => do end',
          category: AxonCategory.UNCATEGORIZED,
          tags: []
        }]]),
        categories: new Map([[AxonCategory.UNCATEGORIZED, ['test']]]),
        tags: new Map(),
        lastUpdated: new Date()
      };

      await cacheManager.saveCache(testIndex, testLibraryPath);
      const isValid = await cacheManager.isValidCache(testLibraryPath);
      expect(isValid).toBe(true);
    });

    it('should invalidate old cache', async () => {
      const testIndex: AxonCodeIndex = {
        functions: new Map(),
        categories: new Map(),
        tags: new Map(),
        lastUpdated: new Date()
      };

      await cacheManager.saveCache(testIndex, testLibraryPath);
      
      // Check with very short max age
      const isValid = await cacheManager.isValidCache(testLibraryPath, 1);
      
      // Wait a bit and check
      await new Promise(resolve => setTimeout(resolve, 10));
      const isValidAfter = await cacheManager.isValidCache(testLibraryPath, 1);
      expect(isValidAfter).toBe(false);
    });

    it('should invalidate cache for different library path', async () => {
      const testIndex: AxonCodeIndex = {
        functions: new Map(),
        categories: new Map(),
        tags: new Map(),
        lastUpdated: new Date()
      };

      await cacheManager.saveCache(testIndex, testLibraryPath);
      const isValid = await cacheManager.isValidCache('/different/path');
      expect(isValid).toBe(false);
    });
  });

  describe('save and load cache', () => {
    it('should save and load cache correctly', async () => {
      const testIndex: AxonCodeIndex = {
        functions: new Map([
          ['func1', {
            id: 'func1',
            name: 'testFunction1',
            filePath: '/test1.axon',
            sourceCode: '() => do 1 end',
            category: AxonCategory.ENERGY,
            tags: ['test', 'energy']
          }],
          ['func2', {
            id: 'func2',
            name: 'testFunction2',
            filePath: '/test2.axon',
            sourceCode: '() => do 2 end',
            category: AxonCategory.HVAC,
            tags: ['test', 'hvac']
          }]
        ]),
        categories: new Map([
          [AxonCategory.ENERGY, ['func1']],
          [AxonCategory.HVAC, ['func2']]
        ]),
        tags: new Map([
          ['test', ['func1', 'func2']],
          ['energy', ['func1']],
          ['hvac', ['func2']]
        ]),
        lastUpdated: new Date()
      };

      await cacheManager.saveCache(testIndex, testLibraryPath);
      const loadedIndex = await cacheManager.loadCache();

      expect(loadedIndex).not.toBeNull();
      expect(loadedIndex!.functions.size).toBe(2);
      expect(loadedIndex!.functions.get('func1')?.name).toBe('testFunction1');
      expect(loadedIndex!.categories.size).toBe(2);
      expect(loadedIndex!.tags.size).toBe(3);
    });

    it('should handle cache load failure gracefully', async () => {
      // Create invalid cache file
      await fs.writeFile(path.join(testCacheDir, 'axon-index.json'), 'invalid json');
      
      const loadedIndex = await cacheManager.loadCache();
      expect(loadedIndex).toBeNull();
    });
  });

  describe('file modification tracking', () => {
    it('should detect file modifications', async () => {
      const testFile = path.join(testCacheDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      const modTime1 = await cacheManager.getFileModTime(testFile);
      expect(modTime1).not.toBeNull();
      
      // Modify file
      await new Promise(resolve => setTimeout(resolve, 10));
      await fs.writeFile(testFile, 'modified content');
      
      const modTime2 = await cacheManager.getFileModTime(testFile);
      expect(modTime2).toBeGreaterThan(modTime1!);
    });

    it('should detect if files have changed', async () => {
      const testFile = path.join(testCacheDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      const cacheTime = Date.now();
      
      // No changes yet
      let hasChanged = await cacheManager.hasFilesChanged([testFile], cacheTime);
      expect(hasChanged).toBe(false);
      
      // Modify file
      await new Promise(resolve => setTimeout(resolve, 10));
      await fs.writeFile(testFile, 'modified content');
      
      hasChanged = await cacheManager.hasFilesChanged([testFile], cacheTime);
      expect(hasChanged).toBe(true);
    });
  });
});