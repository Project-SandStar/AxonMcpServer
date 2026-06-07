import { AxonFunction } from '../types/index.js';
import * as path from 'path';

export interface RegexMatch {
  file: string;
  functionName?: string;
  sourceType?: 'code' | 'documentation';
  matches: Array<{
    line: number;
    context: string[];
    matchedLine: string;
  }>;
}

export class RegexSearcher {
  /**
   * Search for regex pattern across all functions
   */
  searchWithRegex(
    pattern: string, 
    functions: Map<string, AxonFunction>,
    contextLines: number = 2
  ): RegexMatch[] {
    const results = new Map<string, RegexMatch>();
    
    try {
      const regex = new RegExp(pattern, 'gm');
      
      for (const [id, func] of functions) {
        const lines = func.sourceCode.split('\n');
        const matches: Array<{ line: number; context: string[]; matchedLine: string }> = [];
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            const startLine = Math.max(0, index - contextLines);
            const endLine = Math.min(lines.length - 1, index + contextLines);
            const context = lines.slice(startLine, endLine + 1);
            
            matches.push({
              line: (func.lineNumber || 1) + index,
              context,
              matchedLine: line
            });
          }
          // Reset regex lastIndex for next line
          regex.lastIndex = 0;
        });
        
        if (matches.length > 0) {
          const filePath = func.filePath;
          const sourceType = func.tags?.includes('documentation') ? 'documentation' : 'code';
          const key = `${filePath}::${func.id}`;
          
          if (!results.has(key)) {
            results.set(key, {
              file: filePath,
              functionName: func.name,
              sourceType,
              matches: []
            });
          }
          results.get(key)!.matches.push(...matches);
        }
      }
    } catch (error) {
      console.error('Invalid regex pattern:', error);
      return [];
    }
    
    return Array.from(results.values());
  }
  
  /**
   * Format results in the requested style
   */
  formatResults(results: RegexMatch[], baseDir?: string): string {
    if (results.length === 0) {
      return 'No matches found.';
    }
    
    // Count total matches and separate by type
    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
    const codeResults = results.filter(r => r.sourceType === 'code');
    const docResults = results.filter(r => r.sourceType === 'documentation');
    
    const output: string[] = [
      `Found ${totalMatches} matches in ${results.length} functions`,
      `(${codeResults.length} from code, ${docResults.length} from documentation)\n`
    ];
    
    // Group by source type
    if (codeResults.length > 0) {
      output.push('=== CODE EXAMPLES ===\n');
      for (const result of codeResults) {
        const displayPath = baseDir 
          ? path.relative(baseDir, result.file)
          : result.file;
        
        output.push(`${displayPath} [${result.functionName || 'unknown'}]`);
        
        for (const match of result.matches) {
          output.push('│----');
          match.context.forEach(line => {
            output.push(`│  ${line}`);
          });
          output.push('│----');
          output.push('');
        }
      }
    }
    
    if (docResults.length > 0) {
      output.push('\n=== DOCUMENTATION EXAMPLES ===\n');
      for (const result of docResults) {
        const displayPath = baseDir 
          ? path.relative(baseDir, result.file)
          : result.file;
        
        output.push(`${displayPath} [${result.functionName || 'example'}]`);
        
        for (const match of result.matches) {
          output.push('│----');
          match.context.forEach(line => {
            output.push(`│  ${line}`);
          });
          output.push('│----');
          output.push('');
        }
      }
    }
    
    return output.join('\n');
  }
  
  /**
   * Format results as structured JSON for MCP
   */
  formatAsJson(results: RegexMatch[], baseDir?: string): any {
    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
    const codeResults = results.filter(r => r.sourceType === 'code');
    const docResults = results.filter(r => r.sourceType === 'documentation');
    
    return {
      totalMatches,
      summary: {
        totalFunctions: results.length,
        codeExamples: codeResults.length,
        documentationExamples: docResults.length
      },
      results: results.map(result => ({
        file: baseDir ? path.relative(baseDir, result.file) : result.file,
        functionName: result.functionName,
        sourceType: result.sourceType,
        matches: result.matches.map(match => ({
          line: match.line,
          matchedLine: match.matchedLine.trim(),
          context: match.context
        }))
      }))
    };
  }
}