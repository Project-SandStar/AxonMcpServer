import { DocumentSection, HtmlDocument } from '../types/documentation.js';
import * as crypto from 'crypto';
import * as path from 'path';

// Directories that contain Fantom language documentation (not Axon)
// Note: lib-* directories contain Axon function docs and should NOT be filtered
const FANTOM_ONLY_DIRECTORIES = [
  'docLang',      // Fantom language documentation
  'sys',          // Fantom sys pod
  'build',        // Fantom build system
  'compiler',     // Fantom compiler
  'compilerEs',   // Fantom ES compiler
  'concurrent',   // Fantom concurrency
  'fandoc',       // Fantom documentation format
  'graphics',     // Fantom graphics
  'inet',         // Fantom inet pod
  'web',          // Fantom web pod
  'webmod',       // Fantom webmod
  'wisp',         // Fantom wisp server
  'util',         // Fantom util
  'dom',          // Fantom DOM (not domkit lib)
  'domkit',       // Fantom domkit pod
  'docDomkit',    // Fantom domkit docs
  'docFresco',    // Fantom fresco docs
  'email',        // Fantom email pod
  'crypto',       // Fantom crypto pod
  'asn1',         // Fantom ASN.1
  'flux',         // Fantom flux
  'fwt',          // Fantom widget toolkit
  'gfx',          // Fantom graphics
  'icons',        // Icons
  'sql',          // Fantom SQL pod (not lib-sql)
  'xml',          // Fantom XML pod (not lib-xml)
  'yaml',         // Fantom YAML
  'testSys',      // Fantom tests
  'testCompiler', // Fantom tests
  'testJava',     // Fantom tests
  'testNative',   // Fantom tests
  'axon',         // Fantom axon API classes (not Axon functions - those are in lib-axon)
  'haystack',     // Fantom haystack pod API (not lib-haystack)
  'folio',        // Fantom folio pod API
  'hx',           // Fantom hx pod API
  'hxConn',       // Fantom hxConn pod API
  'hxPy',         // Fantom hxPy pod API
  'hxPoint',      // Fantom hxPoint pod API
  'hxUser',       // Fantom hxUser pod API
  'hxHis',        // Fantom hxHis pod API
  'math',         // Fantom math pod
  'obs',          // Fantom obs pod
  'proto',        // Fantom proto pod
  'markdown',     // Markdown docs
  'syntax',       // Syntax docs
  'skyarc',       // Fantom skyarc pod API
  'skyarcd',      // Fantom skyarcd pod API
  'stackhub',     // Fantom stackhub pod API
  'ui',           // Fantom UI pod API
  'xeto',         // Fantom xeto pod API
  'appendix',     // Appendix docs
];

// Patterns that indicate Fantom code (not Axon)
const FANTOM_CODE_PATTERNS = [
  /\bclass\s+\w+\s*:\s*\w+/,           // class Foo : Bar
  /\bclass\s+\w+\s*\{/,                 // class Foo {
  /\bmixin\s+\w+/,                      // mixin Foo
  /\busing\s+\w+::/,                    // using pod::Type
  /^\s*using\s+\w+\s*$/m,               // using pod (standalone line)
  /\b(Void|Str|Bool|Int|Float|Obj|This)\s+\w+\s*\(/,  // Fantom method signatures
  /\b(Void|Str|Bool|Int|Float|Obj)\[\]\??\s+\w+/,      // Fantom array types
  /\b(override|virtual|abstract|native)\s+(Void|Str|Bool|Int)/,  // Fantom modifiers
  /\w+\s*:=\s*\w+/,                     // Fantom := assignment
  /\bnew\s+make\s*\(/,                  // Fantom constructor pattern
  /\bType\.of\s*\(/,                    // Fantom reflection
  /\.toImmutable\b/,                    // Fantom immutable
  /\bIt\s*->/,                          // Fantom It block
  /\bpod\s+\w+\s*\{/,                   // pod definition
  /facet\s+class/,                      // facet class
  /\b\w+\?\s+\w+\s*\(/,                 // Nullable return types like Str? foo()
  /\bconst\s+(Str|Bool|Int|Obj)/,       // const field declarations
  /\.(typeof|with|toStr)\b/,            // Common Fantom methods
  /\becho\s*\(/,                        // echo() is Fantom's print
  /\breturn\s+\w+\.make\b/,             // return Foo.make pattern
];

// Patterns that indicate Axon code
const AXON_CODE_PATTERNS = [
  /=>\s*do\b/,                          // () => do ... end
  /\)\s*=>\s*\w/,                       // (x) => expr
  /\breadAll\s*\(/,                     // readAll(
  /\bread\s*\(/,                        // read(
  /\bfoldCol\s*\(/,                     // foldCol(
  /\bhisRead\s*\(/,                     // hisRead(
  /\btoGrid\s*\(/,                      // toGrid(
  /\btoRecList\s*\(/,                   // toRecList(
  /->[\w]+/,                            // rec->tag
  /\{[\w]+:\s*[\w@"']/,                 // {tag: value} dict literal
  /\.\s*(map|filter|each|find|any|all)\s*\(/,  // Collection functions
  /\bparseNumber\s*\(/,                 // parseNumber(
  /\bparseDate\s*\(/,                   // parseDate(
  /\bcommit\s*\(/,                      // commit(
  /\bdiff\s*\(/,                        // diff(
  /\@[a-f0-9-]+/,                       // Haystack refs @xxx
];

export class HtmlDocParser {
  /**
   * Check if a file path is in a Fantom-only directory
   */
  isFantomOnlyPath(filePath: string): boolean {
    const pathParts = filePath.split('/');
    return pathParts.some(part => FANTOM_ONLY_DIRECTORIES.includes(part));
  }

  /**
   * Check if code appears to be Fantom (not Axon)
   */
  isFantomCode(code: string): boolean {
    // Count matches for each type
    let fantomScore = 0;
    let axonScore = 0;

    for (const pattern of FANTOM_CODE_PATTERNS) {
      if (pattern.test(code)) {
        fantomScore++;
      }
    }

    for (const pattern of AXON_CODE_PATTERNS) {
      if (pattern.test(code)) {
        axonScore++;
      }
    }

    // If more Fantom patterns match than Axon, it's likely Fantom
    return fantomScore > axonScore && fantomScore >= 2;
  }

  /**
   * Parse an HTML documentation file into a structured document
   * Returns null for Fantom-only documentation
   */
  parseDocument(htmlContent: string, filePath: string): HtmlDocument | null {
    try {
      // Skip Fantom-only directories
      if (this.isFantomOnlyPath(filePath)) {
        return null;
      }

      const title = this.extractTitle(htmlContent, filePath);
      const library = this.extractLibrary(filePath);
      const sections = this.extractSections(htmlContent);
      
      // Build full text for indexing
      const fullText = [
        title,
        library,
        ...sections.map(s => `${s.heading} ${s.content} ${s.codeExamples.join(' ')}`)
      ].join(' ');
      
      // Generate unique ID
      const id = crypto.createHash('md5')
        .update(filePath)
        .digest('hex');
      
      // Build file:// URL
      const url = `file://${filePath}`;
      
      return {
        id,
        title,
        library,
        filePath,
        sections,
        fullText,
        url
      };
    } catch (error) {
      console.error(`Error parsing HTML document ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Extract page title from <title> tag or main heading
   */
  private extractTitle(htmlContent: string, filePath: string): string {
    // Try to extract from <title> tag
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.cleanText(titleMatch[1]);
    }
    
    // Try to extract from first <h1> tag
    const h1Match = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      return this.cleanText(h1Match[1]);
    }
    
    // Fall back to filename
    return path.basename(filePath, '.html');
  }
  
  /**
   * Extract library/module name from file path
   * e.g., "/docs/3.1.11/lib-task/doc.html" -> "lib-task"
   */
  private extractLibrary(filePath: string): string {
    const parts = filePath.split('/');
    
    // Look for lib-* pattern or directory name before the file
    for (let i = parts.length - 2; i >= 0; i--) {
      const part = parts[i];
      if (part.startsWith('lib-') || part.startsWith('doc')) {
        return part;
      }
    }
    
    // Return the parent directory name
    return parts[parts.length - 2] || 'unknown';
  }
  
  /**
   * Extract sections from HTML document
   */
  private extractSections(htmlContent: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    
    // Pattern to match h2 and h3 sections with their content
    const sectionPattern = /<h([23])[^>]*(?:id=['"]([^'"]+)['"])?[^>]*>([^<]+)<\/h\1>([\s\S]*?)(?=<h[23]|<\/div>|$)/gi;
    
    let match;
    let sectionIndex = 0;
    
    while ((match = sectionPattern.exec(htmlContent)) !== null) {
      const level = parseInt(match[1]);
      const id = match[2] || `section-${sectionIndex}`;
      const heading = this.cleanText(match[3]);
      const sectionContent = match[4];
      
      // Extract text content (paragraphs, lists)
      const content = this.extractTextContent(sectionContent);
      
      // Extract code examples from this section
      const codeExamples = this.extractCodeExamples(sectionContent);
      
      sections.push({
        id,
        heading,
        level,
        content,
        codeExamples
      });
      
      sectionIndex++;
    }
    
    // If no sections found, try to extract all paragraphs as a single section
    if (sections.length === 0) {
      const content = this.extractTextContent(htmlContent);
      const codeExamples = this.extractCodeExamples(htmlContent);
      
      if (content || codeExamples.length > 0) {
        sections.push({
          id: 'main-content',
          heading: 'Overview',
          level: 1,
          content,
          codeExamples
        });
      }
    }
    
    return sections;
  }
  
  /**
   * Extract text content from HTML (paragraphs, lists, etc.)
   */
  private extractTextContent(html: string): string {
    const textParts: string[] = [];
    
    // Extract paragraphs
    const pPattern = /<p[^>]*>([\\s\\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pPattern.exec(html)) !== null) {
      const text = this.cleanText(pMatch[1]);
      if (text.trim()) {
        textParts.push(text);
      }
    }
    
    // Extract list items
    const liPattern = /<li[^>]*>([\\s\\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liPattern.exec(html)) !== null) {
      const text = this.cleanText(liMatch[1]);
      if (text.trim()) {
        textParts.push(text);
      }
    }
    
    return textParts.join(' ');
  }
  
  /**
   * Extract code examples from <pre> tags, filtering out Fantom code
   */
  private extractCodeExamples(html: string): string[] {
    const examples: string[] = [];
    const prePattern = /<pre[^>]*>([\\s\\S]*?)<\/pre>/gi;

    let match;
    while ((match = prePattern.exec(html)) !== null) {
      const code = this.cleanCodeBlock(match[1]);
      if (code.trim()) {
        // Skip Fantom code examples
        if (!this.isFantomCode(code)) {
          examples.push(code);
        }
      }
    }

    return examples;
  }
  
  /**
   * Clean HTML entities and tags from text
   */
  private cleanText(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }
  
  /**
   * Clean code blocks, preserving important whitespace
   */
  private cleanCodeBlock(code: string): string {
    return code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .trim();
  }
}
