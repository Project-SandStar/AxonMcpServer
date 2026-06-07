import {
  HVal,
  HStr,
  HNum,
  HRef,
  HBool,
  HDate,
  HTime,
  HDateTime,
  HUri,
  HMarker,
  HDict,
  HList,
  MARKER
} from 'haystack-core';

export interface TemplateParameter {
  name: string;
  type: 'str' | 'num' | 'ref' | 'bool' | 'date' | 'time' | 'dateTime' | 'uri' | 'marker' | 'dict' | 'list' | 'filter';
  description: string;
  required?: boolean;
  default?: any;
  validation?: ParameterValidation;
  examples?: string[];
}

export interface ParameterValidation {
  pattern?: string;  // Regex pattern for string validation
  min?: number;      // Min value for numbers
  max?: number;      // Max value for numbers
  enum?: string[];   // Allowed values
  unit?: string;     // Expected unit for numbers
}

export interface AxonTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: TemplateParameter[];
  template: string;
  validation?: string[];  // Axon expressions to validate the generated code
  examples?: TemplateExample[];
  tags?: string[];
}

export interface TemplateExample {
  name: string;
  params: Record<string, any>;
  expected?: string;
}

export interface GenerationResult {
  code: string;
  warnings?: string[];
  alternatives?: AlternativeCode[];
}

export interface AlternativeCode {
  reason: string;
  code: string;
}

export class TypedAxonGenerator {
  /**
   * Generate Axon code from a template with typed parameters
   */
  generate(template: AxonTemplate, params: Record<string, any>): GenerationResult {
    // Validate all required parameters are provided
    const missingParams = this.validateRequiredParams(template, params);
    if (missingParams.length > 0) {
      throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
    }

    // Convert parameters to Haystack values
    const typedParams = this.convertParameters(template, params);
    
    // Process the template
    let code = template.template;
    const warnings: string[] = [];
    
    // Replace template variables
    for (const [paramName, hval] of Object.entries(typedParams)) {
      const placeholder = `{{${paramName}}}`;
      const replacement = this.formatHVal(hval, template.parameters.find(p => p.name === paramName)!);
      code = code.replace(new RegExp(placeholder, 'g'), replacement);
    }
    
    // Check for any unreplaced placeholders
    const unreplaced = code.match(/\{\{[^}]+\}\}/g);
    if (unreplaced) {
      warnings.push(`Unreplaced placeholders found: ${unreplaced.join(', ')}`);
    }
    
    // Generate alternatives if applicable
    const alternatives = this.generateAlternatives(template, typedParams);
    
    return {
      code: code.trim(),
      warnings: warnings.length > 0 ? warnings : undefined,
      alternatives: alternatives.length > 0 ? alternatives : undefined
    };
  }
  
  /**
   * Validate that all required parameters are provided
   */
  private validateRequiredParams(template: AxonTemplate, params: Record<string, any>): string[] {
    const missing: string[] = [];
    
    for (const param of template.parameters) {
      if (param.required !== false && !(param.name in params) && !param.default) {
        missing.push(param.name);
      }
    }
    
    return missing;
  }
  
  /**
   * Convert raw parameter values to Haystack typed values
   */
  private convertParameters(template: AxonTemplate, params: Record<string, any>): Record<string, HVal> {
    const result: Record<string, HVal> = {};
    
    for (const paramDef of template.parameters) {
      const rawValue = params[paramDef.name] ?? paramDef.default;
      if (rawValue === undefined) continue;
      
      // Validate parameter if rules are defined
      if (paramDef.validation) {
        this.validateParameter(paramDef, rawValue);
      }
      
      // Convert to HVal based on type
      result[paramDef.name] = this.convertToHVal(paramDef.type, rawValue);
    }
    
    return result;
  }
  
  /**
   * Validate a parameter value against its validation rules
   */
  private validateParameter(param: TemplateParameter, value: any): void {
    const validation = param.validation!;
    
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new Error(`Parameter ${param.name} does not match pattern ${validation.pattern}`);
      }
    }
    
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new Error(`Parameter ${param.name} must be >= ${validation.min}`);
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new Error(`Parameter ${param.name} must be <= ${validation.max}`);
      }
    }
    
    if (validation.enum && !validation.enum.includes(String(value))) {
      throw new Error(`Parameter ${param.name} must be one of: ${validation.enum.join(', ')}`);
    }
  }
  
  /**
   * Convert a raw value to appropriate Haystack type
   */
  private convertToHVal(type: string, value: any): HVal {
    switch (type) {
      case 'str':
        return HStr.make(String(value));
        
      case 'num':
        if (typeof value === 'string') {
          // Parse number with optional unit
          const match = value.match(/^([-+]?[0-9]*\.?[0-9]+)\s*(.*)$/);
          if (match) {
            const num = parseFloat(match[1]);
            const unit = match[2] || undefined;
            return HNum.make(num, unit);
          }
        }
        return HNum.make(Number(value));
        
      case 'ref':
        return HRef.make(String(value));
        
      case 'bool':
        return HBool.make(Boolean(value));
        
      case 'date':
        if (value instanceof Date) {
          return HDate.make(value);
        }
        return HDate.make(new Date(value));
        
      case 'time':
        if (value instanceof Date) {
          return HTime.make(value);
        }
        return HTime.make(new Date(value));
        
      case 'dateTime':
        if (value instanceof Date) {
          return HDateTime.make(value);
        }
        return HDateTime.make(new Date(value));
        
      case 'uri':
        return HUri.make(String(value));
        
      case 'marker':
        return MARKER;
        
      case 'filter':
        // For filters, just return as string (will be used directly in Axon)
        return HStr.make(String(value));
        
      default:
        throw new Error(`Unsupported parameter type: ${type}`);
    }
  }
  
  /**
   * Format an HVal for use in Axon code
   */
  private formatHVal(hval: HVal, param: TemplateParameter): string {
    // Special handling for filter type - don't quote
    if (param.type === 'filter') {
      return hval.toString();
    }
    
    // For other types, use toZinc() for proper Axon syntax
    return hval.toZinc();
  }
  
  /**
   * Generate alternative code suggestions based on template and parameters
   */
  private generateAlternatives(template: AxonTemplate, params: Record<string, HVal>): AlternativeCode[] {
    const alternatives: AlternativeCode[] = [];
    
    // Example: Suggest using hisRead for historical data if date range is provided
    if (template.category === 'data' && ('startDate' in params || 'dateRange' in params)) {
      const baseCode = template.template;
      if (baseCode.includes('readAll') && !baseCode.includes('hisRead')) {
        alternatives.push({
          reason: 'Consider using hisRead() for historical data queries',
          code: this.generateHistoricalVariant(template, params)
        });
      }
    }
    
    // Example: Suggest adding limit for large queries
    if (template.template.includes('readAll') && !template.template.includes('.limit(')) {
      alternatives.push({
        reason: 'Consider adding a limit to prevent large result sets',
        code: template.template.replace('readAll(', 'readAll(') + '.limit(1000)'
      });
    }
    
    return alternatives;
  }
  
  /**
   * Generate a historical data variant of a template
   */
  private generateHistoricalVariant(template: AxonTemplate, params: Record<string, HVal>): string {
    // This is a simplified example - real implementation would be more sophisticated
    let code = template.template;
    
    // Replace readAll with hisRead pattern
    code = code.replace(/readAll\(([^)]+)\)/, 'readAll($1).hisRead(yesterday)');
    
    return code;
  }
  
  /**
   * Suggest parameters based on partial input or intent
   */
  suggestParameters(template: AxonTemplate, partialParams?: Record<string, any>): Record<string, any> {
    const suggestions: Record<string, any> = {};
    
    for (const param of template.parameters) {
      if (partialParams && param.name in partialParams) {
        continue; // Skip if already provided
      }
      
      // Suggest based on parameter type and validation rules
      if (param.examples && param.examples.length > 0) {
        suggestions[param.name] = param.examples[0];
      } else if (param.default !== undefined) {
        suggestions[param.name] = param.default;
      } else if (param.validation?.enum) {
        suggestions[param.name] = param.validation.enum[0];
      } else {
        // Provide type-appropriate defaults
        switch (param.type) {
          case 'str':
            suggestions[param.name] = 'example';
            break;
          case 'num':
            suggestions[param.name] = param.validation?.min ?? 0;
            break;
          case 'bool':
            suggestions[param.name] = true;
            break;
          case 'filter':
            suggestions[param.name] = 'site';
            break;
          case 'ref':
            suggestions[param.name] = '@someId';
            break;
          case 'date':
            suggestions[param.name] = 'today()';
            break;
          case 'dateTime':
            suggestions[param.name] = 'now()';
            break;
        }
      }
    }
    
    return suggestions;
  }
  
  /**
   * Extract parameter values from natural language intent
   */
  extractParametersFromIntent(template: AxonTemplate, intent: string): Record<string, any> {
    const params: Record<string, any> = {};
    const lowerIntent = intent.toLowerCase();
    
    for (const param of template.parameters) {
      // Look for parameter mentions in the intent
      const paramWords = param.name.split(/(?=[A-Z])/).join(' ').toLowerCase();
      
      // Try to extract values based on parameter type
      if (param.type === 'filter') {
        // Look for entity types
        const entities = ['site', 'equip', 'point', 'sensor', 'meter', 'ahu', 'vav'];
        for (const entity of entities) {
          if (lowerIntent.includes(entity)) {
            params[param.name] = entity;
            break;
          }
        }
      } else if (param.type === 'num') {
        // Look for numbers
        const numMatch = intent.match(/\b(\d+(?:\.\d+)?)\s*(\w+)?\b/);
        if (numMatch && lowerIntent.includes(paramWords)) {
          params[param.name] = numMatch[2] ? `${numMatch[1]}${numMatch[2]}` : parseFloat(numMatch[1]);
        }
      } else if (param.type === 'bool') {
        // Look for boolean indicators
        if (lowerIntent.includes('not') || lowerIntent.includes('exclude') || lowerIntent.includes('false')) {
          params[param.name] = false;
        } else if (lowerIntent.includes('include') || lowerIntent.includes('with') || lowerIntent.includes('true')) {
          params[param.name] = true;
        }
      }
    }
    
    return params;
  }
}