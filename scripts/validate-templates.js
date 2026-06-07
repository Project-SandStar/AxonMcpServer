#!/usr/bin/env node

/**
 * Template Validation Script
 * Validates all Axon templates for schema compliance, YAML syntax, and correctness
 */

import fs from 'fs';
import path from 'path';
import { readTrioTemplate, readAllTrioTemplates } from './load-trio-templates.js';
import { AxonParser, AxonValidator } from './axon-parser-full.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class TemplateValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.stats = {
      totalTemplates: 0,
      validTemplates: 0,
      totalErrors: 0,
      totalWarnings: 0,
      byCategory: {}
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  error(templatePath, message) {
    this.errors.push({ templatePath, message });
    this.stats.totalErrors++;
  }

  warn(templatePath, message) {
    this.warnings.push({ templatePath, message });
    this.stats.totalWarnings++;
  }

  // Required schema fields
  getRequiredFields() {
    return ['id', 'name', 'category', 'description', 'parameters', 'template', 'examples'];
  }

  // Valid parameter types
  getValidParameterTypes() {
    return ['string', 'number', 'boolean', 'array', 'object'];
  }

  // Valid categories
  getValidCategories() {
    return ['energy', 'hvac', 'fault', 'data'];
  }

  // Validate Trio syntax
  validateTrio(filePath) {
    try {
      const parsed = readTrioTemplate(filePath);
      return { valid: true, data: parsed };
    } catch (e) {
      this.error(filePath, `Trio Syntax Error: ${e.message}`);
      return { valid: false, data: null };
    }
  }

  // Validate schema structure
  validateSchema(filePath, template) {
    const required = this.getRequiredFields();
    const missing = required.filter(field => !template[field]);
    
    if (missing.length > 0) {
      this.error(filePath, `Missing required fields: ${missing.join(', ')}`);
      return false;
    }
    
    return true;
  }

  // Validate ID format
  validateId(filePath, id) {
    // Handle Trio ref format {_kind: 'ref', val: 'id'}
    let idStr = id;
    if (typeof id === 'object' && id._kind === 'ref') {
      idStr = id.val;
    }
    
    if (typeof idStr !== 'string') {
      this.error(filePath, 'ID must be a string');
      return false;
    }
    
    if (!/^[a-z0-9-]+$/.test(idStr)) {
      this.error(filePath, `ID "${idStr}" contains invalid characters (use lowercase, numbers, hyphens only)`);
      return false;
    }
    
    // Check if ID matches filename
    const filename = path.basename(filePath, '.trio');
    if (idStr !== filename) {
      this.warn(filePath, `ID "${idStr}" doesn't match filename "${filename}"`);
    }
    
    return true;
  }

  // Validate category
  validateCategory(filePath, category) {
    const valid = this.getValidCategories();
    if (!valid.includes(category)) {
      this.error(filePath, `Invalid category "${category}". Must be one of: ${valid.join(', ')}`);
      return false;
    }
    
    return true;
  }

  // Validate parameters
  validateParameters(filePath, parameters) {
    if (!Array.isArray(parameters)) {
      this.error(filePath, 'Parameters must be an array');
      return false;
    }
    
    if (parameters.length === 0) {
      this.warn(filePath, 'Template has no parameters');
    }
    
    const paramNames = new Set();
    const validTypes = this.getValidParameterTypes();
    
    parameters.forEach((param, idx) => {
      // Check required parameter fields
      if (!param.name) {
        this.error(filePath, `Parameter at index ${idx} missing "name" field`);
        return;
      }
      
      if (!param.type) {
        this.error(filePath, `Parameter "${param.name}" missing "type" field`);
      }
      
      if (!param.description) {
        this.warn(filePath, `Parameter "${param.name}" missing description`);
      }
      
      // Check for duplicate parameter names
      if (paramNames.has(param.name)) {
        this.error(filePath, `Duplicate parameter name: "${param.name}"`);
      }
      paramNames.add(param.name);
      
      // Validate parameter type
      if (param.type && !validTypes.includes(param.type)) {
        this.error(filePath, `Parameter "${param.name}" has invalid type "${param.type}". Must be one of: ${validTypes.join(', ')}`);
      }
      
      // Check required field consistency
      if (param.required === true && param.default !== undefined) {
        this.warn(filePath, `Parameter "${param.name}" is marked required but has a default value`);
      }
      
      // Validate examples
      if (!param.examples || param.examples.length === 0) {
        this.warn(filePath, `Parameter "${param.name}" has no examples`);
      }
    });
    
    return paramNames;
  }

  // Validate template code
  validateTemplate(filePath, templateCode, paramNames) {
    if (typeof templateCode !== 'string') {
      this.error(filePath, 'Template must be a string');
      return false;
    }
    
    if (templateCode.trim().length === 0) {
      this.error(filePath, 'Template code is empty');
      return false;
    }
    
    // Check for placeholder format
    const placeholderRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const placeholders = new Set();
    let match;
    
    while ((match = placeholderRegex.exec(templateCode)) !== null) {
      placeholders.add(match[1]);
    }
    
    // Check if all placeholders match parameter names
    placeholders.forEach(placeholder => {
      if (!paramNames.has(placeholder)) {
        this.error(filePath, `Template uses placeholder "{{${placeholder}}}" but no parameter with that name exists`);
      }
    });
    
    // Check if all parameters are used in template
    paramNames.forEach(paramName => {
      if (!placeholders.has(paramName)) {
        this.warn(filePath, `Parameter "${paramName}" is defined but not used in template`);
      }
    });
    
    // Basic Axon syntax checks
    if (!templateCode.includes('=>') && !templateCode.includes('do')) {
      this.warn(filePath, 'Template may not be valid Axon code (missing => or do)');
    }
    
    // Use full AST parser for comprehensive validation
    try {
      const parser = new AxonParser(templateCode);
      const ast = parser.parse();
      
      // Run validation
      const validator = new AxonValidator(ast);
      const validationResult = validator.validate();
      
      if (!validationResult.balanced) {
        validationResult.errors.forEach(err => {
          this.error(filePath, `Axon syntax: ${err.message}`);
        });
      }
    } catch (e) {
      // Parser error - template has syntax issues
      this.error(filePath, `Axon parsing failed: ${e.message}`);
    }
    
    // Check for proper function definition
    const firstLine = templateCode.trim().split('\n')[0];
    if (!firstLine.includes('=>')) {
      this.warn(filePath, 'Template should start with function definition using =>');
    }
    
    return true;
  }

  // Validate examples
  validateExamples(filePath, examples, paramNames) {
    if (!Array.isArray(examples)) {
      this.error(filePath, 'Examples must be an array');
      return false;
    }
    
    if (examples.length === 0) {
      this.warn(filePath, 'Template has no examples');
      return true;
    }
    
    examples.forEach((example, idx) => {
      if (!example.name) {
        this.error(filePath, `Example at index ${idx} missing "name" field`);
      }
      
      if (!example.description) {
        this.warn(filePath, `Example "${example.name || idx}" missing description`);
      }
      
      if (!example.params) {
        this.error(filePath, `Example "${example.name || idx}" missing "params" field`);
        return;
      }
      
      // Check if example params match defined parameters
      const exampleParams = new Set(Object.keys(example.params));
      
      // Find required parameters without defaults
      paramNames.forEach(paramName => {
        // This is simplified - would need to look up actual parameter to check if required
        if (!exampleParams.has(paramName)) {
          // This is just a warning since params might have defaults
          // this.warn(filePath, `Example "${example.name}" doesn't include parameter "${paramName}"`);
        }
      });
      
      // Check for params in example that don't exist in definition
      exampleParams.forEach(exampleParam => {
        if (!paramNames.has(exampleParam)) {
          this.error(filePath, `Example "${example.name || idx}" uses undefined parameter "${exampleParam}"`);
        }
      });
    });
    
    return true;
  }

  // Validate tags
  validateTags(filePath, tags) {
    if (!tags) {
      this.warn(filePath, 'Template has no tags');
      return true;
    }
    
    if (!Array.isArray(tags)) {
      this.error(filePath, 'Tags must be an array');
      return false;
    }
    
    if (tags.length === 0) {
      this.warn(filePath, 'Tags array is empty');
    }
    
    return true;
  }

  // Validate a single template file
  validateTemplateFile(filePath) {
    this.log(`\nValidating: ${path.relative(process.cwd(), filePath)}`, 'cyan');
    
    try {
      // Parse Trio
      const { valid, data: template } = this.validateTrio(filePath);
      if (!valid) return false;
      
      // Validate schema
      if (!this.validateSchema(filePath, template)) return false;
      
      // Validate individual fields
      this.validateId(filePath, template.id);
      this.validateCategory(filePath, template.category);
      const paramNames = this.validateParameters(filePath, template.parameters);
      this.validateTemplate(filePath, template.template, paramNames);
      this.validateExamples(filePath, template.examples, paramNames);
      this.validateTags(filePath, template.tags);
      
      // Count by category
      const category = template.category;
      if (!this.stats.byCategory[category]) {
        this.stats.byCategory[category] = { total: 0, valid: 0, errors: 0, warnings: 0 };
      }
      this.stats.byCategory[category].total++;
      
      return true;
      
    } catch (e) {
      this.error(filePath, `Unexpected error: ${e.message}`);
      return false;
    }
  }

  // Find all template files
  findTemplateFiles(dir) {
    const files = [];
    
    const scan = (directory) => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.trio')) {
          files.push(fullPath);
        }
      }
    };
    
    scan(dir);
    return files;
  }

  // Run validation on all templates
  validate(templatesDir) {
    this.log(`\n${'='.repeat(70)}`, 'bold');
    this.log('  AXON TEMPLATE VALIDATION', 'bold');
    this.log(`${'='.repeat(70)}\n`, 'bold');
    
    const templateFiles = this.findTemplateFiles(templatesDir);
    this.stats.totalTemplates = templateFiles.length;
    
    this.log(`Found ${templateFiles.length} template files\n`, 'blue');
    
    for (const filePath of templateFiles) {
      const isValid = this.validateTemplateFile(filePath);
      if (isValid) {
        this.stats.validTemplates++;
      }
    }
    
    return this.printReport();
  }

  // Print validation report
  printReport() {
    this.log(`\n${'='.repeat(70)}`, 'bold');
    this.log('  VALIDATION REPORT', 'bold');
    this.log(`${'='.repeat(70)}\n`, 'bold');
    
    // Summary statistics
    this.log('Summary:', 'bold');
    this.log(`  Total Templates: ${this.stats.totalTemplates}`);
    this.log(`  Valid Templates: ${this.stats.validTemplates}`, 'green');
    this.log(`  Total Errors:    ${this.stats.totalErrors}`, this.stats.totalErrors > 0 ? 'red' : 'green');
    this.log(`  Total Warnings:  ${this.stats.totalWarnings}`, this.stats.totalWarnings > 0 ? 'yellow' : 'green');
    
    // By category
    if (Object.keys(this.stats.byCategory).length > 0) {
      this.log('\nBy Category:', 'bold');
      Object.entries(this.stats.byCategory).forEach(([category, stats]) => {
        this.log(`  ${category.padEnd(15)}: ${stats.total} templates`);
      });
    }
    
    // Errors
    if (this.errors.length > 0) {
      this.log(`\n${'─'.repeat(70)}`, 'red');
      this.log(`Errors (${this.errors.length}):`, 'red');
      this.log(`${'─'.repeat(70)}`, 'red');
      this.errors.forEach(({ templatePath, message }) => {
        const relPath = path.relative(process.cwd(), templatePath);
        this.log(`  ✗ ${relPath}`, 'red');
        this.log(`    ${message}`, 'red');
      });
    }
    
    // Warnings
    if (this.warnings.length > 0) {
      this.log(`\n${'─'.repeat(70)}`, 'yellow');
      this.log(`Warnings (${this.warnings.length}):`, 'yellow');
      this.log(`${'─'.repeat(70)}`, 'yellow');
      this.warnings.forEach(({ templatePath, message }) => {
        const relPath = path.relative(process.cwd(), templatePath);
        this.log(`  ⚠ ${relPath}`, 'yellow');
        this.log(`    ${message}`, 'yellow');
      });
    }
    
    // Final result
    this.log(`\n${'='.repeat(70)}`, 'bold');
    if (this.stats.totalErrors === 0) {
      this.log('  ✓ VALIDATION PASSED', 'green');
      if (this.stats.totalWarnings > 0) {
        this.log(`  (${this.stats.totalWarnings} warnings)`, 'yellow');
      }
    } else {
      this.log('  ✗ VALIDATION FAILED', 'red');
      this.log(`  Please fix ${this.stats.totalErrors} error(s)`, 'red');
    }
    this.log(`${'='.repeat(70)}\n`, 'bold');
    
    return this.stats.totalErrors === 0;
  }
}

// Main execution
function main() {
  const templatesDir = path.join(__dirname, '../templates');
  
  if (!fs.existsSync(templatesDir)) {
    console.error(`Error: Templates directory not found at ${templatesDir}`);
    process.exit(1);
  }
  
  const validator = new TemplateValidator();
  const success = validator.validate(templatesDir);
  
  process.exit(success ? 0 : 1);
}

// Run the validation
main();

export default TemplateValidator;
