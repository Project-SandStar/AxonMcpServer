import { AxonFunction, AxonCategory } from '../types/index.js';
import * as crypto from 'crypto';

export interface AxonUsageExample {
  expression: string;
  output?: string;
  comment?: string;
  section: string;
  lineInSection: number;
}

export class AxonUsageScanner {
  /**
   * Extract examples from AxonUsage.html with special handling
   */
  extractAxonUsageExamples(htmlContent: string, filePath: string): AxonFunction[] {
    const functions: AxonFunction[] = [];
    
    // Extract sections and their examples
    const sections = this.extractSections(htmlContent);
    
    for (const [sectionName, sectionContent] of sections) {
      const examples = this.extractExamplesFromSection(sectionContent, sectionName);
      
      examples.forEach((example, index) => {
        const func = this.createFunctionFromExample(example, sectionName, index, filePath);
        functions.push(func);
      });
    }
    
    return functions;
  }
  
  /**
   * Extract sections from the HTML content
   */
  private extractSections(htmlContent: string): Map<string, string> {
    const sections = new Map<string, string>();
    
    // Pattern to match section headers and their content
    const sectionPattern = /<h2[^>]*id=['"]([^'"]+)['"][^>]*>([^<]+)<\/h2>([\s\S]*?)(?=<h2|<\/div>|$)/gi;
    
    let match;
    while ((match = sectionPattern.exec(htmlContent)) !== null) {
      const sectionId = match[1];
      const sectionTitle = match[2].trim();
      const sectionContent = match[3];
      
      // Map section IDs to friendly names
      const sectionName = this.getSectionName(sectionId, sectionTitle);
      sections.set(sectionName, sectionContent);
    }
    
    return sections;
  }
  
  /**
   * Get a friendly section name from ID and title
   */
  private getSectionName(id: string, title: string): string {
    // Clean up the title to get a friendly name
    const cleanTitle = title.replace(/Examples?$/i, '').trim();
    
    const sectionMap: Record<string, string> = {
      'str': 'String',
      'dateTime': 'DateTime',
      'spans': 'DateSpan',
      'uri': 'Uri',
      'list': 'List',
      'dict': 'Dict',
      'grid': 'Grid',
      'regex': 'Regex',
      'read': 'Read',
      'his': 'History',
      'def': 'Definition',
      'pivot': 'Pivot',
      'energy': 'Energy'
    };
    
    return sectionMap[id] || cleanTitle || id;
  }
  
  /**
   * Extract examples from a section
   */
  private extractExamplesFromSection(sectionContent: string, sectionName: string): AxonUsageExample[] {
    const examples: AxonUsageExample[] = [];
    
    // Pattern to match <pre> blocks
    const prePattern = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let preMatch;
    
    while ((preMatch = prePattern.exec(sectionContent)) !== null) {
      const preContent = preMatch[1];
      
      // Clean HTML entities
      const cleanedContent = this.cleanHtmlEntities(preContent);
      
      // Extract individual examples from the pre block
      const blockExamples = this.parseExampleBlock(cleanedContent, sectionName);
      examples.push(...blockExamples);
    }
    
    return examples;
  }
  
  /**
   * Parse a block of examples, handling various formats
   */
  private parseExampleBlock(blockContent: string, sectionName: string): AxonUsageExample[] {
    const examples: AxonUsageExample[] = [];
    const lines = blockContent.split('\n').filter(line => line.trim());
    
    let currentExample: Partial<AxonUsageExample> | null = null;
    let lineInSection = 0;
    
    for (const line of lines) {
      lineInSection++;
      
      // Skip pure comment lines or section headers within pre blocks
      if (line.trim().startsWith('//') && !line.includes('>>')) {
        continue;
      }
      
      // Check if this line contains an example with output (>>)
      const outputMatch = line.match(/^(.*?)\s*>>\s*(.*)$/);
      
      if (outputMatch) {
        // This is a complete example with output
        const expression = outputMatch[1].trim();
        const output = outputMatch[2].trim();
        
        // Check for inline comment
        const commentMatch = output.match(/^(.*?)\s*\/\/\s*(.*)$/);
        let actualOutput = output;
        let comment = undefined;
        
        if (commentMatch) {
          actualOutput = commentMatch[1].trim();
          comment = commentMatch[2].trim();
        }
        
        examples.push({
          expression,
          output: actualOutput,
          comment,
          section: sectionName,
          lineInSection
        });
      } else if (line.trim()) {
        // This might be a multi-line example or standalone code
        examples.push({
          expression: line.trim(),
          output: undefined,
          comment: undefined,
          section: sectionName,
          lineInSection
        });
      }
    }
    
    return examples;
  }
  
  /**
   * Clean HTML entities
   */
  private cleanHtmlEntities(content: string): string {
    return content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]+>/g, ''); // Remove any remaining HTML tags
  }
  
  /**
   * Create an AxonFunction from an example
   */
  private createFunctionFromExample(
    example: AxonUsageExample, 
    sectionName: string, 
    index: number,
    filePath: string
  ): AxonFunction {
    // Generate a unique ID
    const id = crypto.createHash('md5')
      .update(`${filePath}-${sectionName}-${index}-${example.expression}`)
      .digest('hex');
    
    // Create a descriptive name
    const name = `${sectionName}_Example_${index + 1}`;
    
    // Build description
    let description = `${sectionName} example from AxonUsage guide`;
    if (example.comment) {
      description += `: ${example.comment}`;
    }
    
    // Determine category based on section
    const category = this.getCategoryFromSection(sectionName);
    
    // Build tags
    const tags = [
      'documentation',
      'example',
      'axon-usage-guide',
      sectionName.toLowerCase().replace(/\s+/g, '-')
    ];
    
    if (example.output !== undefined) {
      tags.push('has-output');
    }
    
    if (example.comment) {
      tags.push('has-comment');
    }
    
    // Detect operators in the expression
    const operators = this.detectOperators(example.expression);
    operators.forEach(op => tags.push(`uses-${op}`));
    
    // Build the source code with preserved format
    let sourceCode = example.expression;
    if (example.output !== undefined) {
      sourceCode += ` >> ${example.output}`;
      if (example.comment) {
        sourceCode += ` // ${example.comment}`;
      }
    }
    
    return {
      id,
      name,
      filePath,
      sourceCode,
      category,
      tags,
      description,
      lineNumber: example.lineInSection,
      // Store the example data as documentation
      documentation: JSON.stringify({
        expression: example.expression,
        output: example.output,
        comment: example.comment,
        section: sectionName
      })
    };
  }
  
  /**
   * Map section names to categories
   */
  private getCategoryFromSection(sectionName: string): AxonCategory {
    const categoryMap: Record<string, AxonCategory> = {
      'String': AxonCategory.UTILITIES,
      'DateTime': AxonCategory.UTILITIES,
      'DateSpan': AxonCategory.UTILITIES,
      'Uri': AxonCategory.UTILITIES,
      'List': AxonCategory.DATA_ANALYSIS,
      'Dict': AxonCategory.DATA_ANALYSIS,
      'Grid': AxonCategory.DATA_ANALYSIS,
      'Regex': AxonCategory.UTILITIES,
      'Read': AxonCategory.DATA_ANALYSIS,
      'History': AxonCategory.DATA_ANALYSIS,
      'Definition': AxonCategory.DATA_ANALYSIS,
      'Pivot': AxonCategory.DATA_ANALYSIS,
      'Energy': AxonCategory.ENERGY
    };
    
    return categoryMap[sectionName] || AxonCategory.UNCATEGORIZED;
  }
  
  /**
   * Detect operators in an expression
   */
  private detectOperators(expression: string): string[] {
    const operators = [
      '==', '!=', '>=', '<=', '>', '<',
      '&&', '||', '!',
      '+', '-', '*', '/', '%',
      '=>', '->', '?->', '..',
      '&', '|', '^', '~', '<<', '>>'
    ];
    
    const found: string[] = [];
    
    for (const op of operators) {
      if (expression.includes(op)) {
        found.push(op);
      }
    }
    
    return found;
  }
}