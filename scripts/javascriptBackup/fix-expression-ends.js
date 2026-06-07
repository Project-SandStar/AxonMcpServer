#!/usr/bin/env node

/**
 * Auto-fix script to remove extra 'end' keywords from expression-style if statements
 * 
 * Expression-style if: if (condition) value else value
 * Block-style if: if (condition) do ... end
 * 
 * This script identifies and removes 'end' keywords that appear after expression-style if statements.
 */

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExpressionEndFixer {
  constructor() {
    this.fixes = [];
  }

  /**
   * Fix extra 'end' keywords in expression-style if statements
   * 
   * Expression-style if: if (condition) value else value
   * Block-style if: if (condition) do ... end
   * Block-style if-else: if (condition) do ... else ... end  
   * 
   * The key insight: if there's no 'do' after the 'if', then any 'end' is wrong
   */
  fixTemplate(code) {
    const lines = code.split('\n');
    const fixed = [];
    let changesCount = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const originalLine = line;
      
      // Pattern: Single-line expression-style if with 'end'
      // Match: if (condition) value else value end
      // This pattern has if, else, end all on the same line, but no 'do'
      if (line.includes('if') && line.includes('else') && line.includes('end') && !line.includes('do')) {
        // Check if this is truly an expression-style if by ensuring no 'do' keyword
        // Pattern: if (...) ... else ... end
        const ifElseEndPattern = /\bif\s*\([^)]+\)[^{]*\belse\b[^{]*\bend\b/;
        
        if (ifElseEndPattern.test(line)) {
          // Remove the 'end' keyword
          line = line.replace(/\bend\b\s*(?=\s*[,})\]]|$)/, '');
          if (line !== originalLine) {
            changesCount++;
            this.fixes.push({
              line: i + 1,
              before: originalLine.trim(),
              after: line.trim(),
              type: 'inline-expression-if'
            });
          }
        }
      }
      
      fixed.push(line);
    }

    if (changesCount > 0) {
      console.log(`  Fixed ${changesCount} expression-style if statements`);
    }

    return fixed.join('\n');
  }

  fixFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const doc = yaml.load(content);
      
      if (!doc.template) {
        console.log(`  Skipping (no template field)`);
        return false;
      }

      this.fixes = [];
      const originalTemplate = doc.template;
      const fixedTemplate = this.fixTemplate(originalTemplate);
      
      if (fixedTemplate !== originalTemplate) {
        // Update the template
        doc.template = fixedTemplate;
        
        // Write back to file
        const newContent = yaml.dump(doc, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false
        });
        
        fs.writeFileSync(filePath, newContent, 'utf8');
        
        console.log(`  ✓ Fixed ${this.fixes.length} issue(s)`);
        this.fixes.forEach(fix => {
          console.log(`    Line ${fix.line}: ${fix.type}`);
          console.log(`      Before: ${fix.before}`);
          console.log(`      After:  ${fix.after}`);
        });
        
        return true;
      } else {
        console.log(`  No fixes needed`);
        return false;
      }
      
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
      return false;
    }
  }
}

// Main execution
async function main() {
  const templatesDir = path.join(__dirname, '..', 'templates');
  
  // Get list of templates with errors from validation
  const failingTemplates = [
    'data/report-kpi-dashboard.yaml',
    'energy/energy-baseline-comparison.yaml',
    'energy/energy-budget-tracking.yaml',
    'fault/fault-comfort-deviation.yaml',
    'fault/fault-communication-loss.yaml',
    'fault/fault-energy-spike.yaml',
    'fault/fault-equipment-offline.yaml',
    'hvac/hvac-boiler-performance.yaml',
    'hvac/hvac-chiller-efficiency.yaml',
    'hvac/hvac-economizer-analysis.yaml',
    'hvac/hvac-setpoint-optimization.yaml',
    'hvac/hvac-simultaneous-heating-cooling.yaml',
    'hvac/hvac-ventilation-check.yaml'
  ];

  console.log('Fixing expression-style if statements with extra end keywords...\n');
  
  const fixer = new ExpressionEndFixer();
  let fixedCount = 0;
  
  for (const template of failingTemplates) {
    const filePath = path.join(templatesDir, template);
    console.log(`\nProcessing: ${template}`);
    
    if (fixer.fixFile(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Fixed ${fixedCount} of ${failingTemplates.length} templates`);
  console.log(`${'='.repeat(70)}`);
  console.log('\nRun validation again to check results:');
  console.log('  node scripts/validate-templates.js');
}

main().catch(console.error);