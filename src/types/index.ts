export interface AxonFunction {
  id: string;
  name: string;
  filePath: string;
  parameters?: string[];
  returnType?: string;
  description?: string;
  documentation?: string;
  sourceCode: string;
  category: AxonCategory;
  tags: string[];
  examples?: string[];
  lineNumber?: number;
}

export enum AxonCategory {
  HVAC = 'hvac',
  ENERGY = 'energy',
  DATA_ANALYSIS = 'data_analysis',
  REPORTING = 'reporting',
  UTILITIES = 'utilities',
  ADMIN = 'admin',
  SPARK_ANALYSIS = 'spark_analysis',
  METER = 'meter',
  CONTROL = 'control',
  SENSOR = 'sensor',
  UNCATEGORIZED = 'uncategorized'
}

export interface AxonCodeIndex {
  functions: Map<string, AxonFunction>;
  categories: Map<AxonCategory, string[]>; // category -> function IDs
  tags: Map<string, string[]>; // tag -> function IDs
  lastUpdated: Date;
}

export interface SearchOptions {
  category?: AxonCategory;
  tags?: string[];
  keyword?: string;
  limit?: number;
}

export interface AxonPattern {
  id: string;
  name: string;
  description: string;
  code: string;
  useCases: string[];
  relatedFunctions: string[];
}

// Re-export documentation types
export * from './documentation.js';
