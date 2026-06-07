import { promises as fs } from 'fs';
import * as path from 'path';
import { AxonCodeIndex, AxonFunction } from '../types/index.js';

interface CacheMetadata {
  version: string;
  timestamp: number;
  libraryPath: string;
  instance?: string;  // SkySpark instance name
  project?: string;   // SkySpark project name
}

export class CacheManager {
  private readonly cacheDir: string;
  private readonly cacheFile: string;  // Default cache file (backward compatible)
  private readonly metadataFile: string;  // Default metadata file
  private readonly cacheVersion = '1.0.0';
  private cache: Map<string, any> = new Map();  // In-memory cache for project-specific data

  constructor(cacheDir: string = '.cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'axon-index.json');
    this.metadataFile = path.join(cacheDir, 'cache-metadata.json');
  }
  
  /**
   * Get cache file path for specific instance and project
   */
  private getProjectCacheFile(instance: string, project: string): string {
    const safeInstance = instance.replace(/[^a-zA-Z0-9]/g, '_');
    const safeProject = project.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.cacheDir, `axon-index-${safeInstance}-${safeProject}.json`);
  }
  
  /**
   * Get metadata file path for specific instance and project
   */
  private getProjectMetadataFile(instance: string, project: string): string {
    const safeInstance = instance.replace(/[^a-zA-Z0-9]/g, '_');
    const safeProject = project.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.cacheDir, `cache-metadata-${safeInstance}-${safeProject}.json`);
  }
  
  /**
   * Get cache key for in-memory cache
   */
  private getProjectCacheKey(instance: string | undefined, project: string, key: string): string {
    if (!instance) return key;  // Backward compatible
    return `${instance}:${project}:${key}`;
  }

  /**
   * Initialize cache directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }

  /**
   * Check if cache is valid (supports both global and project-specific cache)
   */
  async isValidCache(
    libraryPath: string, 
    maxAge: number = 24 * 60 * 60 * 1000,
    instance?: string,
    project?: string
  ): Promise<boolean> {
    try {
      // Use project-specific cache if instance/project provided
      const metadataFilePath = (instance && project) 
        ? this.getProjectMetadataFile(instance, project)
        : this.metadataFile;
      
      const cacheFilePath = (instance && project)
        ? this.getProjectCacheFile(instance, project)
        : this.cacheFile;
      
      const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
      const metadata: CacheMetadata = JSON.parse(metadataContent);
      
      // Check version
      if (metadata.version !== this.cacheVersion) {
        return false;
      }
      
      // Check library path
      if (metadata.libraryPath !== libraryPath) {
        return false;
      }
      
      // Check instance/project match if specified
      if (instance && metadata.instance !== instance) {
        return false;
      }
      if (project && metadata.project !== project) {
        return false;
      }
      
      // Check age
      const age = Date.now() - metadata.timestamp;
      if (age > maxAge) {
        return false;
      }
      
      // Check if cache file exists
      await fs.access(cacheFilePath);
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load cached index (supports both global and project-specific cache)
   */
  async loadCache(instance?: string, project?: string): Promise<AxonCodeIndex | null> {
    try {
      const cacheFilePath = (instance && project)
        ? this.getProjectCacheFile(instance, project)
        : this.cacheFile;
      
      const content = await fs.readFile(cacheFilePath, 'utf-8');
      const cached = JSON.parse(content);
      
      // Reconstruct Maps from JSON
      const index: AxonCodeIndex = {
        functions: new Map(cached.functions),
        categories: new Map(cached.categories),
        tags: new Map(cached.tags),
        lastUpdated: new Date(cached.lastUpdated)
      };
      
      return index;
    } catch (error: any) {
      // Only log if it's not a simple "file not found" (expected on first run)
      if (error.code !== 'ENOENT') {
        console.error('Failed to load cache:', error);
      }
      return null;
    }
  }

  /**
   * Save index to cache (supports both global and project-specific cache)
   */
  async saveCache(
    index: AxonCodeIndex, 
    libraryPath: string,
    instance?: string,
    project?: string
  ): Promise<void> {
    try {
      const cacheFilePath = (instance && project)
        ? this.getProjectCacheFile(instance, project)
        : this.cacheFile;
      
      const metadataFilePath = (instance && project)
        ? this.getProjectMetadataFile(instance, project)
        : this.metadataFile;
      
      // Convert Maps to arrays for JSON serialization
      const serializable = {
        functions: Array.from(index.functions.entries()),
        categories: Array.from(index.categories.entries()),
        tags: Array.from(index.tags.entries()),
        lastUpdated: index.lastUpdated.toISOString()
      };
      
      // Save index
      await fs.writeFile(cacheFilePath, JSON.stringify(serializable, null, 2));
      
      // Save metadata
      const metadata: CacheMetadata = {
        version: this.cacheVersion,
        timestamp: Date.now(),
        libraryPath,
        instance,
        project
      };
      await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));
      
      const projectInfo = (instance && project) ? ` for ${instance}/${project}` : '';
      console.error(`Cache saved successfully${projectInfo}`);
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  /**
   * Clear cache (all caches or specific project)
   */
  async clearCache(instance?: string, project?: string): Promise<void> {
    try {
      if (instance && project) {
        // Clear specific project cache
        const cacheFilePath = this.getProjectCacheFile(instance, project);
        const metadataFilePath = this.getProjectMetadataFile(instance, project);
        
        await fs.unlink(cacheFilePath).catch(() => {});
        await fs.unlink(metadataFilePath).catch(() => {});
        
        console.error(`Cache cleared for ${instance}/${project}`);
      } else {
        // Clear all caches
        await fs.rm(this.cacheDir, { recursive: true, force: true });
        console.error('All caches cleared');
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get file modification time
   */
  async getFileModTime(filePath: string): Promise<number | null> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime.getTime();
    } catch {
      return null;
    }
  }

  /**
   * Check if any files have been modified since cache was created
   */
  async hasFilesChanged(files: string[], cacheTime: number): Promise<boolean> {
    for (const file of files) {
      const modTime = await this.getFileModTime(file);
      if (modTime && modTime > cacheTime) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get data from in-memory cache with project context
   */
  public getProjectData<T>(key: string, instance?: string, project?: string): T | undefined {
    const cacheKey = this.getProjectCacheKey(instance, project || '', key);
    return this.cache.get(cacheKey);
  }
  
  /**
   * Set data in in-memory cache with project context
   */
  public setProjectData<T>(key: string, value: T, instance?: string, project?: string): void {
    const cacheKey = this.getProjectCacheKey(instance, project || '', key);
    this.cache.set(cacheKey, value);
  }
  
  /**
   * Clear in-memory cache for specific project
   */
  public clearProjectCache(instance?: string, project?: string): void {
    if (!instance || !project) {
      // Clear all in-memory cache
      this.cache.clear();
      console.error('In-memory cache cleared (all projects)');
    } else {
      // Clear specific project cache
      const prefix = `${instance}:${project}:`;
      const keysToDelete = Array.from(this.cache.keys())
        .filter(key => key.startsWith(prefix));
      keysToDelete.forEach(key => this.cache.delete(key));
      console.error(`In-memory cache cleared for ${instance}/${project}`);
    }
  }
  
  /**
   * Save FlexSearch documentation index to cache
   */
  async saveFlexSearchIndex(indexData: string, docsPath: string): Promise<void> {
    try {
      await this.initialize();
      const cacheFilePath = path.join(this.cacheDir, 'flexsearch-docs.json');
      const metadataFilePath = path.join(this.cacheDir, 'flexsearch-metadata.json');
      
      // Save index data
      await fs.writeFile(cacheFilePath, indexData);
      
      // Save metadata
      const metadata = {
        version: this.cacheVersion,
        timestamp: Date.now(),
        docsPath
      };
      await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));
      
      console.error('FlexSearch documentation index cached successfully');
    } catch (error) {
      console.error('Failed to save FlexSearch index cache:', error);
    }
  }
  
  /**
   * Load FlexSearch documentation index from cache
   */
  async loadFlexSearchIndex(docsPath: string): Promise<string | null> {
    try {
      const cacheFilePath = path.join(this.cacheDir, 'flexsearch-docs.json');
      const metadataFilePath = path.join(this.cacheDir, 'flexsearch-metadata.json');
      
      // Check metadata first
      const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      // Validate metadata
      if (metadata.version !== this.cacheVersion || metadata.docsPath !== docsPath) {
        return null;
      }
      
      // Load index data
      const indexData = await fs.readFile(cacheFilePath, 'utf-8');
      return indexData;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load FlexSearch index cache:', error);
      }
      return null;
    }
  }
  
  /**
   * Check if FlexSearch index cache is valid
   */
  async isFlexSearchIndexValid(
    docsPath: string, 
    maxAge: number = 24 * 60 * 60 * 1000
  ): Promise<boolean> {
    try {
      const metadataFilePath = path.join(this.cacheDir, 'flexsearch-metadata.json');
      const cacheFilePath = path.join(this.cacheDir, 'flexsearch-docs.json');
      
      const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      // Check version and path
      if (metadata.version !== this.cacheVersion || metadata.docsPath !== docsPath) {
        return false;
      }
      
      // Check age
      const age = Date.now() - metadata.timestamp;
      if (age > maxAge) {
        return false;
      }
      
      // Check if cache file exists
      await fs.access(cacheFilePath);
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all cached projects
   */
  async listCachedProjects(): Promise<Array<{ instance: string; project: string; timestamp: number }>> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const projects: Array<{ instance: string; project: string; timestamp: number }> = [];
      
      for (const file of files) {
        if (file.startsWith('cache-metadata-') && file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.cacheDir, file), 'utf-8');
            const metadata: CacheMetadata = JSON.parse(content);
            
            if (metadata.instance && metadata.project) {
              projects.push({
                instance: metadata.instance,
                project: metadata.project,
                timestamp: metadata.timestamp
              });
            }
          } catch {
            // Skip invalid metadata files
          }
        }
      }
      
      return projects;
    } catch {
      return [];
    }
  }
}
