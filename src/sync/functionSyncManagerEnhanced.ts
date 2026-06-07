import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { HGrid } from 'haystack-core';
import { HaystackSkySparkClient } from '../skyspark/haystackClient.js';
import { EnhancedAxonParser, type EnhancedFunctionMetadata } from '../parser/enhancedAxonParser.js';

interface SyncMetadata {
  instance: string;
  project: string;
  lastSync: string;
  functionCount: number;
  functions: Record<string, FunctionMetadata>;  // Track individual functions
}

// Extended to include enhanced metadata
type FunctionMetadata = EnhancedFunctionMetadata;

export interface FunctionSyncOptions {
  enableVersioning?: boolean;
  maxVersions?: number;
  enableEnhancedParsing?: boolean;
}

export class FunctionSyncManagerEnhanced {
  private readonly baseDir: string;
  private readonly enableVersioning: boolean;
  private readonly maxVersions: number;
  private readonly enableEnhancedParsing: boolean;
  private readonly parser: EnhancedAxonParser;

  constructor(baseDir: string = 'proj', options: FunctionSyncOptions = {}) {
    this.baseDir = baseDir;
    // Read versioning config from options (fallback to env for backwards compat)
    this.enableVersioning = options.enableVersioning ?? process.env.SKYSPARK_FUNCTION_VERSIONING === 'true';
    this.maxVersions = options.maxVersions ?? parseInt(process.env.SKYSPARK_MAX_VERSIONS || '4');
    // Read enhanced parsing config from options (default: true)
    this.enableEnhancedParsing = options.enableEnhancedParsing ?? process.env.SKYSPARK_ENHANCED_PARSING !== 'false';
    this.parser = new EnhancedAxonParser();
  }
  
  /**
   * Get the directory path for instance/project functions
   */
  public getProjectFunctionDir(instance: string, project: string): string {
    return path.join(this.baseDir, instance, project, 'func');
  }
  
  /**
   * Get the sync metadata file path
   */
  public getSyncMetadataPath(instance: string, project: string): string {
    return path.join(this.baseDir, instance, project, '.sync-metadata.json');
  }
  
  /**
   * Get the versions directory path
   */
  private getVersionsDir(instance: string, project: string): string {
    return path.join(this.baseDir, instance, project, '.versions');
  }
  
  /**
   * Create a backup version of a function before updating it
   */
  private async createFunctionBackup(
    instance: string,
    project: string,
    functionName: string,
    existingContent: string
  ): Promise<void> {
    if (!this.enableVersioning) {
      return;
    }
    
    try {
      const versionsDir = this.getVersionsDir(instance, project);
      await fs.mkdir(versionsDir, { recursive: true });
      
      // Create timestamp for version
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const versionFile = path.join(versionsDir, `${functionName}_${timestamp}.axon`);
      
      // Save backup
      await fs.writeFile(versionFile, existingContent, 'utf-8');
      
      // Clean up old versions
      await this.cleanupOldVersions(instance, project, functionName);
    } catch (error) {
      // Don't fail the sync if backup fails
      console.error(`    ⚠️  Failed to create backup for ${functionName}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Keep only the latest N versions of a function
   */
  private async cleanupOldVersions(
    instance: string,
    project: string,
    functionName: string
  ): Promise<void> {
    try {
      const versionsDir = this.getVersionsDir(instance, project);
      const files = await fs.readdir(versionsDir);
      
      // Filter for this function's versions
      const versionFiles = files
        .filter(f => f.startsWith(`${functionName}_`) && f.endsWith('.axon'))
        .map(f => ({
          name: f,
          path: path.join(versionsDir, f),
          // Extract timestamp from filename
          timestamp: f.substring(functionName.length + 1, f.length - 5)
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first
      
      // Keep only maxVersions, delete the rest
      const toDelete = versionFiles.slice(this.maxVersions);
      
      for (const file of toDelete) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      // Ignore errors in cleanup
    }
  }
  
  /**
   * Load sync metadata
   */
  private async loadSyncMetadata(instance: string, project: string): Promise<SyncMetadata | null> {
    try {
      const metadataPath = this.getSyncMetadataPath(instance, project);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  /**
   * Save sync metadata
   */
  private async saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
    const metadataPath = this.getSyncMetadataPath(metadata.instance, metadata.project);
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  /**
   * Calculate SHA256 hash of content
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * Build trio metadata file content from function record
   */
  private buildTrioMetadata(funcRecord: any, source: string): string {
    if (!funcRecord) {
      // Fallback if no record provided
      return `src:\n${source.split('\n').map(l => '  ' + l).join('\n')}`;
    }
    
    const lines: string[] = [];
    
    // Helper to format tag value
    const formatValue = (val: any): string => {
      if (!val) return '';
      const str = val.toString();
      // Refs start with @
      if (str.startsWith('@')) return str;
      // Marker (null/true)
      if (str === 'true' || str === 'null' || str === 'M') return '';
      // Quote strings
      return `"${str.replace(/"/g, '\\"')}"`;
    };
    
    // Add all tags from the function record
    // Critical tags for rules
    const tagsToExtract = [
      'dis', 'help', 'name', 'doc',
      'ruleOn', 'sparkRule', 'kpiRule', 'curRule',
      'ruleType', 'mod', 'lib', 'version', 'author'
    ];
    
    for (const tag of tagsToExtract) {
      if (funcRecord.has && funcRecord.has(tag)) {
        const value = funcRecord.get(tag);
        const formatted = formatValue(value);
        if (formatted === '') {
          // Marker tag
          lines.push(tag);
        } else {
          lines.push(`${tag}:${formatted}`);
        }
      }
    }
    
    // Add source code
    lines.push('src:');
    
    // Indent source code by 2 spaces
    const indentedSource = source.split('\n')
      .map(line => '  ' + line)
      .join('\n');
    
    lines.push(indentedSource);
    
    return lines.join('\n');
  }
  
  /**
   * Get function modification time from SkySpark
   */
  private async getFunctionModTime(
    client: HaystackSkySparkClient,
    funcName: string
  ): Promise<string | undefined> {
    try {
      const result = await client.evalAxon(`func("${funcName}").get("mod")`);
      return result?.toString();
    } catch {
      return undefined;
    }
  }
  
  /**
   * Check if functions are already synced and up-to-date
   */
  async isSynced(instance: string, project: string, maxAge: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    const metadata = await this.loadSyncMetadata(instance, project);
    
    if (!metadata) return false;
    
    // Check age
    const age = Date.now() - new Date(metadata.lastSync).getTime();
    if (age > maxAge) return false;
    
    // Check if directory exists and has files
    const funcDir = this.getProjectFunctionDir(instance, project);
    try {
      const files = await fs.readdir(funcDir);
      const axonFiles = files.filter(f => f.endsWith('.axon'));
      return axonFiles.length > 0;
    } catch {
      return false;
    }
  }
  
  /**
   * Get function source from local file
   */
  async getFunctionSource(instance: string, project: string, functionName: string): Promise<string | null> {
    try {
      const funcDir = this.getProjectFunctionDir(instance, project);
      const filePath = path.join(funcDir, `${functionName}.axon`);
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
  
  /**
   * Check if a function exists locally
   */
  async hasFunctionLocally(instance: string, project: string, functionName: string): Promise<boolean> {
    const funcDir = this.getProjectFunctionDir(instance, project);
    const filePath = path.join(funcDir, `${functionName}.axon`);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * List all versions of a function
   */
  async listFunctionVersions(
    instance: string,
    project: string,
    functionName: string
  ): Promise<Array<{timestamp: string; filePath: string}>> {
    if (!this.enableVersioning) {
      return [];
    }
    
    try {
      const versionsDir = this.getVersionsDir(instance, project);
      const files = await fs.readdir(versionsDir);
      
      const versions = files
        .filter(f => f.startsWith(`${functionName}_`) && f.endsWith('.axon'))
        .map(f => ({
          timestamp: f.substring(functionName.length + 1, f.length - 5),
          filePath: path.join(versionsDir, f)
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first
      
      return versions;
    } catch {
      return [];
    }
  }
  
  /**
   * Get content of a specific version
   */
  async getFunctionVersion(
    instance: string,
    project: string,
    functionName: string,
    timestamp: string
  ): Promise<string | null> {
    if (!this.enableVersioning) {
      return null;
    }
    
    try {
      const versionsDir = this.getVersionsDir(instance, project);
      const versionFile = path.join(versionsDir, `${functionName}_${timestamp}.axon`);
      return await fs.readFile(versionFile, 'utf-8');
    } catch {
      return null;
    }
  }
  
  /**
   * Process a batch of functions in parallel
   */
  private async processFunctionBatch(
    client: HaystackSkySparkClient,
    functions: Array<{name: string; filePath: string; existingMeta?: FunctionMetadata; checkModTime: boolean; force: boolean; row: any; instance: string; project: string}>,
    funcDir: string,
    silent: boolean
  ): Promise<{
    results: Array<{name: string; action: 'downloaded' | 'updated' | 'skipped' | 'error'; metadata?: FunctionMetadata}>
  }> {
    const results: Array<{name: string; action: 'downloaded' | 'updated' | 'skipped' | 'error'; metadata?: FunctionMetadata}> = [];
    
    await Promise.all(functions.map(async (funcInfo) => {
      const { name: funcName, filePath, existingMeta, checkModTime, force, row, instance, project } = funcInfo;
      
      try {
        // Get modification time from row data (readAll(func) includes mod tag)
        let modTime: string | undefined;
        if (checkModTime && row) {
          try {
            const modValue = row.get('mod');
            const modStr = modValue?.toString();
            // Only use mod time if it's a valid value (not null or empty)
            if (modStr && modStr !== 'null' && !modStr.includes('[{val: null}]')) {
              modTime = modStr;
            }
          } catch {
            // Mod time not available
          }
        }
        
        // Determine if we need to download
        let shouldDownload = force;
        let isUpdate = false;
        
        if (!shouldDownload) {
          // Check if file exists
          try {
            await fs.access(filePath);
            
            // File exists - check if it changed
            if (checkModTime && modTime && existingMeta?.lastModified) {
              // Compare modification times
              if (modTime !== existingMeta.lastModified) {
                shouldDownload = true;
                isUpdate = true;
                if (!silent) {
                  console.error(`    🔄 ${funcName}.axon (modified)`);
                }
              }
            }
          } catch {
            // File doesn't exist - download it
            shouldDownload = true;
            if (!silent) {
              console.error(`    ⬇️  ${funcName}.axon (new)`);
            }
          }
        }
        
        if (!shouldDownload) {
          results.push({ name: funcName, action: 'skipped', metadata: existingMeta });
          return;
        }
        
        // Get function source from row data (readAll(func) includes src)
        let source = '';
        if (row) {
          const srcValue = row.get('src');
          source = srcValue ? srcValue.toString() : '';
        }
        
        // Fallback to evalAxon if src not in row
        if (!source) {
          const sourceResult = await client.evalAxon(`func("${funcName}").src`);
          source = sourceResult.toString();
        }
        
        const hash = this.hashContent(source);
        
        // Create backup if this is an update and versioning is enabled
        if (isUpdate && this.enableVersioning) {
          try {
            const existingContent = await fs.readFile(filePath, 'utf-8');
            await this.createFunctionBackup(instance, project, funcName, existingContent);
          } catch {
            // If we can't read the existing file, skip backup
          }
        }
        
        // Write .axon file
        await fs.writeFile(filePath, source, 'utf-8');
        
        // Write .trio metadata file
        const trioPath = filePath.replace('.axon', '.trio');
        const trioContent = this.buildTrioMetadata(row, source);
        await fs.writeFile(trioPath, trioContent, 'utf-8');
        
        // Create metadata - use enhanced parser if enabled
        let metadata: FunctionMetadata;
        
        if (this.enableEnhancedParsing) {
          // Parse source to extract rich metadata
          metadata = this.parser.parseEnhancedFunction(
            source,
            funcName,
            instance,
            project,
            hash,
            modTime
          );
        } else {
          // Fallback to basic metadata
          metadata = {
            name: funcName,
            hash,
            lastModified: modTime,
            synced: new Date().toISOString(),
            signature: { parameters: [], isAsync: false },
            dependencies: { functions: [], tags: [], queries: [], externalApis: [] },
            complexity: { linesOfCode: 0, cyclomaticComplexity: 0, nestedDepth: 0, commentRatio: 0 },
            operations: { reads: [], writes: [], commits: false, jobs: false, emails: false },
            documentation: { description: '', examples: [], notes: [] },
            patterns: { category: 'UNCATEGORIZED', keywords: [], useCase: '' },
            performance: { estimatedRuntime: 'fast', hasLoops: false, hasRecursion: false, datasetSize: 'small' },
            context: { siteSpecific: false, projectName: project, instanceName: instance, sharedAcrossProjects: false },
            quality: { hasDocumentation: false, hasExamples: false, hasErrorHandling: false, hasTests: false },
            relationships: { similarFunctions: [], relatedEquipTypes: [], prerequisiteFunctions: [] }
          };
        }
        
        results.push({ 
          name: funcName, 
          action: isUpdate ? 'updated' : 'downloaded',
          metadata 
        });
        
      } catch (error: any) {
        if (!silent) {
          console.error(`    ⚠️  Failed: ${funcName}: ${error.message}`);
        }
        results.push({ name: funcName, action: 'error' });
      }
    }));
    
    return { results };
  }
  
  /**
   * Smart sync: Only downloads changed/new functions (with parallel downloading)
   */
  async syncFunctions(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options: { 
      force?: boolean;        // Force re-download all
      silent?: boolean;       // Suppress output
      checkModTime?: boolean; // Check modification times (slower but accurate)
      concurrency?: number;   // Number of parallel downloads (default: 10)
    } = {}
  ): Promise<{ 
    downloaded: number; 
    updated: number;
    skipped: number; 
    deleted: number;
    errors: number;
  }> {
    const { force = false, silent = false, checkModTime = true, concurrency = 10 } = options;
    
    if (!silent) {
      console.error(`  📥 Smart syncing functions for ${instance}/${project}...`);
    }
    
    // Load existing metadata
    const existingMetadata = await this.loadSyncMetadata(instance, project);
    const existingFunctions = existingMetadata?.functions || {};
    
    // Ensure the client is switched to the right project
    client.switchTo(instance, project);
    
    // Create directory structure
    const funcDir = this.getProjectFunctionDir(instance, project);
    await fs.mkdir(funcDir, { recursive: true });
    
    // Get all functions from SkySpark using readAll(func) - faster and includes src
    const result = await client.evalAxon('readAll(func)');
    
    if (!result || !(result instanceof HGrid) || result.length === 0) {
      if (!silent) {
        console.error(`    ⚠️  No functions found`);
      }
      return { downloaded: 0, updated: 0, skipped: 0, deleted: 0, errors: 0 };
    }
    
    const grid = result as HGrid;
    const newMetadata: Record<string, FunctionMetadata> = {};
    const currentFunctions = new Set<string>();
    
    let downloaded = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    if (!silent) {
      console.error(`    ⚡ Using ${concurrency} parallel downloads`);
    }
    
    // Collect all functions to process (now with src and mod data embedded)
    const functionsToProcess: Array<{name: string; filePath: string; existingMeta?: FunctionMetadata; row: any}> = [];
    
    for (let i = 0; i < grid.length; i++) {
      const row = grid.get(i);
      if (!row) continue;
      
      const funcName = row.get('name')?.toString();
      if (!funcName) continue;
      
      currentFunctions.add(funcName);
      const filePath = path.join(funcDir, `${funcName}.axon`);
      const existingMeta = existingFunctions[funcName];
      
      functionsToProcess.push({ name: funcName, filePath, existingMeta, row });
    }
    
    // Process in batches with concurrency control
    const totalFunctions = functionsToProcess.length;
    const batchSize = concurrency;
    
    for (let i = 0; i < functionsToProcess.length; i += batchSize) {
      const batch = functionsToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(functionsToProcess.length / batchSize);
      
      if (!silent && totalFunctions > batchSize) {
        console.error(`    📦 Batch ${batchNum}/${totalBatches} (${batch.length} functions)`);
      }
      
      const batchWithOptions = batch.map(f => ({
        ...f,
        checkModTime,
        force,
        instance,
        project
      }));
      
      const { results } = await this.processFunctionBatch(
        client,
        batchWithOptions,
        funcDir,
        silent
      );
      
      // Aggregate results
      for (const result of results) {
        if (result.action === 'downloaded') {
          downloaded++;
          if (result.metadata) {
            newMetadata[result.name] = result.metadata;
          }
        } else if (result.action === 'updated') {
          updated++;
          if (result.metadata) {
            newMetadata[result.name] = result.metadata;
          }
        } else if (result.action === 'skipped') {
          skipped++;
          if (result.metadata) {
            newMetadata[result.name] = result.metadata;
          }
        } else if (result.action === 'error') {
          errors++;
        }
      }
    }
    
    // Detect deleted functions
    let deleted = 0;
    if (existingMetadata) {
      for (const funcName of Object.keys(existingFunctions)) {
        if (!currentFunctions.has(funcName)) {
          const filePath = path.join(funcDir, `${funcName}.axon`);
          try {
            await fs.unlink(filePath);
            deleted++;
            if (!silent) {
              console.error(`    🗑️  ${funcName}.axon (deleted from server)`);
            }
          } catch {
            // File already gone
          }
        }
      }
    }
    
    // Save sync metadata
    await this.saveSyncMetadata({
      instance,
      project,
      lastSync: new Date().toISOString(),
      functionCount: grid.length,
      functions: newMetadata
    });
    
    if (!silent) {
      console.error(`    ✅ Smart sync complete:`);
      if (downloaded > 0) console.error(`       📥 Downloaded: ${downloaded} new`);
      if (updated > 0) console.error(`       🔄 Updated: ${updated} changed`);
      if (skipped > 0) console.error(`       ⏭️  Skipped: ${skipped} unchanged`);
      if (deleted > 0) console.error(`       🗑️  Deleted: ${deleted} removed`);
      if (errors > 0) console.error(`       ⚠️  Errors: ${errors}`);
    }
    
    return { downloaded, updated, skipped, deleted, errors };
  }
  
  /**
   * Quick sync: Only checks file existence (fast, but may miss updates)
   */
  async syncFunctionsFast(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options: { force?: boolean; silent?: boolean } = {}
  ): Promise<{ downloaded: number; skipped: number; errors: number }> {
    // Call smart sync but disable mod time checking
    const result = await this.syncFunctions(client, instance, project, {
      ...options,
      checkModTime: false
    });
    
    return {
      downloaded: result.downloaded + result.updated,
      skipped: result.skipped,
      errors: result.errors
    };
  }
  
  /**
   * List all locally synced projects
   */
  async listSyncedProjects(): Promise<Array<{ 
    instance: string; 
    project: string; 
    lastSync: string; 
    functionCount: number 
  }>> {
    const result: Array<{ instance: string; project: string; lastSync: string; functionCount: number }> = [];
    
    try {
      const instances = await fs.readdir(this.baseDir);
      
      for (const instance of instances) {
        const instancePath = path.join(this.baseDir, instance);
        const stat = await fs.stat(instancePath);
        
        if (!stat.isDirectory()) continue;
        
        const projects = await fs.readdir(instancePath);
        
        for (const project of projects) {
          const metadata = await this.loadSyncMetadata(instance, project);
          
          if (metadata) {
            result.push({
              instance: metadata.instance,
              project: metadata.project,
              lastSync: metadata.lastSync,
              functionCount: metadata.functionCount
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
    
    return result;
  }
  
  /**
   * Get sync statistics for a project
   */
  async getSyncStats(instance: string, project: string): Promise<{
    functionCount: number;
    lastSync: string | null;
    hasMetadata: boolean;
    withModTimes: number;
    withHashes: number;
  } | null> {
    const metadata = await this.loadSyncMetadata(instance, project);
    
    if (!metadata) return null;
    
    const functions = Object.values(metadata.functions || {});
    
    return {
      functionCount: metadata.functionCount,
      lastSync: metadata.lastSync,
      hasMetadata: true,
      withModTimes: functions.filter(f => f.lastModified).length,
      withHashes: functions.filter(f => f.hash).length
    };
  }
  
  /**
   * Get count of synced functions for a project
   */
  async getSyncedFunctionCount(instance: string, project: string): Promise<number> {
    try {
      const funcDir = this.getProjectFunctionDir(instance, project);
      const files = await fs.readdir(funcDir);
      return files.filter(f => f.endsWith('.axon')).length;
    } catch {
      return 0;
    }
  }
  
  /**
   * Clear synced functions for a project
   */
  async clearSync(instance: string, project: string): Promise<void> {
    const projectDir = path.join(this.baseDir, instance, project);
    await fs.rm(projectDir, { recursive: true, force: true });
  }
}
