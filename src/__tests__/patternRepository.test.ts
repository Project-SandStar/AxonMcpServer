import { PatternRepository } from '../patterns/patternRepository';

describe('PatternRepository', () => {
  let patternRepo: PatternRepository;

  beforeEach(() => {
    patternRepo = new PatternRepository();
  });

  describe('initialization', () => {
    it('should initialize with predefined patterns', () => {
      const patterns = patternRepo.getAllPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should have patterns in multiple categories', () => {
      const energyPatterns = patternRepo.getPatternsByCategory('energy');
      const hvacPatterns = patternRepo.getPatternsByCategory('hvac');
      const meterPatterns = patternRepo.getPatternsByCategory('meter');
      
      expect(energyPatterns.length).toBeGreaterThan(0);
      expect(hvacPatterns.length).toBeGreaterThan(0);
      expect(meterPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('getPattern', () => {
    it('should retrieve pattern by ID', () => {
      const pattern = patternRepo.getPattern('energy-consumption-total');
      
      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('Total Energy Consumption');
      expect(pattern?.code).toContain('hisRead');
      expect(pattern?.useCases).toContain('Monthly energy reporting');
    });

    it('should return undefined for non-existent pattern', () => {
      const pattern = patternRepo.getPattern('non-existent-pattern');
      expect(pattern).toBeUndefined();
    });
  });

  describe('searchPatterns', () => {
    it('should find patterns by keyword in name', () => {
      const results = patternRepo.searchPatterns('energy');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p => p.id === 'energy-consumption-total')).toBe(true);
    });

    it('should find patterns by keyword in description', () => {
      const results = patternRepo.searchPatterns('temperature');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p => p.id === 'hvac-setpoint-reset')).toBe(true);
    });

    it('should find patterns by keyword in code', () => {
      const results = patternRepo.searchPatterns('hisRead');
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find patterns by keyword in use cases', () => {
      const results = patternRepo.searchPatterns('billing');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p => p.id === 'energy-consumption-total')).toBe(true);
    });

    it('should be case insensitive', () => {
      const results1 = patternRepo.searchPatterns('ENERGY');
      const results2 = patternRepo.searchPatterns('energy');
      
      expect(results1.length).toBe(results2.length);
    });
  });

  describe('getPatternsByCategory', () => {
    it('should filter patterns by category prefix', () => {
      const energyPatterns = patternRepo.getPatternsByCategory('energy');
      
      expect(energyPatterns.length).toBeGreaterThan(0);
      expect(energyPatterns.every(p => p.id.startsWith('energy'))).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      const patterns = patternRepo.getPatternsByCategory('nonexistent');
      
      expect(patterns).toEqual([]);
    });
  });

  describe('pattern content validation', () => {
    it('should have valid Axon code in all patterns', () => {
      const patterns = patternRepo.getAllPatterns();
      
      patterns.forEach(pattern => {
        expect(pattern.code).toBeTruthy();
        expect(pattern.code).toContain('=>');
        expect(pattern.code).toContain('do');
        expect(pattern.code).toContain('end');
      });
    });

    it('should have complete metadata for all patterns', () => {
      const patterns = patternRepo.getAllPatterns();
      
      patterns.forEach(pattern => {
        expect(pattern.id).toBeTruthy();
        expect(pattern.name).toBeTruthy();
        expect(pattern.description).toBeTruthy();
        expect(pattern.useCases.length).toBeGreaterThan(0);
        expect(pattern.relatedFunctions.length).toBeGreaterThan(0);
      });
    });
  });
});