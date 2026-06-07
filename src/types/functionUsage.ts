/**
 * Types for function usage tracking in Axon code
 */

export interface FunctionUsage {
  functionName: string;
  file: string;
  line: number;
  column: number;
  context: string;
  arguments: string[];
  callingFunction?: string;
  isMethodCall: boolean;
  receiver?: string; // For method calls like grid.hisRead()
  surroundingLines?: string[];
  functionType: 'builtin' | 'user-defined' | 'unknown';
}

export interface FunctionUsageIndex {
  // Function name -> usage locations
  usages: Map<string, FunctionUsage[]>;
  
  // Function name -> functions that call it
  calledBy: Map<string, Set<string>>;
  
  // Function name -> functions it calls
  calls: Map<string, Set<string>>;
  
  // Statistics
  stats: FunctionUsageStats;
  
  // Last indexed timestamp
  lastIndexed: Date;
}

export interface FunctionUsageStats {
  totalFunctions: number;
  totalUsages: number;
  unusedFunctions: string[];
  mostUsedFunctions: Array<{name: string; count: number}>;
  builtinFunctions: Set<string>;
  userDefinedFunctions: Set<string>;
}

export interface UsageSearchOptions {
  functionName: string;
  includeContext?: boolean;
  limit?: number;
  filePattern?: string;
  sortBy?: 'file' | 'line' | 'usage';
}

export interface CallGraphOptions {
  functionName: string;
  depth?: number;
  includeBuiltins?: boolean;
}

export interface FunctionExample {
  file: string;
  line: number;
  code: string;
  description?: string;
  complexity: 'simple' | 'medium' | 'complex';
}

// Built-in SkySpark functions (partial list - to be expanded)
export const BUILTIN_FUNCTIONS = new Set([
  // Database operations
  'read', 'readAll', 'readById', 'readByIds', 'readCount',
  'commit', 'diff', 'add', 'update', 'remove',
  
  // History operations
  'hisRead', 'hisWrite', 'hisClear', 'hisRollup', 'hisInterpolate',
  
  // Grid operations
  'toGrid', 'gridColNames', 'gridRowCount', 'gridGet',
  
  // Point/Equip/Site operations
  'point', 'points', 'equip', 'equips', 'site', 'sites',
  'pointWrite', 'pointWriteArray', 'pointEmergencyWrite',
  
  // Utility functions
  'now', 'today', 'yesterday', 'dateTime', 'date', 'time',
  'toStr', 'toNumber', 'toBool', 'toUnit',
  
  // Collection operations
  'map', 'filter', 'find', 'findAll', 'each', 'reduce', 'fold',
  'sort', 'sortr', 'unique', 'flatten', 'join',
  
  // Math operations
  'min', 'max', 'avg', 'sum', 'abs', 'round', 'floor', 'ceil',
  
  // String operations
  'contains', 'startsWith', 'endsWith', 'split', 'trim', 'replace',
  
  // Logic operations
  'and', 'or', 'not', 'if', 'do', 'end',
  
  // Type checking
  'isDict', 'isGrid', 'isList', 'isNumber', 'isStr', 'isBool',
  'isDate', 'isTime', 'isDateTime', 'isRef', 'isUri',
  
  // I/O operations
  'ioReadCsv', 'ioReadZinc', 'ioWriteCsv', 'ioWriteZinc',
  
  // Spark operations
  'sparkWrite', 'sparkRead', 'sparkHisRead',
  
  // Project operations
  'proj', 'projName', 'projMeta',
  
  // Other common functions
  'echo', 'log', 'logInfo', 'logWarn', 'logErr',
  'throw', 'try', 'catch', 'finally',
  'marker', 'na', 'null', 'removeMarker'
]);