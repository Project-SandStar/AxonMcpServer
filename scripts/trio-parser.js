#!/usr/bin/env node

/**
 * Simple Trio Format Parser
 * 
 * Parses Project Haystack Trio format files
 * Specifically designed for reading Axon template files
 */

export class TrioParser {
  constructor(content) {
    this.content = content;
    this.lines = content.split('\n');
    this.pos = 0;
  }

  /**
   * Parse a Trio file into a JavaScript object
   */
  parse() {
    const result = {};
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('//')) {
        this.pos++;
        continue;
      }
      
      // Parse field: value
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const field = line.substring(0, colonIndex).trim();
        const valueStart = line.substring(colonIndex + 1).trim();
        
        // Check if value is multiline (Axon or other)
        if (valueStart === 'Axon <:') {
          result[field] = this.parseAxonBlock();
        } else if (valueStart === '[' || valueStart.startsWith('[')) {
          // Could be inline array or multiline array
          if (valueStart === '[') {
            // Multiline array
            result[field] = this.parseMultilineArray();
          } else {
            // Inline array
            result[field] = this.parseInlineArray(valueStart);
          }
        } else {
          result[field] = this.parseValue(valueStart);
        }
      } else {
        this.pos++;
      }
    }
    
    return result;
  }

  /**
   * Parse an Axon multiline block
   */
  parseAxonBlock() {
    this.pos++; // Skip the "Axon <:" line
    const lines = [];
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      if (line.trim() === ':>') {
        this.pos++;
        break;
      }
      lines.push(line);
      this.pos++;
    }
    
    return lines.join('\n');
  }

  /**
   * Parse a multiline array (starting with [ on its own line)
   */
  parseMultilineArray() {
    this.pos++; // Skip the "[" line
    const items = [];
    let inObject = false;
    let objectLines = [];
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('//')) {
        this.pos++;
        continue;
      }
      
      // End of array
      if (trimmed === ']') {
        this.pos++;
        break;
      }
      
      // Start of object in array
      if (trimmed === '{') {
        inObject = true;
        objectLines = [];
        this.pos++;
        continue;
      }
      
      // End of object in array
      if (trimmed === '}' || trimmed === '},') {
        if (inObject && objectLines.length > 0) {
          items.push(this.parseObjectLines(objectLines));
        }
        inObject = false;
        objectLines = [];
        this.pos++;
        continue;
      }
      
      // Inside object: collect lines
      if (inObject) {
        objectLines.push(line);
        this.pos++;
        continue;
      }
      
      // Simple value in array (not in object)
      if (trimmed && !trimmed.startsWith('//')) {
        items.push(this.parseValue(trimmed.replace(/,$/, '')));
      }
      
      this.pos++;
    }
    
    return items;
  }

  /**
   * Parse an object from collected lines
   */
  parseObjectLines(lines) {
    const obj = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        // Field with colon: field: value
        const field = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();
        
        // Remove trailing comma
        if (value.endsWith(',')) {
          value = value.substring(0, value.length - 1).trim();
        }
        
        // Handle nested structures
        if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array
          obj[field] = this.parseInlineArray(value);
        } else {
          obj[field] = this.parseValue(value);
        }
      } else {
        // Field without colon (just field name with implicit true)
        const field = trimmed.replace(/,$/, '').trim();
        if (field) {
          obj[field] = true;
        }
      }
    }
    
    return obj;
  }

  /**
   * Parse an inline array: [value, value]
   */
  parseInlineArray(str) {
    const content = str.substring(1, str.length - 1); // Remove []
    return content.split(',').map(v => this.parseValue(v.trim()));
  }

  /**
   * Parse a single value
   */
  parseValue(str) {
    str = str.trim();
    
    // Remove trailing comma
    if (str.endsWith(',')) {
      str = str.substring(0, str.length - 1).trim();
    }
    
    // String (quoted)
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.substring(1, str.length - 1).replace(/\\"/g, '"');
    }
    
    // Ref (starts with @)
    if (str.startsWith('@')) {
      return str.substring(1);
    }
    
    // Boolean
    if (str === 'true') return true;
    if (str === 'false') return false;
    
    // Null
    if (str === 'null') return null;
    
    // Number
    if (/^-?\d+(\.\d+)?$/.test(str)) {
      return parseFloat(str);
    }
    
    // Default: return as string
    return str;
  }
}

/**
 * Read and parse a Trio file
 */
export async function readTrioFile(filePath) {
  const fs = await import('fs');
  const content = fs.default.readFileSync(filePath, 'utf8');
  const parser = new TrioParser(content);
  return parser.parse();
}

/**
 * Synchronously read and parse a Trio file
 */
export function readTrioFileSync(filePath) {
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf8');
  const parser = new TrioParser(content);
  return parser.parse();
}

/**
 * Read all Trio template files from a directory
 */
export async function readTrioTemplates(dirPath) {
  const fs = await import('fs');
  const path = await import('path');
  
  const templates = [];
  
  function scanDirectory(dir) {
    const entries = fs.default.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.default.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.name.endsWith('.trio')) {
        try {
          const content = fs.default.readFileSync(fullPath, 'utf8');
          const parser = new TrioParser(content);
          const template = parser.parse();
          template._file = fullPath;
          templates.push(template);
        } catch (e) {
          console.error(`Error reading ${fullPath}: ${e.message}`);
        }
      }
    }
  }
  
  scanDirectory(dirPath);
  return templates;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const fs = await import('fs');
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('Usage: node trio-parser.js <trio-file>');
      console.log('       node trio-parser.js <directory>');
      process.exit(1);
    }
    
    const target = args[0];
    const stat = fs.default.statSync(target);
    
    if (stat.isDirectory()) {
      console.log('Reading all Trio templates...\n');
      const templates = await readTrioTemplates(target);
      console.log(`Found ${templates.length} templates:\n`);
      templates.forEach(t => {
        console.log(`  - ${t.id || 'unnamed'}: ${t.name || 'No name'}`);
      });
    } else {
      const content = fs.default.readFileSync(target, 'utf8');
      const parser = new TrioParser(content);
      const result = parser.parse();
      console.log(JSON.stringify(result, null, 2));
    }
  })();
}
