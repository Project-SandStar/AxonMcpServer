import { ContextCache } from '../../../src/cache/ContextCache';
import { GenerationRequest, GatheredContext } from '../../../src/ai/types';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('ContextCache', () => {
  let cache: ContextCache;

  const createMockRequest = (
    instruction: string = 'test',
    fileName: string = 'test.axon'
  ): GenerationRequest => ({
    type: 'function',
    instruction,
    context: {
      fileName,
      languageId: 'axon'
    }
  });

  const createMockContext = (): GatheredContext => ({
    examples: [{ code: 'example', description: 'test', source: 'mcp' }],
    documentation: [{ name: 'doc', content: 'content', type: 'function' }],
    editorContext: {
      fileName: 'test.axon',
      languageId: 'axon'
    },
    conversationHistory: [],
    estimatedTokens: 100
  });

  beforeEach(() => {
    cache = new ContextCache(10, 1000); // 10 entries, 1 second TTL
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('Basic Operations', () => {
    it('should return null for cache miss', async () => {
      const request = createMockRequest();
      const result = await cache.get(request);
      expect(result).toBeNull();
    });

    it('should store and retrieve context', async () => {
      const request = createMockRequest();
      const context = createMockContext();

      await cache.set(request, context);
      const retrieved = await cache.get(request);

      expect(retrieved).toEqual(context);
    });

    it('should return null for different instruction', async () => {
      const request1 = createMockRequest('instruction1');
      const request2 = createMockRequest('instruction2');
      const context = createMockContext();

      await cache.set(request1, context);
      expect(await cache.get(request2)).toBeNull();
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const request = createMockRequest();
      const context = createMockContext();

      await cache.set(request, context);
      expect(await cache.get(request)).toEqual(context);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(await cache.get(request)).toBeNull();
    });

    it('should clear expired entries', async () => {
      const request1 = createMockRequest('test1');
      const request2 = createMockRequest('test2');
      const context = createMockContext();

      await cache.set(request1, context);
      await cache.set(request2, context);

      await new Promise(resolve => setTimeout(resolve, 1100));

      cache.clearExpired();

      expect(await cache.get(request1)).toBeNull();
      expect(await cache.get(request2)).toBeNull();
    });
  });

  describe('invalidateFile() Method', () => {
    it('should invalidate entries for specific file', async () => {
      const request1 = createMockRequest('test1', 'file1.axon');
      const request2 = createMockRequest('test2', 'file2.axon');
      const context = createMockContext();

      await cache.set(request1, context);
      await cache.set(request2, context);

      cache.invalidateFile('file1.axon');

      expect(await cache.get(request1)).toBeNull();
      expect(await cache.get(request2)).not.toBeNull();
    });

    it('should track invalidation count', async () => {
      const request = createMockRequest('test', 'file.axon');
      await cache.set(request, createMockContext());

      cache.invalidateFile('file.axon');

      const stats = cache.getStats();
      expect(stats.invalidations).toBe(1);
    });
  });

  describe('has() Method', () => {
    it('should return false for non-existent request', async () => {
      const request = createMockRequest();
      expect(await cache.has(request)).toBe(false);
    });

    it('should return true for cached request', async () => {
      const request = createMockRequest();
      await cache.set(request, createMockContext());
      expect(await cache.has(request)).toBe(true);
    });

    it('should return false for expired request', async () => {
      const request = createMockRequest();
      await cache.set(request, createMockContext());

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(await cache.has(request)).toBe(false);
    });
  });

  describe('clear() Method', () => {
    it('should clear all entries', async () => {
      for (let i = 0; i < 3; i++) {
        await cache.set(createMockRequest(`test${i}`), createMockContext());
      }

      cache.clear();

      for (let i = 0; i < 3; i++) {
        expect(await cache.get(createMockRequest(`test${i}`))).toBeNull();
      }
    });

    it('should reset statistics', async () => {
      const request = createMockRequest();
      await cache.set(request, createMockContext());
      await cache.get(request); // hit
      await cache.get(createMockRequest('other')); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', async () => {
      const request = createMockRequest();
      await cache.set(request, createMockContext());

      await cache.get(request); // hit
      await cache.get(createMockRequest('miss1')); // miss
      await cache.get(request); // hit
      await cache.get(createMockRequest('miss2')); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should report cache size', async () => {
      expect(cache.getStats().size).toBe(0);

      await cache.set(createMockRequest('test1'), createMockContext());
      await cache.set(createMockRequest('test2'), createMockContext());

      expect(cache.getStats().size).toBe(2);
    });

    it('should estimate memory usage', async () => {
      const stats1 = cache.getStats();
      expect(stats1.memory).toBe(0);

      await cache.set(createMockRequest(), createMockContext());

      const stats2 = cache.getStats();
      expect(stats2.memory).toBeGreaterThan(0);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when full', async () => {
      // Fill cache to capacity
      for (let i = 0; i < 10; i++) {
        await cache.set(createMockRequest(`test${i}`), createMockContext());
      }

      // Access entry 5
      await cache.get(createMockRequest('test5'));

      // Add new entry, should evict entry 0
      await cache.set(createMockRequest('test10'), createMockContext());

      expect(await cache.get(createMockRequest('test0'))).toBeNull();
      expect(await cache.get(createMockRequest('test5'))).not.toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing fileName', async () => {
      const request: GenerationRequest = {
        type: 'function',
        instruction: 'test',
        context: { languageId: 'axon' }
      };
      const context = createMockContext();

      await cache.set(request, context);
      expect(await cache.get(request)).toEqual(context);
    });

    it('should handle empty instruction', async () => {
      const request = createMockRequest('');
      const context = createMockContext();

      await cache.set(request, context);
      expect(await cache.get(request)).toEqual(context);
    });
  });

  describe('Dispose', () => {
    it('should cleanup on dispose', async () => {
      await cache.set(createMockRequest(), createMockContext());
      cache.dispose();

      // Should not throw
      expect(() => cache.dispose()).not.toThrow();
    });
  });
});
