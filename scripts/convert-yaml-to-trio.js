#!/usr/bin/env node

/**
 * Convert YAML template files to Trio format
 * 
 * Trio is Haystack's native format and handles Axon code naturally
 * without the escaping issues of YAML multiline strings.
 */

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class YamlToTrioConverter {
  constructor() {
    this.converted = 0;
    this.errors = 0;
  }

  /**
   * Convert a value to Trio/Zinc format
   */
  toTrioValue(value) {
    if (value === null || value === undefined) {
      return 'N';
    }
    if (typeof value === 'boolean') {
      return value ? 'T' : 'F';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'string') {
      // Multiline strings are handled separately, not here
      // Escape quotes and return quoted string
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    if (Array.isArray(value)) {
      // Inline array format
      return `[${value.map(v => this.toTrioValue(v)).join(',')}]`;
    }
    if (typeof value === 'object') {
      // Inline dict format
      const entries = Object.entries(value)
        .map(([k, v]) => `${k}:${this.toTrioValue(v)}`)
        .join(',');
      return `{${entries}}`;
    }
    return value.toString();
  }


  /**
   * Convert YAML template to Trio format
   */
  convertToTrio(yamlData) {
    const lines = [];
    
    // Header comment
    lines.push('// Trio Format Template');
    lines.push('// Generated from YAML template');
    lines.push('');
    
    // Basic fields
    lines.push(`id: @${yamlData.id}`);
    lines.push(`name: "${yamlData.name}"`);
    lines.push(`category: "${yamlData.category}"`);
    lines.push(`description: "${yamlData.description}"`);
    
    // Tags
    if (yamlData.tags && yamlData.tags.length > 0) {
      lines.push(`tags: [${yamlData.tags.map(t => `"${t}"`).join(',')}]`);
    }
    
    // Parameters
    if (yamlData.parameters && yamlData.parameters.length > 0) {
      lines.push('');
      lines.push(`parameters: ${this.toTrioValue(yamlData.parameters)}`);
    }
    
    // Template (Axon code)
    if (yamlData.template) {
      lines.push('');
      lines.push('template:');
      // Add each line with proper indentation (2 spaces)
      yamlData.template.split('\n').forEach(line => {
        lines.push('  ' + line);
      });
    }
    
    // Validation
    if (yamlData.validation && yamlData.validation.length > 0) {
      lines.push('');
      lines.push(`validation: ${this.toTrioValue(yamlData.validation)}`);
    }
    
    // Examples
    if (yamlData.examples && yamlData.examples.length > 0) {
      lines.push('');
      lines.push(`examples: ${this.toTrioValue(yamlData.examples)}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Convert a single YAML file to Trio
   */
  convertFile(yamlPath, outputDir) {
    try {
      console.log(`Converting: ${path.basename(yamlPath)}`);
      
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      const yamlData = yaml.load(yamlContent);
      
      if (!yamlData) {
        throw new Error('Empty YAML file');
      }
      
      const trioContent = this.convertToTrio(yamlData);
      
      // Create output path with .trio extension
      const relativePath = path.relative(path.join(__dirname, '..', 'templates'), yamlPath);
      const trioPath = path.join(outputDir, relativePath.replace('.yaml', '.trio'));
      
      // Ensure directory exists
      const trioDir = path.dirname(trioPath);
      if (!fs.existsSync(trioDir)) {
        fs.mkdirSync(trioDir, { recursive: true });
      }
      
      // Write Trio file
      fs.writeFileSync(trioPath, trioContent, 'utf8');
      
      console.log(`  ✓ Created: ${path.relative(outputDir, trioPath)}`);
      this.converted++;
      
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
      this.errors++;
    }
  }

  /**
   * Convert all YAML templates in a directory
   */
  convertDirectory(inputDir, outputDir) {
    const files = fs.readdirSync(inputDir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(inputDir, file.name);
      
      if (file.isDirectory()) {
        this.convertDirectory(fullPath, outputDir);
      } else if (file.name.endsWith('.yaml')) {
        this.convertFile(fullPath, outputDir);
      }
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  const inputDir = args[0] || path.join(__dirname, '..', 'templates');
  const outputDir = args[1] || path.join(__dirname, '..', 'templates-trio');
  
  console.log('YAML to Trio Converter');
  console.log('='.repeat(70));
  console.log(`Input:  ${inputDir}`);
  console.log(`Output: ${outputDir}`);
  console.log('='.repeat(70));
  console.log();
  
  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    process.exit(1);
  }
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const converter = new YamlToTrioConverter();
  converter.convertDirectory(inputDir, outputDir);
  
  console.log();
  console.log('='.repeat(70));
  console.log(`Conversion Complete`);
  console.log(`  Converted: ${converter.converted} files`);
  console.log(`  Errors: ${converter.errors} files`);
  console.log('='.repeat(70));
  
  if (converter.errors > 0) {
    process.exit(1);
  }
}

main().catch(console.error);