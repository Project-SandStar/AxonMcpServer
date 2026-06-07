import { promises as fs } from 'fs';
import * as path from 'path';
import { AxonServerConfig } from '../config/config.js';
import { minimatch } from 'minimatch';
import { AxonUsageScanner } from './axonUsageScanner.js';

export class FileScanner {
  private config: AxonServerConfig;
  private axonUsageScanner: AxonUsageScanner;
  
  constructor(config: AxonServerConfig) {
    this.config = config;
    this.axonUsageScanner = new AxonUsageScanner();
  }

  /**
   * Scan for Axon files in both code and documentation paths
   */
  async scanForAxonFiles(): Promise<{ codePath: string; fileType: 'code' | 'docs' }[]> {
    const files: { codePath: string; fileType: 'code' | 'docs' }[] = [];
    
    // Scan code path
    const codeFiles = await this.scanDirectory(
      this.config.codePath,
      this.config.filePatterns?.code || ['*.axon', '*.trio'],
      'code'
    );
    files.push(...codeFiles);
    
    // Scan docs path if different from code path
    if (this.config.docsPath && this.config.docsPath !== this.config.codePath) {
      const docFiles = await this.scanDirectory(
        this.config.docsPath,
        this.config.filePatterns?.docs || ['*.html', '*.md'],
        'docs'
      );
      files.push(...docFiles);
    }
    
    return files;
  }
  
  /**
   * Scan a directory for files matching patterns
   */
  private async scanDirectory(
    dirPath: string,
    patterns: string[],
    fileType: 'code' | 'docs'
  ): Promise<{ codePath: string; fileType: 'code' | 'docs' }[]> {
    const files: { codePath: string; fileType: 'code' | 'docs' }[] = [];
    const excludeDirs = this.config.excludeDirs || ['node_modules', '.git', 'dist', 'build'];
    
    // Check if directory exists before scanning
    try {
      await fs.access(dirPath);
    } catch (error) {
      console.error(`Directory does not exist or is not accessible: ${dirPath}`);
      return files;
    }
    
    async function scan(currentPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            // Skip excluded directories
            if (!excludeDirs.includes(entry.name)) {
              await scan(fullPath);
            }
          } else if (entry.isFile()) {
            // Check if file matches any pattern
            const relativePath = path.relative(dirPath, fullPath);
            const matches = patterns.some(pattern => 
              minimatch(relativePath, pattern) || minimatch(entry.name, pattern)
            );
            
            if (matches) {
              files.push({ codePath: fullPath, fileType });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${currentPath}:`, error);
      }
    }
    
    await scan(dirPath);
    return files;
  }

  /**
   * Read file contents
   */
  async readFileContents(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Extract Axon code from HTML files
   */
  extractAxonFromHtml(htmlContent: string): string[] {
    const codeBlocks: string[] = [];
    
    // Pattern to match Axon code in <pre> tags
    const prePattern = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let match;
    
    while ((match = prePattern.exec(htmlContent)) !== null) {
      const content = match[1];
      // Check if it looks like Axon code
      if (content.includes('=>') || content.includes('do') || content.includes('end')) {
        // Clean HTML entities
        const cleaned = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]+>/g, ''); // Remove any remaining HTML tags
        
        codeBlocks.push(cleaned.trim());
      }
    }
    
    return codeBlocks;
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        modified: stats.mtime,
        created: stats.ctime
      };
    } catch (error) {
      console.error(`Error getting metadata for ${filePath}:`, error);
      return null;
    }
  }
}