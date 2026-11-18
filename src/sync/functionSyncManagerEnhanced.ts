import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { HGrid } from 'haystack-core';
import { HaystackSkySparkClient } from '../skyspark/haystackClient.js';
import { EnhancedAxonParser, type EnhancedFunctionMetadata } from '../parser/enhancedAxonParser.js';
import { isFunctionName, isSafeSegment } from '../ide/names.js';
import { modToIso, sha256Hex } from '../ide/mod.js';

/** One function of the local copy, as the IDE API sends it. */
export interface StoredFunction {
  name: string;
  src: string;
  doc: string | null;
  /** ISO 8601 UTC with milliseconds, or null when the copy does not hold it. */
  mod: string | null;
  /** sha256 of src. */
  hash: string;
}

/** One project of the local copy. */
export interface StoredProject {
  instance: string;
  project: string;
  functionCount: number;
  lastSync: string | null;
}

interface SyncMetadata {
  instance: string;
  project: string;
  lastSync: string;
  functionCount: number;
  functions: Record<string, FunctionMetadata>;  // Track individual functions
}

// Extended to include enhanced metadata.
// modIso is the record's mod with milliseconds (lastModified is a display
// string with seconds only). doc is the record's doc tag, null when it has none.
type FunctionMetadata = EnhancedFunctionMetadata & { modIso?: string | null; doc?: string | null };

/** Metadata without the source analysis (enhanced parsing off). */
function basicFunctionMetadata(
  name: string, hash: string, modTime: string | undefined, instance: string, project: string
): FunctionMetadata {
  return {
    name,
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
  } as FunctionMetadata;
}

/** Tags that can follow `doc` in a func/<name>.trio file (see buildTrioMetadata). */
const TRIO_TAGS_AFTER_DOC = /^(ruleOn|sparkRule|kpiRule|curRule|ruleType|mod|lib|version|author|src)(:|$)/;

/**
 * The doc tag of a func/<name>.trio file, or null. Used only for a copy that
 * was synced before the metadata held the doc. The file is written with raw
 * newlines inside the value, so the doc ends at the next known tag.
 */
export function docFromTrio(trio: string): string | null {
  const lines = trio.split('\n');
  const start = lines.findIndex(l => l.startsWith('doc:"'));
  const srcAt = lines.findIndex(l => l === 'src:');
  if (start < 0 || (srcAt >= 0 && start > srcAt)) return null;
  let end = start + 1;
  while (end < lines.length && !TRIO_TAGS_AFTER_DOC.test(lines[end])) end++;
  let text = lines.slice(start, end).join('\n').slice('doc:"'.length);
  if (text.endsWith('"')) text = text.slice(0, -1);
  return text.replace(/\\"/g, '"');
}

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
    // Write to a temp file, then rename: a reader never sees half a file.
    const tmpPath = `${metadataPath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(metadata, null, 2));
    await fs.rename(tmpPath, metadataPath);
  }

  /** One sync or local update at a time for each project. */
  private readonly projectLocks = new Map<string, Promise<unknown>>();

  private withProjectLock<T>(instance: string, project: string, fn: () => Promise<T>): Promise<T> {
    const key = `${instance}/${project}`;
    const previous = this.projectLocks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.projectLocks.set(key, tail);
    void tail.then(() => {
      if (this.projectLocks.get(key) === tail) this.projectLocks.delete(key);
    });
    return run;
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
        // Always read it: a first (forced) sync must record the mod too, or a
        // later sync has nothing to compare with.
        let modTime: string | undefined;
        let modIso: string | null = null;
        let rowDoc: string | null = null;
        let rowSrc = '';
        if (row) {
          try {
            const modValue = row.get('mod');
            const modStr = modValue?.toString();
            // Only use mod time if it's a valid value (not null or empty)
            if (modStr && modStr !== 'null' && !modStr.includes('[{val: null}]')) {
              modTime = modStr;
              modIso = modToIso(modValue);
            }
          } catch {
            // Mod time not available
          }
          try {
            const docValue = row.get('doc');
            if (docValue !== undefined && docValue !== null) rowDoc = docValue.toString();
            const srcValue = row.get('src');
            rowSrc = srcValue ? srcValue.toString() : '';
          } catch {
            // Tags not available
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
            // Changed when the mod differs or when the source differs. The
            // source test also covers a copy that never recorded a mod.
            if (checkModTime) {
              const modChanged = !!(modTime && existingMeta?.lastModified && modTime !== existingMeta.lastModified);
              const isoChanged = !!(modIso && existingMeta?.modIso && modIso !== existingMeta.modIso);
              const srcChanged = rowSrc !== '' && this.hashContent(rowSrc) !== existingMeta?.hash;
              if (modChanged || isoChanged || srcChanged) {
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
          // Source unchanged: keep the parsed metadata, refresh mod and doc from the record.
          const kept: FunctionMetadata | undefined = existingMeta && row
            ? { ...existingMeta, lastModified: modTime ?? existingMeta.lastModified, modIso, doc: rowDoc }
            : existingMeta;
          results.push({ name: funcName, action: 'skipped', metadata: kept });
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
          metadata = basicFunctionMetadata(funcName, hash, modTime, instance, project);
        }
        metadata.modIso = modIso;
        metadata.doc = rowDoc;
        
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
    // One at a time for each project: a sync and a commit's local update
    // must not write the same files and metadata together.
    return this.withProjectLock(instance, project, () => this.doSyncFunctions(client, instance, project, options));
  }

  private async doSyncFunctions(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options: {
      force?: boolean;
      silent?: boolean;
      checkModTime?: boolean;
      concurrency?: number;
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
            await fs.unlink(filePath.replace(/\.axon$/, '.trio')).catch(() => undefined);
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
  
  // ---------------------------------------------------------------------
  // Local copy for the IDE API and the function commit
  // ---------------------------------------------------------------------

  /** The project folder, after a check that both names stay inside baseDir. */
  private safeProjectDir(instance: string, project: string): string {
    if (!isSafeSegment(instance) || !isSafeSegment(project)) {
      throw new Error('Invalid instance or project name');
    }
    const base = path.resolve(this.baseDir);
    const dir = path.resolve(base, instance, project);
    if (!dir.startsWith(base + path.sep)) throw new Error('Invalid instance or project name');
    return dir;
  }

  /** Names of the regular func/<name>.axon files whose name is a plain function name. */
  private async storedFunctionNames(funcDir: string): Promise<string[]> {
    let entries;
    try {
      entries = await fs.readdir(funcDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.axon'))
      .map(e => e.name.slice(0, -'.axon'.length))
      .filter(isFunctionName)
      .sort();
  }

  private async isDir(dir: string): Promise<boolean> {
    try {
      return (await fs.stat(dir)).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Every project that has a local copy (a func folder or sync metadata).
   * The names are the folder names, so they are the names a caller reads with.
   */
  async listStoredProjects(): Promise<StoredProject[]> {
    const out: StoredProject[] = [];
    let instances: string[];
    try {
      instances = await fs.readdir(this.baseDir);
    } catch {
      return out;
    }
    for (const instance of instances.sort()) {
      if (!isSafeSegment(instance) || instance.startsWith('.')) continue;
      const instanceDir = path.join(this.baseDir, instance);
      if (!(await this.isDir(instanceDir))) continue;
      let projects: string[];
      try {
        projects = await fs.readdir(instanceDir);
      } catch {
        continue;
      }
      for (const project of projects.sort()) {
        if (!isSafeSegment(project) || project.startsWith('.')) continue;
        const funcDir = this.getProjectFunctionDir(instance, project);
        const metadata = await this.loadSyncMetadata(instance, project);
        if (!metadata && !(await this.isDir(funcDir))) continue;
        out.push({
          instance,
          project,
          functionCount: (await this.storedFunctionNames(funcDir)).length,
          lastSync: modToIso(metadata?.lastSync) ?? null,
        });
      }
    }
    return out;
  }

  /**
   * The functions of one project from the local copy, or null when the
   * project has no local copy. One entry for each func/<name>.axon file.
   *
   * `mod` comes from the sync metadata; it is null for a copy that was synced
   * before the metadata held it (run a sync to fill it).
   */
  async readStoredFunctions(
    instance: string,
    project: string
  ): Promise<{ syncedAt: string | null; functions: StoredFunction[] } | null> {
    this.safeProjectDir(instance, project);
    const funcDir = this.getProjectFunctionDir(instance, project);
    const metadata = await this.loadSyncMetadata(instance, project);
    if (!metadata && !(await this.isDir(funcDir))) return null;

    const functions: StoredFunction[] = [];
    for (const name of await this.storedFunctionNames(funcDir)) {
      let src: string;
      try {
        src = await fs.readFile(path.join(funcDir, `${name}.axon`), 'utf-8');
      } catch {
        continue; // removed while we read
      }
      const meta = metadata?.functions?.[name];
      let doc: string | null = null;
      if (meta && meta.doc !== undefined) {
        doc = meta.doc;
      } else {
        try {
          doc = docFromTrio(await fs.readFile(path.join(funcDir, `${name}.trio`), 'utf-8'));
        } catch {
          doc = null;
        }
      }
      // The mod is good only for the source it was recorded with.
      const metaIsCurrent = !!meta && meta.hash === this.hashContent(src);
      functions.push({
        name,
        src,
        doc,
        mod: metaIsCurrent ? modToIso(meta!.modIso) : null,
        hash: sha256Hex(src),
      });
    }
    return { syncedAt: modToIso(metadata?.lastSync) ?? null, functions };
  }

  /**
   * Updates the local copy after a commit to SkySpark: func/<name>.axon,
   * func/<name>.trio and the function's entry in the sync metadata.
   *
   * A project that was never synced has no func folder; nothing is written
   * for it, because one lone file would look like a full copy.
   */
  async recordCommittedFunction(
    instance: string,
    project: string,
    fn: {
      name: string;
      src: string;
      doc: string | null;
      modIso: string | null;
      record?: { has(name: string): boolean; get(name: string): unknown } | null;
    }
  ): Promise<{ files: boolean; metadata: boolean }> {
    this.safeProjectDir(instance, project);
    if (!isFunctionName(fn.name)) throw new Error('Invalid function name');

    return this.withProjectLock(instance, project, async () => {
      const funcDir = this.getProjectFunctionDir(instance, project);
      if (!(await this.isDir(funcDir))) return { files: false, metadata: false };

      const filePath = path.join(funcDir, `${fn.name}.axon`);
      if (this.enableVersioning) {
        try {
          const previous = await fs.readFile(filePath, 'utf-8');
          if (previous !== fn.src) await this.createFunctionBackup(instance, project, fn.name, previous);
        } catch {
          // New function: nothing to keep
        }
      }
      await fs.writeFile(filePath, fn.src, 'utf-8');
      await fs.writeFile(
        path.join(funcDir, `${fn.name}.trio`),
        this.buildTrioMetadata(fn.record ?? null, fn.src),
        'utf-8'
      );

      const metadata = await this.loadSyncMetadata(instance, project);
      if (!metadata) return { files: true, metadata: false };

      const hash = this.hashContent(fn.src);
      const modValue = fn.record?.has('mod') ? fn.record.get('mod') : undefined;
      const modTime = modValue ? String(modValue) : undefined;
      const entry: FunctionMetadata = this.enableEnhancedParsing
        ? this.parser.parseEnhancedFunction(fn.src, fn.name, instance, project, hash, modTime)
        : basicFunctionMetadata(fn.name, hash, modTime, instance, project);
      entry.modIso = fn.modIso;
      entry.doc = fn.doc;

      const functions = metadata.functions ?? {};
      const isNew = !(fn.name in functions);
      functions[fn.name] = entry;
      await this.saveSyncMetadata({
        ...metadata,
        functions,
        functionCount: isNew ? (metadata.functionCount ?? 0) + 1 : metadata.functionCount,
      });
      return { files: true, metadata: true };
    });
  }

  /**
   * Clear synced functions for a project
   */
  async clearSync(instance: string, project: string): Promise<void> {
    const projectDir = path.join(this.baseDir, instance, project);
    await fs.rm(projectDir, { recursive: true, force: true });
  }
}
