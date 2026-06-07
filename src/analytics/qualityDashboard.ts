import { promises as fs } from 'fs';
import * as path from 'path';
import type { EnhancedFunctionMetadata } from '../parser/enhancedAxonParser.js';

interface ProjectSyncMetadata {
  instance: string;
  project: string;
  lastSync: string;
  functionCount: number;
  functions: Record<string, EnhancedFunctionMetadata>;
}

export interface QualityDashboard {
  project: string;
  instance: string;
  summary: {
    totalFunctions: number;
    lastSync: string;
  };
  quality: {
    wellDocumented: number;
    wellDocumentedPercent: number;
    hasExamples: number;
    hasExamplesPercent: number;
    hasErrorHandling: number;
    hasErrorHandlingPercent: number;
  };
  complexity: {
    averageLOC: number;
    averageCyclomaticComplexity: number;
    highComplexity: number;  // Functions with complexity > 10
    highComplexityPercent: number;
    maxComplexity: number;
    mostComplexFunction?: string;
  };
  performance: {
    fast: number;
    medium: number;
    slow: number;
    batch: number;
    hasLoops: number;
  };
  operations: {
    functionsWithCommits: number;
    functionsWithJobs: number;
    functionsWithEmails: number;
    totalReads: number;
    totalWrites: number;
  };
  reusability: {
    reusable: number;  // Not site-specific
    reusablePercent: number;
    siteSpecific: number;
    siteSpecificPercent: number;
  };
  categories: Record<string, number>;
  topKeywords: Array<{keyword: string; count: number}>;
  equipmentTypes: Record<string, number>;
}

export class QualityDashboardAnalyzer {
  private baseDir: string;
  
  constructor(baseDir: string = 'proj') {
    this.baseDir = baseDir;
  }
  
  /**
   * Generate quality dashboard for a project
   */
  async generateDashboard(instance: string, project: string): Promise<QualityDashboard> {
    const metadata = await this.loadProjectMetadata(instance, project);
    
    if (!metadata) {
      throw new Error(`No metadata found for ${instance}/${project}`);
    }
    
    const functions = Object.values(metadata.functions);
    
    // Quality metrics
    const wellDocumented = functions.filter(f => f.quality?.hasDocumentation).length;
    const hasExamples = functions.filter(f => f.quality?.hasExamples).length;
    const hasErrorHandling = functions.filter(f => f.quality?.hasErrorHandling).length;
    
    // Complexity metrics
    const locs = functions.map(f => f.complexity?.linesOfCode || 0);
    const complexities = functions.map(f => f.complexity?.cyclomaticComplexity || 0);
    const avgLOC = locs.reduce((a, b) => a + b, 0) / functions.length;
    const avgComplexity = complexities.reduce((a, b) => a + b, 0) / functions.length;
    const highComplexity = functions.filter(f => (f.complexity?.cyclomaticComplexity || 0) > 10).length;
    const maxComplexity = Math.max(...complexities);
    const mostComplexFunc = functions.find(f => f.complexity?.cyclomaticComplexity === maxComplexity);
    
    // Performance metrics
    const performance = {
      fast: functions.filter(f => f.performance?.estimatedRuntime === 'fast').length,
      medium: functions.filter(f => f.performance?.estimatedRuntime === 'medium').length,
      slow: functions.filter(f => f.performance?.estimatedRuntime === 'slow').length,
      batch: functions.filter(f => f.performance?.estimatedRuntime === 'batch').length,
      hasLoops: functions.filter(f => f.performance?.hasLoops).length
    };
    
    // Operations metrics
    const functionsWithCommits = functions.filter(f => f.operations?.commits).length;
    const functionsWithJobs = functions.filter(f => f.operations?.jobs).length;
    const functionsWithEmails = functions.filter(f => f.operations?.emails).length;
    const totalReads = functions.reduce((sum, f) => sum + (f.operations?.reads?.length || 0), 0);
    const totalWrites = functions.reduce((sum, f) => sum + (f.operations?.writes?.length || 0), 0);
    
    // Reusability metrics
    const reusable = functions.filter(f => !f.context?.siteSpecific).length;
    const siteSpecific = functions.filter(f => f.context?.siteSpecific).length;
    
    // Categories
    const categories: Record<string, number> = {};
    functions.forEach(f => {
      const cat = f.patterns?.category || 'uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    });
    
    // Top keywords
    const keywordCounts: Record<string, number> = {};
    functions.forEach(f => {
      f.patterns?.keywords?.forEach(kw => {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      });
    });
    const topKeywords = Object.entries(keywordCounts)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    // Equipment types
    const equipmentTypes: Record<string, number> = {};
    functions.forEach(f => {
      f.relationships?.relatedEquipTypes?.forEach(type => {
        equipmentTypes[type] = (equipmentTypes[type] || 0) + 1;
      });
    });
    
    return {
      project,
      instance,
      summary: {
        totalFunctions: functions.length,
        lastSync: metadata.lastSync
      },
      quality: {
        wellDocumented,
        wellDocumentedPercent: Math.round((wellDocumented / functions.length) * 100),
        hasExamples,
        hasExamplesPercent: Math.round((hasExamples / functions.length) * 100),
        hasErrorHandling,
        hasErrorHandlingPercent: Math.round((hasErrorHandling / functions.length) * 100)
      },
      complexity: {
        averageLOC: Math.round(avgLOC),
        averageCyclomaticComplexity: Math.round(avgComplexity * 10) / 10,
        highComplexity,
        highComplexityPercent: Math.round((highComplexity / functions.length) * 100),
        maxComplexity,
        mostComplexFunction: mostComplexFunc?.name
      },
      performance,
      operations: {
        functionsWithCommits,
        functionsWithJobs,
        functionsWithEmails,
        totalReads,
        totalWrites
      },
      reusability: {
        reusable,
        reusablePercent: Math.round((reusable / functions.length) * 100),
        siteSpecific,
        siteSpecificPercent: Math.round((siteSpecific / functions.length) * 100)
      },
      categories,
      topKeywords,
      equipmentTypes
    };
  }
  
  /**
   * Load project metadata
   */
  private async loadProjectMetadata(instance: string, project: string): Promise<ProjectSyncMetadata | null> {
    try {
      const metadataPath = path.join(this.baseDir, instance, project, '.sync-metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  /**
   * Get list of all synced projects
   */
  async listSyncedProjects(): Promise<Array<{instance: string; project: string}>> {
    const projects: Array<{instance: string; project: string}> = [];
    
    try {
      const instances = await fs.readdir(this.baseDir);
      
      for (const instance of instances) {
        const instancePath = path.join(this.baseDir, instance);
        const stat = await fs.stat(instancePath);
        
        if (!stat.isDirectory()) continue;
        
        const projectDirs = await fs.readdir(instancePath);
        
        for (const projectDir of projectDirs) {
          const metadataPath = path.join(instancePath, projectDir, '.sync-metadata.json');
          try {
            await fs.access(metadataPath);
            projects.push({ instance, project: projectDir });
          } catch {
            // No metadata file
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return projects;
  }
  
  /**
   * Compare two projects' quality metrics
   */
  async compareProjects(
    instance1: string,
    project1: string,
    instance2: string,
    project2: string
  ): Promise<{
    project1: QualityDashboard;
    project2: QualityDashboard;
    comparison: {
      qualityDelta: number;
      complexityDelta: number;
      reusabilityDelta: number;
    };
  }> {
    const dash1 = await this.generateDashboard(instance1, project1);
    const dash2 = await this.generateDashboard(instance2, project2);
    
    return {
      project1: dash1,
      project2: dash2,
      comparison: {
        qualityDelta: dash1.quality.wellDocumentedPercent - dash2.quality.wellDocumentedPercent,
        complexityDelta: dash1.complexity.averageCyclomaticComplexity - dash2.complexity.averageCyclomaticComplexity,
        reusabilityDelta: dash1.reusability.reusablePercent - dash2.reusability.reusablePercent
      }
    };
  }
}
