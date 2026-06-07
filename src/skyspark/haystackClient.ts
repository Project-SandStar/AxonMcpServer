import {
  HDict,
  HGrid,
  HVal,
  HStr,
  HNum,
  HRef,
  HMarker,
  HBool,
  HFilter,
  zinc,
  valueToZinc
} from 'haystack-core';
import { SkySparkConfigManager, ActiveConfig } from '../config/skysparkConfig.js';
import { HaystackAuthClient } from './haystackAuth.js';

export interface SkySparkConfig {
  host: string;
  port: number;
  project: string;
  username: string;
  password: string;
  protocol?: 'http' | 'https';
  format?: 'zinc';
}

export class HaystackSkySparkClient {
  private authClient!: HaystackAuthClient;
  private baseUrl!: string;
  private project!: string;
  private configManager?: SkySparkConfigManager;
  private activeConfig: ActiveConfig | SkySparkConfig;

  // Each client tracks its own active instance/project - NOT shared with ConfigManager
  private currentInstance: string = '';
  private currentProject: string = '';

  constructor(config: SkySparkConfig | SkySparkConfigManager) {
    if (config instanceof SkySparkConfigManager) {
      this.configManager = config;
      // Get initial config but store it locally - don't rely on ConfigManager's mutable state
      this.activeConfig = config.getActiveConfig();
      const ac = this.activeConfig as ActiveConfig;
      this.currentInstance = ac.instance?.name || '';
      this.currentProject = ac.project?.name || '';
      this.createApiClient();
    } else {
      this.activeConfig = config;
      this.baseUrl = `${config.protocol || 'http'}://${config.host}:${config.port}`;
      this.project = config.project;
      this.currentProject = config.project;

      this.authClient = new HaystackAuthClient(
        {
          baseUrl: this.baseUrl,
          username: config.username,
          password: config.password,
          authPath: `/api/${config.project}/about`
        },
        {
          projectName: config.project
        }
      );
    }
  }
  
  private createApiClient() {
    if (!this.configManager) return;

    // Use the locally stored activeConfig, NOT configManager.getActiveConfig()
    // This ensures each client instance maintains its own state
    const config = this.activeConfig as ActiveConfig;
    const { instance, project } = config;
    const newBaseUrl = `${instance.protocol}://${instance.host}:${instance.port}`;
    const newProject = project.name;

    const username = project.username || instance.username || 'su';
    const password = project.password || instance.password || 'su';

    this.baseUrl = newBaseUrl;
    this.project = newProject;

    // Always create a new auth client when switching projects
    // because the authPath includes the project name
    this.authClient = new HaystackAuthClient(
      {
        baseUrl: this.baseUrl,
        username,
        password,
        authPath: `/api/${project.name}/about`
      },
      {
        instanceName: instance.name,
        projectName: project.name
      }
    );
  }
  
  /**
   * Switch to a different instance/project (only works with ConfigManager)
   * Each client tracks its own state - does NOT affect other clients sharing the same ConfigManager
   */
  switchTo(instanceName: string, projectName: string) {
    if (!this.configManager) {
      throw new Error('Cannot switch instances without ConfigManager');
    }

    // Get the config for the target instance/project WITHOUT changing ConfigManager's global state.
    // Case-insensitive lookup with a "did you mean" hint on miss.
    let instance = this.configManager.getInstance(instanceName);
    let resolvedInstanceName = instanceName;
    if (!instance) {
      const all = (this.configManager.getInstances?.() || []) as Array<{ name: string }>;
      const match = all.find(i => i.name.toLowerCase() === instanceName.toLowerCase());
      if (match) {
        const found = this.configManager.getInstance(match.name);
        if (found) {
          instance = found;
          resolvedInstanceName = match.name;
        }
      }
      if (!instance) {
        const names = all.map(i => i.name);
        const suggestion = names.find(n => n.toLowerCase().includes(instanceName.toLowerCase()))
          || names.find(n => instanceName.toLowerCase().includes(n.toLowerCase()));
        const hint = suggestion ? ` Did you mean "${suggestion}"?` : (names.length ? ` Available: ${names.join(', ')}.` : '');
        throw new Error(`Instance not found: ${instanceName}.${hint}`);
      }
    }

    const project = (instance.projects || []).find(p => p.name.toLowerCase() === projectName.toLowerCase());
    if (!project) {
      const projNames = (instance.projects || []).map(p => p.name);
      const projHint = projNames.length ? ` Available in ${resolvedInstanceName}: ${projNames.join(', ')}.` : '';
      throw new Error(`Project not found: ${projectName} in instance ${resolvedInstanceName}.${projHint}`);
    }
    const resolvedProjectName = project.name;

    // Update THIS client's local state only
    this.currentInstance = resolvedInstanceName;
    this.currentProject = resolvedProjectName;
    this.activeConfig = { instance, project, format: 'zinc' };
    this.createApiClient();
  }
  
  /**
   * Get current configuration info - uses THIS client's local state, not shared ConfigManager state
   */
  getCurrentConfig(): { instance?: string; project: string; url: string } {
    if (this.configManager) {
      // Use local state, not ConfigManager's global state
      return {
        instance: this.currentInstance,
        project: this.currentProject,
        url: `${this.baseUrl}/api/${this.currentProject}`
      };
    } else {
      const config = this.activeConfig as SkySparkConfig;
      return {
        project: config.project,
        url: `${this.baseUrl}/api/${this.project}`
      };
    }
  }

  /**
   * Validate that the active project matches the expected project.
   * Use this before executing code to prevent accidental cross-project execution.
   */
  validateProjectContext(expectedProject: string): boolean {
    return this.project === expectedProject;
  }

  /**
   * Get the current active project name
   */
  getActiveProject(): string {
    return this.project;
  }

  /**
   * Evaluate Axon code with optional project validation.
   * Throws an error if expectedProject is specified and doesn't match the active project.
   */
  async evalAxonSafe(code: string, expectedProject?: string): Promise<HVal> {
    if (expectedProject && !this.validateProjectContext(expectedProject)) {
      throw new Error(
        `Project mismatch: expected "${expectedProject}" but active project is "${this.project}". ` +
        `Use switchTo() or setPrimaryProject to change the active project.`
      );
    }
    return this.evalAxon(code);
  }

  /**
   * Evaluate Axon code and return typed Haystack value
   */
  async evalAxon(code: string): Promise<HVal> {
    try {
      // Call the SkySpark evalAll op with Axon code
      // evalAll expects a grid with an 'expr' column containing the Axon expression
      const grid = HGrid.make({
        rows: [{ expr: code }]
      });

      // Use AbortController for timeout (30s default)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let response: Response;
      try {
        response = await this.authClient.fetch(`/api/${this.project}/evalAll`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/zinc',
            'Accept': 'text/zinc'
          },
          body: valueToZinc(grid),
          signal: controller.signal
        });
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds');
        }
        throw new Error(`Network error: ${err.message}`);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Eval failed: ${response.status} ${errorText}`);
      }

      // Check Content-Length before reading body to prevent V8 crash on massive responses
      const MAX_RESPONSE_SIZE = 50 * 1024 * 1024; // 50MB limit
      const contentLength = response.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large (${(parseInt(contentLength, 10) / 1024 / 1024).toFixed(1)}MB) - limit is 50MB`);
      }

      const zincText = await response.text();

      // Double-check actual size after reading (Content-Length may be missing or wrong)
      if (zincText.length > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large (${(zincText.length / 1024 / 1024).toFixed(1)}MB) - limit is 50MB`);
      }

      // Validate response is Zinc format before parsing
      // Zinc grids start with 'ver:' - if not, it's likely an HTML error page
      if (!zincText.startsWith('ver:')) {
        // Check if it's an HTML page (common network error)
        if (zincText.includes('<!DOCTYPE') || zincText.includes('<html') || zincText.includes('<HTML')) {
          throw new Error('Received HTML instead of Zinc - check network/VPN connection');
        }
        // Limit error message to first 200 chars to avoid logging massive responses
        const preview = zincText.substring(0, 200);
        throw new Error(`Invalid Zinc response (expected 'ver:'): ${preview}...`);
      }

      const result = zinc(zincText);

      if (!result) {
        throw new Error('Failed to parse Zinc response');
      }

      // Check for SkySpark errors in the result
      if (result instanceof HGrid) {
        // Check if the grid contains error information
        const meta = result.meta;
        if (meta && meta.get('errType')) {
          const errorType = meta.get('errType');
          const errorTrace = meta.get('errTrace');
          const errorDis = meta.get('dis');

          // Extract the main error message - convert HVal to string
          const errorMessage = String(errorDis || errorTrace || `SkySpark error: ${errorType}`);
          throw new Error(errorMessage);
        }

        // evalAll returns a grid with a 'val' column containing the result
        if (result.length === 1) {
          const row = result.get(0);
          if (row) {
            const val = row.get('val');
            if (val) {
              return val;
            }
          }
        }
      }

      // If not in expected format, return the grid itself
      return result;
    } catch (error: any) {
      // Enhanced error logging with full details
      const errorDetails = {
        message: error.message || 'Unknown error',
        code: error.code,
        cause: error.cause?.toString(),
        type: error.constructor.name,
        baseUrl: this.baseUrl,
        project: this.project,
        url: `${this.baseUrl}/api/${this.project}/evalAll`
      };

      console.error('❌ evalAxon failed with details:', JSON.stringify(errorDetails, null, 2));

      // Rethrow with enhanced error message
      const enhancedMessage = `${error.message} (URL: ${errorDetails.url}${error.code ? `, Code: ${error.code}` : ''})`;
      throw new Error(enhancedMessage);
    }
  }
  
  /**
   * Execute Axon and expect a grid result
   */
  async evalAxonGrid(code: string): Promise<HGrid> {
    const result = await this.evalAxon(code);
    if (!(result instanceof HGrid)) {
      throw new Error(`Expected grid result, got ${result.constructor.name}`);
    }
    return result;
  }
  
  /**
   * Read entities using Haystack filter
   */
  async readAll(filter: string | HFilter): Promise<HGrid> {
    const filterStr = typeof filter === 'string' ? filter : (filter as any).toZinc?.() || filter.toString();
    const code = `readAll(${filterStr})`;
    return this.evalAxonGrid(code);
  }
  
  /**
   * Read single entity
   */
  async read(id: string | HRef, checked = true): Promise<HDict | null> {
    const ref = typeof id === 'string' ? HRef.make(id) : id;
    const code = `read(${ref.toZinc()}, ${checked})`;
    const result = await this.evalAxon(code);
    
    if (result instanceof HDict) return result;
    if (result === null && !checked) return null;
    throw new Error(`Unexpected read result: ${result}`);
  }
  
  /**
   * Validate Axon code with detailed error info and return AST
   */
  async validateAxon(code: string): Promise<ValidationResult> {
    try {
      console.log(`[validateAxon] Starting validation for code (${code.length} chars)`);
      const zincStr = HStr.make(code).toZinc();

      // Use SkySpark's parseAst to validate syntax and return AST
      // The code returns the AST on success, or error details on failure
      const checkCode = `do
  try do
    ast: parseAst(${zincStr})
    {valid: true, ast: ast}
  end catch (ex) do
    {valid: false, error: ex.toStr}
  end
end`;

      console.log(`[validateAxon] Sending parseAst request to SkySpark...`);
      const result = await this.evalAxon(checkCode);
      console.log(`[validateAxon] Received response from SkySpark: ${result?.constructor?.name}`);

      // evalAll returns a grid - extract the first row as a dict
      let dict: HDict | undefined;
      if (result instanceof HGrid && result.length > 0) {
        dict = result.get(0);
      } else if (result instanceof HDict) {
        dict = result;
      }

      if (!dict) {
        throw new Error(`Unexpected validation result: got ${result?.constructor?.name}`);
      }

      // Use type-safe helper methods for value extraction
      const valid = this.getBool(dict, 'valid') ?? false;

      // Extract AST if present
      const astVal = dict.get('ast');
      let ast: AstNode | undefined;
      if (astVal instanceof HDict) {
        ast = this.convertHDictToAst(astVal);
      }

      // Error can be a string or a dict with {dis, type, errTrace}
      const errorVal = dict.get('error');
      let errorStr = '';
      if (errorVal instanceof HDict) {
        // Error is a dict - extract the display string
        errorStr = this.getStr(errorVal, 'dis') || errorVal.toString();
      } else if (errorVal) {
        errorStr = errorVal.toString();
      }

      console.log(`[validateAxon] SkySpark response: valid=${valid}, error=${errorStr || '(none)'}`);

      // Check if parseAst is not available on this SkySpark version
      if (errorStr.includes("Unknown symbol 'parseAst'") ||
          errorStr.includes('Unknown func parseAst') ||
          errorStr.includes("Unknown func 'parseAst'")) {
        // parseAst doesn't exist - return a message indicating server validation isn't available
        console.log(`[validateAxon] parseAst not available on this SkySpark version`);
        return {
          valid: true, // Can't validate server-side, assume valid for syntax
          message: 'Server-side syntax validation not available (parseAst not found). Code will be validated when executed.',
          category: 'syntax'
        };
      }

      // If valid, return success with AST
      if (valid) {
        console.log(`[validateAxon] Syntax valid, AST parsed successfully`);
        return {
          valid: true,
          category: 'syntax',
          ast
        };
      }

      console.log(`[validateAxon] Syntax error: ${errorStr}`);

      // Parse error details from error string
      // Format: "axon::SyntaxErr: Unexpected symbol: ? (0x3f) [eval:10]"
      let errorType: string | undefined;
      let line: number | undefined;
      let message = errorStr;

      // Extract error type (e.g., "SyntaxErr" from "axon::SyntaxErr:")
      const typeMatch = errorStr.match(/axon::(\w+):/);
      if (typeMatch) {
        errorType = typeMatch[1];
      }

      // Extract line number from [eval:N] or [line:N]
      const lineMatch = errorStr.match(/\[(?:eval|line):(\d+)\]/);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }

      // Extract clean message (after the error type, before location)
      const msgMatch = errorStr.match(/axon::\w+:\s*(.+?)(?:\s*\[|$)/);
      if (msgMatch) {
        message = msgMatch[1].trim();
      }

      // Categorize error
      let category: ErrorCategory = 'syntax';
      if (errorStr.includes('Unknown func') || errorStr.includes('func not found')) {
        category = 'unknown_function';
      } else if (errorStr.includes('Unknown var') || errorStr.includes('Unknown symbol')) {
        category = 'unknown_variable';
      } else if (errorStr.includes('type') || errorStr.includes('Type')) {
        category = 'type_error';
      } else if (errorStr.includes('arg') || errorStr.includes('parameter')) {
        category = 'argument_error';
      } else if (errorStr.includes('filter') || errorStr.includes('Filter')) {
        category = 'filter_error';
      }

      return {
        valid,
        error: errorStr,
        message,
        category,
        line,
        errorType
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
        message: error.message,
        category: 'runtime_error'
      }
    }
  }

  /**
   * Parse Axon code and return the AST directly
   */
  async parseAst(code: string): Promise<AstNode | null> {
    try {
      const zincStr = HStr.make(code).toZinc();
      const result = await this.evalAxon(`parseAst(${zincStr})`);

      if (result instanceof HDict) {
        return this.convertHDictToAst(result);
      }

      return null;
    } catch (error: any) {
      console.error('parseAst failed:', error.message);
      return null;
    }
  }

  /**
   * Convert HDict AST to plain JavaScript object
   */
  private convertHDictToAst(dict: HDict): AstNode {
    const result: AstNode = { type: '' };

    for (const key of dict.keys) {
      const val = dict.get(key);

      if (val instanceof HDict) {
        result[key] = this.convertHDictToAst(val);
      } else if (val instanceof HGrid) {
        // Convert grid to array
        result[key] = Array.from(val).map(row =>
          row instanceof HDict ? this.convertHDictToAst(row) : row?.toString()
        );
      } else if (Array.isArray(val)) {
        result[key] = val.map(item =>
          item instanceof HDict ? this.convertHDictToAst(item) : item?.toString()
        );
      } else if (val !== undefined && val !== null) {
        // Handle HStr, HNum, HBool, HRef, etc.
        const strVal = val.toString();
        // Try to preserve type information
        if (val instanceof HNum) {
          result[key] = (val as HNum).value;
        } else if (val instanceof HBool) {
          result[key] = (val as HBool).value;
        } else if (val instanceof HMarker) {
          result[key] = true; // Marker becomes true
        } else {
          result[key] = strVal;
        }
      }
    }

    return result;
  }
  
  /**
   * Get all Axon functions defined in the project
   */
  async getProjectFunctions(): Promise<HGrid> {
    // Return raw func records - simpler and more compatible across SkySpark versions
    const code = `readAll(func).sort("name")`;
    return await this.evalAxonGrid(code);
  }
  
  /**
   * Read Axon source code from a function record
   */
  async getFunctionSource(funcName: string): Promise<string | null> {
    try {
      const code = `read(func and name=="${funcName}")->src`;
      const result = await this.evalAxon(code);
      return result ? result.toString() : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get project schema (all tagged entities)
   */
  async getProjectSchema(): Promise<HGrid> {
    // Simplified schema query - store counts in variables first to avoid nested readAll issues
    const code = `
      do
        sites: readAll(site).size
        equips: readAll(equip).size
        points: readAll(point).size
        funcs: readAll(func).size
        [{type:"site",count:sites},{type:"equip",count:equips},{type:"point",count:points},{type:"func",count:funcs}].toGrid
      end
    `;
    return this.evalAxonGrid(code);
  }

  /**
   * Query entities with pagination - for AI to browse project data
   * Always sorts by id for deterministic pagination (SkySpark DB is non-deterministic)
   */
  async queryEntities(entityType: string, options: {
    offset?: number;
    limit?: number;
    filter?: string;
  } = {}): Promise<{ total: number; records: HDict[] }> {
    // Build filter expression
    const filterExpr = options.filter
      ? `${entityType} and ${options.filter}`
      : entityType;

    // Get total count
    const countCode = `readAll(${filterExpr}).size`;
    const totalResult = await this.evalAxon(countCode);
    const total = typeof totalResult === 'number' ? totalResult : Number(totalResult?.toString() || 0);

    // Get paginated records - SORT BY ID for deterministic pagination
    const limit = Math.min(options.limit || 100, 1000);
    const offset = options.offset || 0;

    // Handle edge case where offset >= total
    if (offset >= total) {
      return { total, records: [] };
    }

    const endIdx = Math.min(offset + limit - 1, total - 1);
    const code = `readAll(${filterExpr}).sort("id")[${offset}..${endIdx}]`;
    const grid = await this.evalAxonGrid(code);

    return { total, records: Array.from(grid).filter(r => r !== undefined) as HDict[] };
  }

  /**
   * Get all record types (by primary tag)
   */
  async getRecordTypes(): Promise<HGrid> {
    const code = `
      // Common entity types
      types: ["site", "equip", "point", "weather", "rule", "alarm", "schedule"]
      
      types.map(type => do
        recs: readAll(parseFilter(type))
        {
          type: type,
          count: recs.size,
          subtypes: recs.map(r => r.names.findAll(n => n != type)).flatten.unique.sort
        }
      end).findAll(t => t->count > 0)
    `;
    return this.evalAxonGrid(code);
  }
  
  /**
   * Get function help using typed response
   */
  async getFunctionHelp(funcName: string): Promise<FunctionHelp | null> {
    const code = `funcs(${HStr.make(funcName).toZinc()}).first(false)`;
    const result = await this.evalAxon(code);
    
    if (!(result instanceof HDict)) return null;
    
    // Use proper typed access with HDict.get<T>()
    const name = result.get<HStr>('name');
    const sig = result.get<HStr>('sig');
    const doc = result.get<HStr>('doc');
    
    return {
      name: name?.toString() ?? funcName,
      sig: sig?.toString() ?? '',
      doc: doc?.toString() ?? '',
      params: this.parseFunctionSig(sig?.toString() ?? '')
    };
  }
  
  /**
   * List all functions matching filter
   */
  async listFunctions(filter?: string): Promise<HDict[]> {
    const code = filter 
      ? `funcs().findAll(f => f->name.contains(${HStr.make(filter).toZinc()}))`
      : 'funcs()';
    
    const grid = await this.evalAxonGrid(code);
    return Array.from(grid).filter((row): row is HDict => row !== undefined);
  }
  
  /**
   * Get all available projects from the SkySpark instance
   * Note: Uses projs() function to list all accessible projects
   */
  async getAvailableProjects(): Promise<string[]> {
    const projectInfo = await this.getAvailableProjectsWithMetadata();
    return projectInfo.map(p => p.name);
  }
  
  /**
   * Get all available projects with metadata (name, type, dis, etc.)
   * Note: Uses projs() function to list all accessible projects
   */
  async getAvailableProjectsWithMetadata(): Promise<ProjectInfo[]> {
    try {
      // Use SkySpark's projs() function to get all projects
      const code = 'projs()';
      const result = await this.evalAxon(code);
      
      // projs() returns a grid with project information
      if (!(result instanceof HGrid)) {
        console.error('projs() did not return a grid');
        return [];
      }
      
      // Extract project information from the grid
      const projects: ProjectInfo[] = [];
      for (const row of result) {
        if (row) {
          const name = row.get('name') || row.get('dis');
          if (!name) continue;
          
          const type = row.get('type')?.toString() || 'local';
          const dis = row.get('dis')?.toString() || name.toString();
          const route = row.get('route')?.toString();
          const routeStatus = row.get('routeStatus')?.toString();
          const version = row.get('version')?.toString();
          
          projects.push({
            name: name.toString(),
            type,
            dis,
            route,
            routeStatus,
            version
          });
        }
      }
      
      return projects.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      // If user doesn't have permissions or function doesn't exist, return empty array
      console.error(`Failed to discover projects: ${error.message}`);
      return [];
    }
  }
  
  
  private parseFunctionSig(sig: string): ParamInfo[] {
    const match = sig.match(/\(([^)]*)\)/);
    if (!match) return [];
    
    return match[1].split(',').map(param => {
      const [name, type] = param.trim().split(':').map(s => s.trim());
      return { name, type };
    });
  }
  
  /**
   * Type-safe helper to get a string value from HDict
   */
  private getStr(dict: HDict, name: string): string | undefined {
    const val = dict.get<HStr>(name);
    return val?.toString();
  }
  
  /**
   * Type-safe helper to get a number value from HDict
   */
  private getNum(dict: HDict, name: string): number | undefined {
    const val = dict.get<HNum>(name);
    return val instanceof HNum ? val.value : undefined;
  }
  
  /**
   * Type-safe helper to get a boolean value from HDict
   */
  private getBool(dict: HDict, name: string): boolean | undefined {
    const val = dict.get<HBool>(name);
    return val instanceof HBool ? val.value : undefined;
  }
  
  /**
   * Type-safe helper to check if value is a marker
   */
  private isMarker(val: HVal | undefined): boolean {
    return val instanceof HMarker;
  }
}

export type ErrorCategory = 
  | 'syntax'
  | 'unknown_function'
  | 'type_error'
  | 'argument_error'
  | 'unknown_variable'
  | 'filter_error'
  | 'runtime_error';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  category?: ErrorCategory;
  line?: number;
  column?: number;
  errorType?: string;
  ast?: AstNode;
}

export interface AstNode {
  type: string;
  [key: string]: any;
}

interface FunctionHelp {
  name: string;
  sig: string;
  doc: string;
  params: ParamInfo[];
}

interface ParamInfo {
  name: string;
  type?: string;
}

export interface ProjectInfo {
  name: string;
  type: string;  // 'local' or 'remote'
  dis: string;   // Display name
  route?: string;  // Route information
  routeStatus?: string;  // 'ok', 'down', etc.
  version?: string;  // SkySpark version
}
