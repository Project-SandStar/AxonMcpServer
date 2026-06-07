import { promises as fs } from 'fs';
import * as path from 'path';
import { HGrid } from 'haystack-core';
import { HaystackSkySparkClient } from '../skyspark/haystackClient.js';

interface SyncMetadata {
  instance: string;
  project: string;
  lastSync: string;
  functionCount: number;
}

export class FunctionSyncManager {
  private readonly baseDir: string;
  
  constructor(baseDir: string = 'proj') {
    this.baseDir = baseDir;
  }
  
  /**
   * Get the directory path for instance/project functions
   */
  private getProjectFunctionDir(instance: string, project: string): string {
    return path.join(this.baseDir, instance, project, 'func');
  }
  
  /**
   * Get the sync metadata file path
   */
  private getSyncMetadataPath(instance: string, project: string): string {
    return path.join(this.baseDir, instance, project, '.sync-metadata.json');
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
   * Pull all functions from SkySpark and save to disk
   */
  async syncFunctions(
    client: HaystackSkySparkClient,
    instance: string,
    project: string,
    options: { force?: boolean; silent?: boolean } = {}
  ): Promise<{ downloaded: number; skipped: number; errors: number }> {
    const { force = false, silent = false } = options;
    
    if (!silent) {
      console.error(`  📥 Syncing functions for ${instance}/${project}...`);
    }
    
    // Ensure the client is switched to the right project
    client.switchTo(instance, project);
    
    // Create directory structure
    const funcDir = this.getProjectFunctionDir(instance, project);
    await fs.mkdir(funcDir, { recursive: true });
    
    // Get all functions using readAll(func) - faster than funcs()
    const result = await client.evalAxon('readAll(func)');
    
    if (!result || !(result instanceof HGrid) || result.length === 0) {
      if (!silent) {
        console.error(`    ⚠️  No functions found`);
      }
      return { downloaded: 0, skipped: 0, errors: 0 };
    }
    
    const grid = result as HGrid;
    let downloaded = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < grid.length; i++) {
      const row = grid.get(i);
      if (!row) continue;
      
      const funcName = row.get('name')?.toString();
      
      if (!funcName) continue;
      
      const filePath = path.join(funcDir, `${funcName}.axon`);
      
      // Check if file exists and skip if not forcing
      if (!force) {
        try {
          await fs.access(filePath);
          skipped++;
          continue;
        } catch {
          // File doesn't exist, proceed with download
        }
      }
      
      // Get function source - src is already available in the row from readAll(func)
      try {
        const srcValue = row.get('src');
        const source = srcValue ? srcValue.toString() : '';
        
        if (!source) {
          // Fallback to old method if src not available
          const sourceResult = await client.evalAxon(`func("${funcName}").src`);
          const fallbackSource = sourceResult.toString();
          await fs.writeFile(filePath, fallbackSource, 'utf-8');
        } else {
          // Write to file
          await fs.writeFile(filePath, source, 'utf-8');
        }
        downloaded++;
      } catch (error: any) {
        if (!silent) {
          console.error(`    ⚠️  Failed to sync ${funcName}: ${error.message}`);
        }
        errors++;
      }
    }
    
    // Save sync metadata
    await this.saveSyncMetadata({
      instance,
      project,
      lastSync: new Date().toISOString(),
      functionCount: grid.length
    });
    
    if (!silent) {
      console.error(`    ✅ Synced: ${downloaded} downloaded, ${skipped} skipped, ${errors} errors`);
    }
    
    return { downloaded, skipped, errors };
  }
  
  /**
   * List all locally synced projects
   */
  async listSyncedProjects(): Promise<Array<{ instance: string; project: string; lastSync: string; functionCount: number }>> {
    const result: Array<{ instance: string; project: string; lastSync: string; functionCount: number }> = [];
    
    try {
      // Read all instances
      const instances = await fs.readdir(this.baseDir);
      
      for (const instance of instances) {
        const instancePath = path.join(this.baseDir, instance);
        const stat = await fs.stat(instancePath);
        
        if (!stat.isDirectory()) continue;
        
        // Read all projects in this instance
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
