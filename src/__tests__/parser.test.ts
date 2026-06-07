import { AxonParser } from '../parser/axonParser';
import { AxonCategory } from '../types';

describe('AxonParser', () => {
  let parser: AxonParser;

  beforeEach(() => {
    parser = new AxonParser();
  });

  describe('parseFunctions', () => {
    it('should parse a simple Axon function', () => {
      const code = `
/* Test function */
(meter, dates) => do
  meter.hisRead(dates).foldCol("v0", sum)
end
      `;
      const functions = parser.parseFunctions(code, 'test.axon');
      
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('test');
      expect(functions[0].parameters).toEqual(['meter', 'dates']);
    });

    it('should parse documentation comments', () => {
      const code = `
/* ------------------------------------
   Function: meterOccUsage
   Description: Calculate meter usage during occupied hours
   Author: Test Author
   Version: 1.0.0
   ------------------------------------ */
(meter, dates) => do
  meter.hisRead(dates).foldCol("v0", sum)
end
      `;
      const functions = parser.parseFunctions(code, 'meterOccUsage.axon');
      
      expect(functions).toHaveLength(1);
      expect(functions[0].description).toBeTruthy();
      expect(functions[0].tags).toContain('test author');
    });

    it('should handle functions without parameters', () => {
      const code = `
() => do
  today()
end
      `;
      const functions = parser.parseFunctions(code, 'getToday.axon');
      
      expect(functions).toHaveLength(1);
      expect(functions[0].parameters).toEqual([]);
    });
  });

  describe('categorizeFunction', () => {
    it('should categorize HVAC functions', () => {
      const code = 'readAll(ahu and vav).map(x => x->coolingCmd)';
      const functions = parser.parseFunctions(`() => do ${code} end`, 'hvacControl.axon');
      
      expect(functions[0].category).toBe(AxonCategory.HVAC);
    });

    it('should categorize energy functions', () => {
      const code = 'meter.hisRead(dates).foldCol("v0", sum).as(1kWh)';
      const functions = parser.parseFunctions(`(meter, dates) => do ${code} end`, 'energyCalc.axon');
      
      expect(functions[0].category).toBe(AxonCategory.ENERGY);
    });

    it('should categorize meter functions', () => {
      const functions = parser.parseFunctions('() => do read(meter) end', 'meterRead.axon');
      
      expect(functions[0].category).toBe(AxonCategory.METER);
    });
  });

  describe('extractExamples', () => {
    it('should extract inline examples', () => {
      const code = `
// Example: meterOccUsage(meter, today)
// Usage: meterOccUsage(read(elec and siteMeter), lastWeek)
(meter, dates) => do
  meter.hisRead(dates)
end
      `;
      
      const examples = parser.extractExamples(code);
      expect(examples).toHaveLength(2);
      expect(examples[0]).toBe('meterOccUsage(meter, today)');
      expect(examples[1]).toBe('meterOccUsage(read(elec and siteMeter), lastWeek)');
    });

    it('should extract AXON Command Line Test', () => {
      const code = `
/* AXON Command Line Test: admin_monRules(yesterday, 30, true) */
(dates, count) => do
  // function body
end
      `;
      
      const examples = parser.extractExamples(code);
      expect(examples).toContain('admin_monRules(yesterday, 30, true)');
    });
  });

  describe('parseEnhancedDocumentation', () => {
    it('should parse structured documentation', () => {
      const docComment = `/*
   Description: Calculate energy consumption
   Parameters:
     meter: The meter point to read
     dates: Date range for analysis
   Returns: Total consumption in kWh
   Author: John Doe
   Version: 2.0.0
   Site specific: yes
*/`;
      
      const result = parser.parseEnhancedDocumentation(docComment, '');
      
      expect(result.description).toBe('Calculate energy consumption');
      expect(result.parameters).toHaveLength(2);
      expect(result.parameters[0]).toEqual({
        name: 'meter',
        description: 'The meter point to read'
      });
      expect(result.author).toBe('John Doe');
      expect(result.version).toBe('2.0.0');
      expect(result.siteSpecific).toBe(true);
    });
  });
});