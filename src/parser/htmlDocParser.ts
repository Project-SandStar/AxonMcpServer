import { DocumentSection, HtmlDocument } from '../types/documentation.js';
import * as crypto from 'crypto';
import * as path from 'path';
import { htmlToMarkdown } from 'mdream';

/** Bump when parse output changes; old doc caches are then rebuilt. */
export const DOC_PARSER_VERSION = 2;

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
   * Parse an HTML documentation file into a structured document.
   * The page is converted to Markdown (mdream), SkySpark chrome is stripped,
   * and the Markdown is split into sections at h1-h3 headings.
   * Returns null for Fantom-only documentation.
   *
   * @param docsRoot docsPath root; used to build the docId (e.g. "docFresco/Nav").
   */
  parseDocument(htmlContent: string, filePath: string, docsRoot?: string): HtmlDocument | null {
    try {
      if (this.isFantomOnlyPath(filePath)) {
        return null;
      }

      const docId = HtmlDocParser.docIdFor(filePath, docsRoot);
      const library = this.extractLibrary(filePath);
      const markdown = this.toMarkdown(htmlContent, docId);
      const anchors = this.extractHeadingAnchors(htmlContent);
      const sections = this.splitSections(markdown, anchors);
      const title = this.extractTitle(htmlContent, filePath, markdown);

      const fullText = [
        title,
        library,
        ...sections.map(s => `${s.heading} ${s.content}`),
      ].join(' ');

      const id = crypto.createHash('md5').update(filePath).digest('hex');

      return {
        id,
        docId,
        title,
        library,
        filePath,
        sections,
        fullText,
        url: `doc://${docId}`,
      };
    } catch (error) {
      console.error(`Error parsing HTML document ${filePath}:`, error);
      return null;
    }
  }

  /**
   * docId = path relative to the docs root, without the leading version dir
   * (e.g. "3.1.11/") and without ".html". Without a root: "<parentDir>/<name>".
   */
  static docIdFor(filePath: string, docsRoot?: string): string {
    const noExt = filePath.replace(/\.html?$/i, '');
    if (docsRoot) {
      const rel = path.relative(path.resolve(docsRoot), path.resolve(noExt));
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        const parts = rel.split(/[\\/]+/);
        if (parts.length > 2 && /^\d+(\.\d+)*$/.test(parts[0])) parts.shift();
        return parts.join('/');
      }
    }
    const parts = noExt.split(/[\\/]+/);
    return parts.slice(-2).join('/');
  }

  /**
   * Convert page HTML to Markdown, without the SkySpark nav/footer chrome.
   * Relative doc links are rewritten to doc://<docId> URIs.
   */
  toMarkdown(htmlContent: string, docId: string): string {
    // Drop the page head and HTML comments (breadcrumb comment) before conversion.
    const body = htmlContent
      .replace(/<head[\s\S]*?<\/head>/i, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    let md = htmlToMarkdown(body, {
      filter: { exclude: ['.defc-nav', '.defc-footer-ts', '.defc-footer', 'hr', 'script', 'style', 'nav'] },
    });

    const lines = md.split('\n');
    const out: string[] = [];
    let inFence = false;
    for (const line of lines) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      // In-page TOC line: "[Overview](Nav.html) • [UiMeta](#uiMeta) • ..."
      if (!inFence && /^\s*\[[^\]]+\]\([^)]*\)\s*•/.test(line)) continue;
      out.push(line);
    }
    md = out.join('\n');

    const dir = docId.includes('/') ? docId.slice(0, docId.lastIndexOf('/')) : '';
    md = md.replace(/\]\(([^)\s]+?)\.html(#[^)\s]*)?\)/g, (all, target: string, hash?: string) => {
      if (/^[a-z]+:/i.test(target)) return all; // absolute URL
      const resolved = path.posix.normalize(path.posix.join(dir || '.', target));
      if (resolved.startsWith('..')) return all;
      return `](doc://${resolved}${hash || ''})`;
    });

    return md.replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Heading anchors (id attributes) in document order, for h1-h3. */
  private extractHeadingAnchors(htmlContent: string): Array<{ level: number; id?: string }> {
    const anchors: Array<{ level: number; id?: string }> = [];
    const re = /<h([1-3])\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(htmlContent)) !== null) {
      const idMatch = m[2].match(/\bid=['"]([^'"]+)['"]/i);
      anchors.push({ level: parseInt(m[1], 10), id: idMatch ? idMatch[1] : undefined });
    }
    return anchors;
  }

  /**
   * Split Markdown into sections at h1-h3 headings. Content before the first
   * heading becomes an "Overview" section. Empty sections are dropped.
   */
  splitSections(markdown: string, anchors: Array<{ level: number; id?: string }> = []): DocumentSection[] {
    type Draft = { heading: string; level: number; anchor?: string; lines: string[] };
    const drafts: Draft[] = [];
    let current: Draft = { heading: 'Overview', level: 1, anchor: 'overview', lines: [] };
    let inFence = false;
    let anchorPos = 0;

    for (const line of markdown.split('\n')) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      const h = !inFence ? line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/) : null;
      if (h) {
        drafts.push(current);
        const level = h[1].length;
        // Pair with the next HTML heading anchor of the same level.
        let anchor: string | undefined;
        for (let i = anchorPos; i < anchors.length; i++) {
          if (anchors[i].level === level) { anchor = anchors[i].id; anchorPos = i + 1; break; }
        }
        current = { heading: HtmlDocParser.stripLinks(h[2]), level, anchor, lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    drafts.push(current);

    const sections: DocumentSection[] = [];
    const used = new Set<string>();
    for (const d of drafts) {
      const content = d.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!content) continue;
      let id = d.anchor || HtmlDocParser.slug(d.heading) || `section-${sections.length}`;
      while (used.has(id)) id = `${id}-${sections.length}`;
      used.add(id);
      sections.push({
        id,
        heading: d.heading,
        level: d.level,
        content,
        codeExamples: this.extractCodeExamples(content),
      });
    }
    return sections;
  }

  static stripLinks(text: string): string {
    return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim();
  }

  static slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * Page title: first Markdown h1, else <title> without the " – SkySpark" suffix, else file name.
   */
  private extractTitle(htmlContent: string, filePath: string, markdown?: string): string {
    const h1 = markdown?.match(/^#\s+(.+)$/m);
    if (h1) return HtmlDocParser.stripLinks(h1[1]);
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.cleanText(titleMatch[1]).replace(/\s+[–-]\s+[^–-]+$/, '').trim() || path.basename(filePath, '.html');
    }
    return path.basename(filePath, '.html');
  }

  /**
   * Extract library/module name from file path
   * e.g., "/docs/3.1.11/lib-task/doc.html" -> "lib-task"
   */
  private extractLibrary(filePath: string): string {
    const parts = filePath.split('/');
    for (let i = parts.length - 2; i >= 0; i--) {
      const part = parts[i];
      if (part.startsWith('lib-') || part.startsWith('doc')) {
        return part;
      }
    }
    return parts[parts.length - 2] || 'unknown';
  }

  /** Fenced code blocks from Markdown, without Fantom code. */
  private extractCodeExamples(markdown: string): string[] {
    const examples: string[] = [];
    const re = /```[^\n]*\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(markdown)) !== null) {
      const code = m[1].replace(/\s+$/, '');
      if (code.trim() && !this.isFantomCode(code)) examples.push(code);
    }
    return examples;
  }

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
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
