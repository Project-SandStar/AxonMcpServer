import { McpQueryCache } from '../../../src/cache/McpQueryCache';
import * as vscode from 'vscode';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('McpQueryCache', () => {
  let mockContext: vscode.ExtensionContext;
  let cache: McpQueryCache;

  beforeEach(() => {
    // Create mock context with globalState
    const state = new Map();
    mockContext = {
      globalState: {
        get: jest.fn((key: string, defaultValue?: any) => state.get(key) || defaultValue),
        update: jest.fn((key: string, value: any) => state.set(key, value)),
        keys: jest.fn(() => Array.from(state.keys()))
      }
    } as any;

    // Create cache with short TTL for testing
    cache = new McpQueryCache(mockContext, 'test.cache', 10, 1000); // 10 entries, 1 second TTL
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('Basic Operations', () => {
    it('should return null for cache miss', () => {
      const result = cache.get('search_examples', { query: 'test' });
      expect(result).toBeNull();
    });

    it('should store and retrieve values', () => {
      const testData = { examples: ['example1', 'example2'] };
      cache.set('search_examples', { query: 'test' }, testData);

      const result = cache.get('search_examples', { query: 'test' });
      expect(result).toEqual(testData);
    });

    it('should return null for different parameters', () => {
      const testData = { examples: ['example1'] };
      cache.set('search_examples', { query: 'test', limit: 5 }, testData);

      const result = cache.get('search_examples', { query: 'test', limit: 10 });
      expect(result).toBeNull();
    });

    it('should handle complex parameter objects', () => {
      const params = {
        query: 'test',
        filters: { type: 'function', tags: ['util'] },
        limit: 10
      };
      const testData = { results: [1, 2, 3] };

      cache.set('complex_query', params, testData);
      const result = cache.get('complex_query', params);

      expect(result).toEqual(testData);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const testData = { value: 'test' };
      cache.set('expire_test', { id: 1 }, testData);

      // Should be available immediately
      expect(cache.get('expire_test', { id: 1 })).toEqual(testData);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be null after expiration
      expect(cache.get('expire_test', { id: 1 })).toBeNull();
    });

    it('should clear expired entries with clearExpired', async () => {
      cache.set('entry1', { id: 1 }, 'data1');
      cache.set('entry2', { id: 2 }, 'data2');

      await new Promise(resolve => setTimeout(resolve, 1100));

      cache.set('entry3', { id: 3 }, 'data3');

      cache.clearExpired();

      expect(cache.get('entry1', { id: 1 })).toBeNull();
      expect(cache.get('entry2', { id: 2 })).toBeNull();
      expect(cache.get('entry3', { id: 3 })).toBe('data3');
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when full', () => {
      // Fill cache to capacity (10 entries)
      for (let i = 0; i < 10; i++) {
        cache.set('tool', { id: i }, `data${i}`);
      }

      // Access entry 5 to make it more recently used
      cache.get('tool', { id: 5 });

      // Add new entry, should evict entry 0 (least recently used)
      cache.set('tool', { id: 10 }, 'data10');

      expect(cache.get('tool', { id: 0 })).toBeNull();
      expect(cache.get('tool', { id: 5 })).toBe('data5');
      expect(cache.get('tool', { id: 10 })).toBe('data10');
    });

    it('should track access count correctly', () => {
      cache.set('tool', { id: 1 }, 'data1');
      cache.set('tool', { id: 2 }, 'data2');

      // Access entry 1 multiple times
      cache.get('tool', { id: 1 });
      cache.get('tool', { id: 1 });
      cache.get('tool', { id: 1 });

      // Fill cache
      for (let i = 3; i < 11; i++) {
        cache.set('tool', { id: i }, `data${i}`);
      }

      // Add one more, should evict entry 2 (least accessed)
      cache.set('tool', { id: 11 }, 'data11');

      expect(cache.get('tool', { id: 1 })).toBe('data1'); // Highly accessed, should remain
      expect(cache.get('tool', { id: 2 })).toBeNull(); // Least accessed, should be evicted
    });
  });

  describe('has() Method', () => {
    it('should return false for non-existent key', () => {
      expect(cache.has('tool', { id: 1 })).toBe(false);
    });

    it('should return true for existing key', () => {
      cache.set('tool', { id: 1 }, 'data');
      expect(cache.has('tool', { id: 1 })).toBe(true);
    });

    it('should return false for expired key', async () => {
      cache.set('tool', { id: 1 }, 'data');
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(cache.has('tool', { id: 1 })).toBe(false);
    });
  });

  describe('getCachedOrQuery() Helper', () => {
    it('should return cached value if available', async () => {
      cache.set('tool', { id: 1 }, 'cached');
      
      const queryFn = jest.fn().mockResolvedValue('fresh');
      const result = await cache.getCachedOrQuery('tool', { id: 1 }, queryFn);

      expect(result).toBe('cached');
      expect(queryFn).not.toHaveBeenCalled();
    });

    it('should call query function on cache miss', async () => {
      const queryFn = jest.fn().mockResolvedValue('fresh');
      const result = await cache.getCachedOrQuery('tool', { id: 1 }, queryFn);

      expect(result).toBe('fresh');
      expect(queryFn).toHaveBeenCalled();
    });

    it('should cache result from query function', async () => {
      const queryFn = jest.fn().mockResolvedValue('fresh');
      await cache.getCachedOrQuery('tool', { id: 1 }, queryFn);

      // Second call should use cache
      const queryFn2 = jest.fn();
      await cache.getCachedOrQuery('tool', { id: 1 }, queryFn2);

      expect(queryFn2).not.toHaveBeenCalled();
    });
  });

  describe('clear() Method', () => {
    it('should clear all entries', () => {
      cache.set('tool1', { id: 1 }, 'data1');
      cache.set('tool2', { id: 2 }, 'data2');
      cache.set('tool3', { id: 3 }, 'data3');

      cache.clear();

      expect(cache.get('tool1', { id: 1 })).toBeNull();
      expect(cache.get('tool2', { id: 2 })).toBeNull();
      expect(cache.get('tool3', { id: 3 })).toBeNull();
    });

    it('should reset statistics', () => {
      cache.set('tool', { id: 1 }, 'data');
      cache.get('tool', { id: 1 }); // hit
      cache.get('tool', { id: 2 }); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('tool', { id: 1 }, 'data');

      cache.get('tool', { id: 1 }); // hit
      cache.get('tool', { id: 2 }); // miss
      cache.get('tool', { id: 1 }); // hit
      cache.get('tool', { id: 3 }); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should calculate hit rate correctly', () => {
      // No requests yet
      expect(cache.getStats().hitRate).toBe(0);

      cache.set('tool', { id: 1 }, 'data');
      
      // 3 hits, 1 miss
      cache.get('tool', { id: 1 });
      cache.get('tool', { id: 1 });
      cache.get('tool', { id: 1 });
      cache.get('tool', { id: 2 });

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.75);
    });

    it('should report cache size', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('tool', { id: 1 }, 'data1');
      cache.set('tool', { id: 2 }, 'data2');
      
      expect(cache.getStats().size).toBe(2);
    });

    it('should estimate memory usage', () => {
      const stats1 = cache.getStats();
      expect(stats1.memory).toBe(0);

      cache.set('tool', { id: 1 }, { large: 'data'.repeat(100) });

      const stats2 = cache.getStats();
      expect(stats2.memory).toBeGreaterThan(0);
    });
  });

  describe('Persistence', () => {
    it('should save to globalState', () => {
      cache.set('tool', { id: 1 }, 'data1');
      cache.set('tool', { id: 2 }, 'data2');

      // Trigger save (debounced, so force it)
      cache.dispose();

      expect(mockContext.globalState.update).toHaveBeenCalled();
    });

    it('should load from globalState', () => {
      // Pre-populate globalState
      const savedData = [
        {
          key: 'test-key-1',
          value: { data: 'value1' },
          timestamp: Date.now()
        }
      ];
      (mockContext.globalState.get as jest.Mock).mockReturnValue(savedData);

      // Create new cache instance
      const newCache = new McpQueryCache(mockContext, 'test.cache', 10, 10000);

      // Should have loaded the data (though we can't directly test the internal state)
      const stats = newCache.getStats();
      expect(stats.size).toBeGreaterThan(0);

      newCache.dispose();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      cache.set('tool', { id: 1 }, null);
      expect(cache.get('tool', { id: 1 })).toBeNull();
    });

    it('should handle undefined values', () => {
      cache.set('tool', { id: 1 }, undefined);
      expect(cache.get('tool', { id: 1 })).toBeUndefined();
    });

    it('should handle empty parameters', () => {
      cache.set('tool', {}, 'data');
      expect(cache.get('tool', {})).toBe('data');
    });

    it('should handle large data', () => {
      const largeData = {
        content: 'x'.repeat(10000),
        nested: {
          array: Array(100).fill({ key: 'value' })
        }
      };

      cache.set('large', { id: 1 }, largeData);
      const result = cache.get('large', { id: 1 });

      expect(result).toEqual(largeData);
    });

    it('should handle parameter order independence', () => {
      const data = 'test';
      cache.set('tool', { a: 1, b: 2 }, data);

      // Same params, different order
      const result = cache.get('tool', { b: 2, a: 1 });
      expect(result).toBe(data);
    });
  });
});
