import { AxonFunction, AxonCategory } from '../types/index.js';
import * as crypto from 'crypto';

export class AxonParser {
  /**
   * Parse Axon code and extract function definitions
   */
  parseFunctions(code: string, filePath: string): AxonFunction[] {
    const functions: AxonFunction[] = [];
    
    // Match regular function pattern with optional doc comment
    const functionPattern = /(\/*[\s\S]*?\*\/)?\s*\(([^)]*)\)\s*=>\s*do([\s\S]*?)end/gm;
    const functionMatches = code.matchAll(functionPattern);
    
    for (const match of functionMatches) {
      const docComment = match[1] || '';
      const parameters = match[2] || '';
      const functionBody = match[3] || '';
      const fullFunction = match[0];
      
      if (!fullFunction.trim()) continue;
      
      const func = this.parseFunction(fullFunction, docComment, filePath);
      if (func) functions.push(func);
    }
    
    // Also match defcomp pattern
    const defcompPattern = /(\/*[\s\S]*?\*\/)?\s*defcomp([\s\S]*?)(?:^end|\nend)/gm;
    const defcompMatches = code.matchAll(defcompPattern);
    
    for (const match of defcompMatches) {
      const docComment = match[1] || '';
      const defcompBody = match[2] || '';
      const fullDefcomp = match[0];
      
      if (!fullDefcomp.trim()) continue;
      
      const func = this.parseDefcomp(fullDefcomp, docComment, filePath);
      if (func) functions.push(func);
    }
    
    return functions;
  }

  /**
   * Parse a defcomp definition
   */
  private parseDefcomp(code: string, docComment: string, filePath: string): AxonFunction | null {
    // Extract function name from file path
    const fileName = filePath.split('/').pop()?.replace('.axon', '') || 'unknown';
    
    // Parse documentation
    const { description, tags } = this.parseDocumentation(docComment);
    
    // Extract slot names as "parameters"
    const slotPattern = /^\s*(\w+):\s*\{/gm;
    const parameters: string[] = [];
    let slotMatch;
    while ((slotMatch = slotPattern.exec(code)) !== null) {
      parameters.push(slotMatch[1]);
    }
    
    // Categorize the function
    const category = this.categorizeFunction(fileName, code, tags);
    
    // Generate unique ID
    const id = crypto.createHash('md5').update(filePath + fileName + 'defcomp').digest('hex');
    
    // Add defcomp tag
    tags.push('defcomp');
    
    // Detect rule type from markers
    if (code.includes('sparkRule')) {
      tags.push('sparkRule');
    }
    if (code.includes('kpiRule')) {
      tags.push('kpiRule');
    }
    if (code.includes('curRule')) {
      tags.push('curRule');
    }
    if (code.includes('watch')) {
      tags.push('watch');
    }
    
    return {
      id,
      name: fileName,
      filePath,
      parameters,
      description,
      documentation: docComment,
      sourceCode: code,
      category,
      tags: [...tags, fileName]
    };
  }

  /**
   * Parse a single function
   */
  private parseFunction(code: string, docComment: string, filePath: string): AxonFunction | null {
    // Extract function name from file path or documentation
    const fileName = filePath.split('/').pop()?.replace('.axon', '') || 'unknown';
    
    // Extract parameters
    const paramMatch = code.match(/^\s*\(([^)]*)\)\s*=>/);
    const parameters = paramMatch 
      ? paramMatch[1].split(',').map(p => p.trim()).filter(p => p)
      : [];
    
    // Parse documentation
    const { description, tags } = this.parseDocumentation(docComment);
    
    // Categorize the function
    const category = this.categorizeFunction(fileName, code, tags);
    
    // Generate unique ID
    const id = crypto.createHash('md5').update(filePath + fileName).digest('hex');
    
    return {
      id,
      name: fileName,
      filePath,
      parameters,
      description,
      documentation: docComment,
      sourceCode: code,
      category,
      tags: [...tags, fileName]
    };
  }

  /**
   * Parse documentation comment
   */
  private parseDocumentation(docComment: string): { description: string; tags: string[] } {
    const tags: string[] = [];
    let description = '';
    
    if (!docComment) return { description, tags };
    
    // Remove comment markers
    const cleaned = docComment
      .replace(/^\/\*+/, '')
      .replace(/\*+\/$/, '')
      .replace(/^\s*\*\s?/gm, '');
    
    const lines = cleaned.split('\n');
    const descLines: string[] = [];
    
    for (const line of lines) {
      // Look for tags like "Function:", "Description:", etc.
      if (line.includes(':')) {
        const [key, value] = line.split(':', 2);
        const keyLower = key.toLowerCase().trim();
        
        if (keyLower === 'description') {
          description = value.trim();
        } else if (keyLower === 'function' || keyLower === 'author' || keyLower === 'library') {
          tags.push(value.trim().toLowerCase());
        }
      } else if (!description) {
        descLines.push(line);
      }
    }
    
    if (!description && descLines.length > 0) {
      description = descLines.join(' ').trim();
    }
    
    return { description, tags };
  }

  /**
   * Categorize function based on name and content
   */
  protected categorizeFunction(name: string, code: string, tags: string[]): AxonCategory {
    const lowerName = name.toLowerCase();
    const lowerCode = code.toLowerCase();
    const allText = lowerName + ' ' + lowerCode + ' ' + tags.join(' ');
    
    // Check for specific categories
    if (allText.includes('hvac') || allText.includes('ahu') || allText.includes('vav') || 
        allText.includes('cooling') || allText.includes('heating') || allText.includes('airside')) {
      return AxonCategory.HVAC;
    }
    
    if (allText.includes('energy') || allText.includes('kwh') || allText.includes('kw') || 
        allText.includes('consumption') || allText.includes('demand')) {
      return AxonCategory.ENERGY;
    }
    
    if (allText.includes('meter') || allText.includes('metering')) {
      return AxonCategory.METER;
    }
    
    if (allText.includes('spark') || allText.includes('fault') || allText.includes('alarm')) {
      return AxonCategory.SPARK_ANALYSIS;
    }
    
    if (allText.includes('report') || allText.includes('email') || allText.includes('summary')) {
      return AxonCategory.REPORTING;
    }
    
    if (allText.includes('admin') || allText.includes('job') || allText.includes('monitor')) {
      return AxonCategory.ADMIN;
    }
    
    if (allText.includes('sensor') || allText.includes('temp') || allText.includes('pressure')) {
      return AxonCategory.SENSOR;
    }
    
    if (allText.includes('control') || allText.includes('setpoint') || allText.includes('cmd')) {
      return AxonCategory.CONTROL;
    }
    
    if (allText.includes('his') || allText.includes('data') || allText.includes('analysis')) {
      return AxonCategory.DATA_ANALYSIS;
    }
    
    if (allText.includes('util') || allText.includes('helper') || allText.includes('tool')) {
      return AxonCategory.UTILITIES;
    }
    
    return AxonCategory.UNCATEGORIZED;
  }

  /**
   * Extract inline examples from code
   */
  extractExamples(code: string): string[] {
    const examples: string[] = [];
    
    // Look for example patterns in comments
    const examplePattern = /\/\/\s*(?:example|usage|test):\s*(.+)/gi;
    let match;
    
    while ((match = examplePattern.exec(code)) !== null) {
      examples.push(match[1].trim());
    }
    
    // Look for AXON Command Line Test
    const testPattern = /AXON Command Line Test:\s*([^\*]+)/i;
    const testMatch = code.match(testPattern);
    if (testMatch) {
      examples.push(testMatch[1].trim());
    }
    
    return examples;
  }

  /**
   * Enhanced documentation parsing
   */
  parseEnhancedDocumentation(docComment: string, code: string): {
    description: string;
    tags: string[];
    parameters: Array<{name: string; type?: string; description?: string}>;
    returns?: string;
    author?: string;
    version?: string;
    siteSpecific?: boolean;
  } {
    const result = {
      description: '',
      tags: [] as string[],
      parameters: [] as Array<{name: string; type?: string; description?: string}>,
      returns: undefined as string | undefined,
      author: undefined as string | undefined,
      version: undefined as string | undefined,
      siteSpecific: false
    };

    if (!docComment) return result;

    // Clean comment markers
    const cleaned = docComment
      .replace(/^\/\*+/, '')
      .replace(/\*+\/$/, '')
      .replace(/^\s*\*\s?/gm, '')
      .trim();

    const lines = cleaned.split('\n');
    let inParametersSection = false;
    const descLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Handle parameter section
      if (trimmed.toLowerCase().includes('parameters:')) {
        inParametersSection = true;
        continue;
      }
      
      // Parse parameters
      if (inParametersSection && trimmed.includes(':')) {
        const [paramName, paramDesc] = trimmed.split(':', 2);
        if (paramName && !paramName.toLowerCase().includes('return')) {
          result.parameters.push({
            name: paramName.trim(),
            description: paramDesc.trim()
          });
          continue;
        }
      }
      
      // End parameter section
      if (inParametersSection && (trimmed === '' || !trimmed.includes(':'))) {
        inParametersSection = false;
      }
      
      // Parse other fields
      if (trimmed.includes(':')) {
        const [key, value] = trimmed.split(':', 2);
        const keyLower = key.toLowerCase().trim();
        const val = value.trim();
        
        switch (keyLower) {
          case 'description':
            result.description = val;
            break;
          case 'function':
            result.tags.push(val.toLowerCase());
            break;
          case 'author':
            result.author = val;
            result.tags.push(val.toLowerCase());
            break;
          case 'version':
            result.version = val;
            break;
          case 'returns':
          case 'return':
            result.returns = val;
            break;
          case 'site specific':
            result.siteSpecific = val.toLowerCase() === 'yes';
            break;
        }
      } else if (!result.description && !inParametersSection) {
        descLines.push(trimmed);
      }
    }
    
    if (!result.description && descLines.length > 0) {
      result.description = descLines.filter(line => line).join(' ').trim();
    }
    
    return result;
  }
}