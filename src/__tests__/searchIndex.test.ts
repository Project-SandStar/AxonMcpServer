import { SearchIndex } from '../search/searchIndex';
import { AxonFunction, AxonCategory } from '../types';

describe('SearchIndex', () => {
  let searchIndex: SearchIndex;
  let testFunctions: Map<string, AxonFunction>;

  beforeEach(() => {
    searchIndex = new SearchIndex();
    
    // Create test functions
    testFunctions = new Map([
      ['func1', {
        id: 'func1',
        name: 'energyConsumption',
        filePath: '/test/energy.axon',
        sourceCode: 'meter.hisRead(dates).foldCol("v0", sum)',
        category: AxonCategory.ENERGY,
        tags: ['energy', 'meter', 'consumption'],
        description: 'Calculate total energy consumption',
        parameters: ['meter', 'dates']
      }],
      ['func2', {
        id: 'func2',
        name: 'hvacControl',
        filePath: '/test/hvac.axon',
        sourceCode: 'readAll(ahu).map(x => x->coolingCmd)',
        category: AxonCategory.HVAC,
        tags: ['hvac', 'cooling', 'control'],
        description: 'Control HVAC cooling commands'
      }],
      ['func3', {
        id: 'func3',
        name: 'meterHealth',
        filePath: '/test/meter.axon',
        sourceCode: 'meter.hisRead(yesterday).findAll(v => v == 0)',
        category: AxonCategory.METER,
        tags: ['meter', 'health', 'validation'],
        description: 'Check meter health by finding zero readings'
      }]
    ]);
    
    searchIndex.buildIndex(testFunctions);
  });

  describe('search', () => {
    it('should find functions by single keyword', () => {
      const results = searchIndex.search(['meter']);
      expect(results.size).toBe(2);
      expect(results.has('func1')).toBe(true);
      expect(results.has('func3')).toBe(true);
    });

    it('should find functions by multiple keywords (AND operation)', () => {
      const results = searchIndex.search(['meter', 'health']);
      expect(results.size).toBe(1);
      expect(results.has('func3')).toBe(true);
    });

    it('should return empty set for non-matching keywords', () => {
      const results = searchIndex.search(['nonexistent']);
      expect(results.size).toBe(0);
    });

    it('should support partial matching', () => {
      const results = searchIndex.search(['ener']);
      expect(results.size).toBe(1);
      expect(results.has('func1')).toBe(true);
    });

    it('should be case insensitive', () => {
      const results = searchIndex.search(['HVAC']);
      expect(results.size).toBe(1);
      expect(results.has('func2')).toBe(true);
    });
  });

  describe('searchAny', () => {
    it('should find functions by any keyword (OR operation)', () => {
      const results = searchIndex.searchAny(['energy', 'hvac']);
      expect(results.size).toBe(2);
      expect(results.has('func1')).toBe(true);
      expect(results.has('func2')).toBe(true);
    });

    it('should include all matches', () => {
      const results = searchIndex.searchAny(['meter', 'control']);
      expect(results.size).toBe(3); // All functions match
    });
  });

  describe('performance', () => {
    it('should handle large number of functions efficiently', () => {
      const largeFunctionSet = new Map<string, AxonFunction>();
      
      // Create 1000 test functions
      for (let i = 0; i < 1000; i++) {
        largeFunctionSet.set(`func${i}`, {
          id: `func${i}`,
          name: `function${i}`,
          filePath: `/test/func${i}.axon`,
          sourceCode: `// Test function ${i}`,
          category: AxonCategory.UNCATEGORIZED,
          tags: [`tag${i % 10}`, `category${i % 5}`],
          description: `Test function number ${i}`
        });
      }
      
      const largeIndex = new SearchIndex();
      const startTime = Date.now();
      largeIndex.buildIndex(largeFunctionSet);
      const buildTime = Date.now() - startTime;
      
      expect(buildTime).toBeLessThan(1000); // Should build in less than 1 second
      
      // Test search performance
      const searchStart = Date.now();
      const results = largeIndex.search(['tag5']);
      const searchTime = Date.now() - searchStart;
      
      expect(searchTime).toBeLessThan(100); // Should search in less than 100ms
      expect(results.size).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return index statistics', () => {
      const stats = searchIndex.getStats();
      expect(stats.tokenCount).toBeGreaterThan(0);
      expect(stats.avgFunctionsPerToken).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear the index', () => {
      searchIndex.clear();
      const results = searchIndex.search(['meter']);
      expect(results.size).toBe(0);
      
      const stats = searchIndex.getStats();
      expect(stats.tokenCount).toBe(0);
    });
  });
});