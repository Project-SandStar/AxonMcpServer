import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { AxonTemplate, TemplateParameter } from '../generation/typedAxonGenerator';

export interface TemplateSearchOptions {
  category?: string;
  tags?: string[];
  text?: string;
}

export class TemplateLoader {
  private templates: Map<string, AxonTemplate> = new Map();
  private templatesByCategory: Map<string, AxonTemplate[]> = new Map();
  private templatesByTag: Map<string, AxonTemplate[]> = new Map();
  
  constructor(private templatesDir: string) {}
  
  /**
   * Load all templates from the templates directory
   */
  async loadTemplates(): Promise<void> {
    this.templates.clear();
    this.templatesByCategory.clear();
    this.templatesByTag.clear();
    
    await this.loadTemplatesFromDir(this.templatesDir);
  }
  
  /**
   * Recursively load templates from a directory
   */
  private async loadTemplatesFromDir(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.loadTemplatesFromDir(fullPath);
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        await this.loadTemplateFile(fullPath);
      }
    }
  }
  
  /**
   * Load a single template file
   */
  private async loadTemplateFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const data = yaml.parse(content);
      
      // Validate template structure
      const template = this.validateTemplate(data, filePath);
      
      // Store template
      this.templates.set(template.id, template);
      
      // Index by category
      if (!this.templatesByCategory.has(template.category)) {
        this.templatesByCategory.set(template.category, []);
      }
      this.templatesByCategory.get(template.category)!.push(template);
      
      // Index by tags
      if (template.tags) {
        for (const tag of template.tags) {
          if (!this.templatesByTag.has(tag)) {
            this.templatesByTag.set(tag, []);
          }
          this.templatesByTag.get(tag)!.push(template);
        }
      }
    } catch (error) {
      console.error(`Failed to load template from ${filePath}:`, error);
    }
  }
  
  /**
   * Validate template data structure
   */
  private validateTemplate(data: any, filePath: string): AxonTemplate {
    if (!data.id) {
      throw new Error(`Template missing 'id' field in ${filePath}`);
    }
    if (!data.name) {
      throw new Error(`Template missing 'name' field in ${filePath}`);
    }
    if (!data.category) {
      throw new Error(`Template missing 'category' field in ${filePath}`);
    }
    if (!data.template) {
      throw new Error(`Template missing 'template' field in ${filePath}`);
    }
    if (!Array.isArray(data.parameters)) {
      throw new Error(`Template 'parameters' must be an array in ${filePath}`);
    }
    
    // Validate parameters
    const validatedParams: TemplateParameter[] = [];
    for (const param of data.parameters) {
      if (!param.name) {
        throw new Error(`Parameter missing 'name' field in ${filePath}`);
      }
      if (!param.type) {
        throw new Error(`Parameter '${param.name}' missing 'type' field in ${filePath}`);
      }
      if (!param.description) {
        throw new Error(`Parameter '${param.name}' missing 'description' field in ${filePath}`);
      }
      
      validatedParams.push(param);
    }
    
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      description: data.description || '',
      parameters: validatedParams,
      template: data.template,
      validation: data.validation,
      examples: data.examples,
      tags: data.tags
    };
  }
  
  /**
   * Get a template by ID
   */
  getTemplate(id: string): AxonTemplate | undefined {
    return this.templates.get(id);
  }
  
  /**
   * Get all templates
   */
  getAllTemplates(): AxonTemplate[] {
    return Array.from(this.templates.values());
  }
  
  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): AxonTemplate[] {
    return this.templatesByCategory.get(category) || [];
  }
  
  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.templatesByCategory.keys()).sort();
  }
  
  /**
   * Search templates
   */
  searchTemplates(options: TemplateSearchOptions): AxonTemplate[] {
    let results = this.getAllTemplates();
    
    // Filter by category
    if (options.category) {
      results = results.filter(t => t.category === options.category);
    }
    
    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(t => 
        t.tags && options.tags!.some(tag => t.tags!.includes(tag))
      );
    }
    
    // Search by text in name, description, or template
    if (options.text) {
      const searchText = options.text.toLowerCase();
      results = results.filter(t => 
        t.name.toLowerCase().includes(searchText) ||
        t.description.toLowerCase().includes(searchText) ||
        t.template.toLowerCase().includes(searchText) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchText)))
      );
    }
    
    return results;
  }
  
  /**
   * Find templates that match a natural language intent
   */
  findTemplatesByIntent(intent: string): AxonTemplate[] {
    const lowerIntent = intent.toLowerCase();
    const scores = new Map<string, number>();
    
    for (const template of this.templates.values()) {
      let score = 0;
      
      // Check name match
      if (lowerIntent.includes(template.name.toLowerCase())) {
        score += 10;
      }
      
      // Check category match
      if (lowerIntent.includes(template.category.toLowerCase())) {
        score += 5;
      }
      
      // Check description match
      const descWords = template.description.toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (lowerIntent.includes(word) && word.length > 3) {
          score += 2;
        }
      }
      
      // Check tag matches
      if (template.tags) {
        for (const tag of template.tags) {
          if (lowerIntent.includes(tag.toLowerCase())) {
            score += 3;
          }
        }
      }
      
      // Check for entity type mentions that match template
      const entityTypes = ['site', 'equip', 'point', 'meter', 'sensor', 'ahu', 'vav'];
      for (const entity of entityTypes) {
        if (lowerIntent.includes(entity) && template.template.includes(entity)) {
          score += 4;
        }
      }
      
      // Check for action words that match template purpose
      const actions = {
        'consumption': ['usage', 'consumed', 'consumption', 'energy use'],
        'efficiency': ['efficiency', 'performance', 'cop', 'kw/ton'],
        'fault': ['fault', 'problem', 'issue', 'broken', 'offline', 'down'],
        'export': ['export', 'download', 'extract', 'dump'],
        'history': ['history', 'historical', 'trend', 'over time', 'past'],
        'status': ['status', 'state', 'running', 'online', 'active']
      };
      
      for (const [key, keywords] of Object.entries(actions)) {
        if (template.name.toLowerCase().includes(key) || 
            template.description.toLowerCase().includes(key)) {
          for (const keyword of keywords) {
            if (lowerIntent.includes(keyword)) {
              score += 5;
            }
          }
        }
      }
      
      if (score > 0) {
        scores.set(template.id, score);
      }
    }
    
    // Sort by score and return top matches
    const sortedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    
    return sortedIds
      .slice(0, 5) // Return top 5 matches
      .map(id => this.templates.get(id)!)
      .filter(t => t !== undefined);
  }
  
  /**
   * Validate all template placeholders match parameters
   */
  validateTemplatePlaceholders(template: AxonTemplate): string[] {
    const errors: string[] = [];
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const placeholders = new Set<string>();
    
    // Find all placeholders in template
    let match;
    while ((match = placeholderRegex.exec(template.template)) !== null) {
      placeholders.add(match[1]);
    }
    
    // Check all placeholders have corresponding parameters
    for (const placeholder of placeholders) {
      if (!template.parameters.find(p => p.name === placeholder)) {
        errors.push(`Placeholder '{{${placeholder}}}' has no corresponding parameter`);
      }
    }
    
    // Check all required parameters are used in template
    for (const param of template.parameters) {
      if (param.required !== false && !placeholders.has(param.name)) {
        errors.push(`Required parameter '${param.name}' is not used in template`);
      }
    }
    
    return errors;
  }
  
  /**
   * Get template statistics
   */
  getStatistics(): {
    totalTemplates: number;
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    for (const [cat, templates] of this.templatesByCategory) {
      byCategory[cat] = templates.length;
    }
    
    const byTag: Record<string, number> = {};
    for (const [tag, templates] of this.templatesByTag) {
      byTag[tag] = templates.length;
    }
    
    return {
      totalTemplates: this.templates.size,
      byCategory,
      byTag
    };
  }
}