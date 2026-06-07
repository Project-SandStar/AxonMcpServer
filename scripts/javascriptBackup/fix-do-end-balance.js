#!/usr/bin/env node

/**
 * Automated script to fix unbalanced do/end blocks in Axon templates
 * 
 * This script analyzes Axon code and attempts to automatically balance
 * do/end blocks by finding the most likely locations for missing ends.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

class DoEndBalancer {
  constructor(content, filePath) {
    this.content = content;
    this.filePath = filePath;
    this.lines = content.split('\n');
  }

  /**
   * Parse the template and extract the Axon code
   */
  parseTemplate() {
    try {
      const doc = yaml.parse(this.content);
      if (!doc.template) {
        return null;
      }
      return doc.template;
    } catch (e) {
      return null;
    }
  }

  /**
   * Analyze do/end balance in the code
   */
  analyzeBalance(code) {
    const lines = code.split('\n');
    const blocks = [];
    let doCount = 0;
    let endCount = 0;

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Count 'do' keywords (but not in comments or strings)
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // Match 'do' as a word boundary
      const doMatches = cleanLine.match(/\bdo\b/g);
      if (doMatches) {
        doCount += doMatches.length;
        doMatches.forEach(() => {
          blocks.push({ type: 'do', line: lineNum, text: line.trim(), depth: blocks.filter(b => b.type === 'do' && !b.closed).length });
        });
      }

      // Match 'end' as a word boundary
      const endMatches = cleanLine.match(/\bend\b/g);
      if (endMatches) {
        endCount += endMatches.length;
        endMatches.forEach(() => {
          blocks.push({ type: 'end', line: lineNum, text: line.trim(), depth: blocks.filter(b => b.type === 'do' && !b.closed).length - 1 });
          // Mark the most recent unclosed 'do' as closed
          for (let i = blocks.length - 2; i >= 0; i--) {
            if (blocks[i].type === 'do' && !blocks[i].closed) {
              blocks[i].closed = true;
              break;
            }
          }
        });
      }
    });

    return { doCount, endCount, blocks, unclosedDos: blocks.filter(b => b.type === 'do' && !b.closed) };
  }

  /**
   * Remove comments and strings from a line to avoid false matches
   */
  removeCommentsAndStrings(line) {
    // Remove // comments
    line = line.replace(/\/\/.*$/, '');
    // Remove strings in quotes (simple approach)
    line = line.replace(/"[^"]*"/g, '""');
    line = line.replace(/'[^']*'/g, "''");
    return line;
  }

  /**
   * Find likely locations to add missing 'end' keywords
   */
  suggestEndLocations(code) {
    const analysis = this.analyzeBalance(code);
    const { doCount, endCount, unclosedDos } = analysis;
    
    if (doCount === endCount) {
      return { balanced: true, suggestions: [] };
    }

    const missingEnds = doCount - endCount;
    const extraEnds = endCount - doCount;

    if (missingEnds > 0) {
      // We need to add 'end' keywords
      const suggestions = this.findEndInsertionPoints(code, unclosedDos, missingEnds);
      return { balanced: false, missingEnds, suggestions };
    } else {
      // We have extra 'end' keywords - need to remove them
      const suggestions = this.findExtraEnds(code, Math.abs(extraEnds));
      return { balanced: false, extraEnds: Math.abs(extraEnds), suggestions };
    }
  }

  /**
   * Find where to insert missing 'end' keywords
   */
  findEndInsertionPoints(code, unclosedDos, count) {
    const lines = code.split('\n');
    const suggestions = [];

    // Strategy 1: Look for control flow blocks that likely need ends
    unclosedDos.slice(-count).forEach(doBlock => {
      const startLine = doBlock.line;
      
      // Look for the next significant statement at the same or lower indentation
      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//')) continue;

        // Look for control flow keywords that suggest end of a block
        if (trimmed.match(/^\s*(else|catch|end)/)) {
          suggestions.push({
            line: i,
            before: trimmed,
            reason: `Unclosed 'do' from line ${startLine}. Insert 'end' before this ${trimmed.split(/\s+/)[0]} statement.`,
            insertBefore: true
          });
          break;
        }

        // Look for closing of parent structure
        if (i - startLine > 20) { // Don't look too far
          suggestions.push({
            line: i,
            before: trimmed,
            reason: `Unclosed 'do' from line ${startLine}. Suggest inserting 'end' around line ${i}.`,
            insertBefore: true
          });
          break;
        }
      }
    });

    return suggestions;
  }

  /**
   * Find extra 'end' keywords that should be removed
   */
  findExtraEnds(code, count) {
    const lines = code.split('\n');
    const suggestions = [];
    let endsFound = 0;

    // Look for suspicious 'end' keywords
    for (let i = lines.length - 1; i >= 0 && endsFound < count; i--) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Look for lines with multiple 'end' keywords
      const endMatches = trimmed.match(/\bend\b/g);
      if (endMatches && endMatches.length > 1) {
        suggestions.push({
          line: i + 1,
          text: trimmed,
          endCount: endMatches.length,
          reason: `Line has ${endMatches.length} 'end' keywords. Consider if all are necessary.`
        });
        endsFound += endMatches.length - 1;
      }
    }

    return suggestions;
  }

  /**
   * Automatically fix the template (best effort)
   */
  autoFix() {
    const template = this.parseTemplate();
    if (!template) {
      return { success: false, error: 'Could not parse template YAML' };
    }

    const analysis = this.suggestEndLocations(template);
    
    if (analysis.balanced) {
      return { success: true, message: 'Template is already balanced!', changes: [] };
    }

    // Apply fixes
    const changes = [];
    const templateLines = template.split('\n');

    if (analysis.missingEnds) {
      // Add missing ends
      analysis.suggestions.forEach(suggestion => {
        if (suggestion.insertBefore) {
          const indent = templateLines[suggestion.line - 1].match(/^\s*/)[0];
          templateLines.splice(suggestion.line - 1, 0, `${indent}end`);
          changes.push(`Added 'end' before line ${suggestion.line}: ${suggestion.before}`);
        }
      });
    } else if (analysis.extraEnds) {
      // Remove extra ends - remove as many as needed
      let remainingToRemove = analysis.extraEnds;
      
      // Sort suggestions by line number (descending) to avoid line number shifts
      const sortedSuggestions = [...analysis.suggestions].sort((a, b) => b.line - a.line);
      
      sortedSuggestions.forEach(suggestion => {
        if (remainingToRemove <= 0) return;
        
        const lineIdx = suggestion.line - 1;
        const line = templateLines[lineIdx];
        const endCount = (line.match(/\bend\b/g) || []).length;
        
        if (endCount > 1) {
          // Remove as many ends as needed (but leave at least one)
          const toRemove = Math.min(endCount - 1, remainingToRemove);
          let modifiedLine = line;
          
          for (let i = 0; i < toRemove; i++) {
            modifiedLine = modifiedLine.replace(/\bend\b/, '');
          }
          
          templateLines[lineIdx] = modifiedLine;
          changes.push(`Removed ${toRemove} 'end'(s) from line ${suggestion.line}`);
          remainingToRemove -= toRemove;
        }
      });
      
      // If we still have extra ends to remove, look for any line with 'end'
      if (remainingToRemove > 0) {
        for (let i = templateLines.length - 1; i >= 0 && remainingToRemove > 0; i--) {
          const line = templateLines[i];
          const trimmed = line.trim();
          
          // Look for standalone 'end' keywords
          if (trimmed === 'end' || trimmed === 'end,' || trimmed.match(/^\s*end\s*$/)) {
            templateLines[i] = '';
            changes.push(`Removed standalone 'end' from line ${i + 1}`);
            remainingToRemove--;
          }
        }
      }
    }

    // Reconstruct the template
    const fixedTemplate = templateLines.join('\n');
    
    // Update the full YAML document
    const doc = yaml.parse(this.content);
    doc.template = fixedTemplate;
    const fixedContent = yaml.stringify(doc, { lineWidth: 0 });

    return { success: true, fixedContent, changes, analysis };
  }
}

/**
 * Process a single template file
 */
function processFile(filePath, autoFix = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const balancer = new DoEndBalancer(content, filePath);
  
  const template = balancer.parseTemplate();
  if (!template) {
    console.log(`⚠️  Skipping ${filePath}: Could not parse YAML`);
    return null;
  }

  const result = balancer.suggestEndLocations(template);
  
  if (result.balanced) {
    console.log(`✅ ${path.basename(filePath)}: Balanced`);
    return null;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 ${path.basename(filePath)}`);
  console.log(`${'='.repeat(70)}`);

  if (result.missingEnds) {
    console.log(`❌ Missing ${result.missingEnds} 'end' keyword(s)\n`);
    console.log(`Suggestions:`);
    result.suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. Line ${s.line}: ${s.reason}`);
      console.log(`     Before: ${s.before}`);
    });
  } else if (result.extraEnds) {
    console.log(`❌ ${result.extraEnds} extra 'end' keyword(s)\n`);
    console.log(`Suggestions:`);
    result.suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. Line ${s.line}: ${s.reason}`);
      console.log(`     ${s.text}`);
    });
  }

  if (autoFix) {
    console.log(`\n🔧 Attempting auto-fix...`);
    const fixResult = balancer.autoFix();
    
    if (fixResult.success && fixResult.changes) {
      console.log(`✅ Auto-fix applied:`);
      fixResult.changes.forEach(change => console.log(`   - ${change}`));
      
      // Write the fixed content back
      fs.writeFileSync(filePath, fixResult.fixedContent, 'utf-8');
      console.log(`📝 File updated: ${filePath}`);
      return { filePath, changes: fixResult.changes };
    }
  }

  return null;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const autoFix = args.includes('--fix');
  const templatesDir = args.find(arg => !arg.startsWith('--')) || 'templates';

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  DO/END BALANCE ANALYZER ${autoFix ? '& AUTO-FIX' : ''}`);
  console.log(`${'='.repeat(70)}\n`);

  // Find all template files
  const findTemplates = (dir) => {
    const files = [];
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findTemplates(fullPath));
      } else if (item.endsWith('.yaml')) {
        files.push(fullPath);
      }
    });
    
    return files;
  };

  const templateFiles = findTemplates(templatesDir);
  console.log(`Found ${templateFiles.length} template files\n`);

  const results = templateFiles.map(file => processFile(file, autoFix)).filter(r => r !== null);

  if (results.length > 0) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Fixed ${results.length} template(s)`);
    
    if (autoFix) {
      console.log(`\n✅ Run validation again to verify fixes:`);
      console.log(`   node scripts/validate-templates.js`);
    } else {
      console.log(`\n💡 To automatically apply fixes, run:`);
      console.log(`   node scripts/fix-do-end-balance.js --fix`);
    }
  } else {
    console.log(`\n✅ All templates are balanced!`);
  }
}

main();