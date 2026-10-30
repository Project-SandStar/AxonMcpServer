/**
 * Docs: Markdown sections, section pick, incremental index update, changes hook for docs roots.
 * Run with `npm run test:esm` (mdream is ESM-only).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { HtmlDocParser } from '../parser/htmlDocParser.js';
import { FlexSearchDocIndex } from '../search/flexSearchIndex.js';
import { applyDocChanges, docsFingerprint, pickDocSections, DocChangeQueue } from '../search/docIndexer.js';
import { createChangesRouter } from '../admin/changesRouter.js';

const page = (title: string, body: string) => `<!DOCTYPE html>
<html><head><title>${title} &ndash; Skyspark</title></head>
<body>
<div class='defc-nav'><a href='../index.html'>Home</a> » <a href='index.html'>Docs</a></div>
<div class='defc-main'>
<h1>${title}</h1>
<p><a href='${title}.html'>Overview</a> • <a href='#units'>Units</a></p>
${body}
</div>
<hr/><p class='defc-footer-ts'>Skyspark 3.1.11 ∙ 05-Jun-2025</p>
</body></html>`;

const NAV = page('Nav', `
<h2 id='overview'>Overview</h2>
<p>Fresco provides navigation. See <a href='../lib-ui/uiMeta.html'>uiMeta</a>.</p>
<h2 id='tagNav'>Tag Nav</h2>
<p>Tag navigation uses these tags:</p>
<table><tr><th>Tag</th><th>Meaning</th></tr><tr><td>siteRef</td><td>site</td></tr></table>
<h3 id='tagNavEx'>Example</h3>
<pre>readAll(site).map(s =&gt; s->dis)</pre>
<h2 id='ordering'>Ordering</h2>
<p>Order by dis.</p>`);

let tmp: string;
let docsRoot: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'));
  docsRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docsRoot, '3.1.11', 'docFresco'), { recursive: true });
  fs.writeFileSync(path.join(docsRoot, '3.1.11', 'docFresco', 'Nav.html'), NAV);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('HtmlDocParser (Markdown)', () => {
  const parser = new HtmlDocParser();

  test('sections have content, tables and code; chrome stripped', () => {
    const file = path.join(docsRoot, '3.1.11', 'docFresco', 'Nav.html');
    const doc = parser.parseDocument(NAV, file, docsRoot)!;
    expect(doc.docId).toBe('docFresco/Nav');
    expect(doc.url).toBe('doc://docFresco/Nav');
    expect(doc.library).toBe('docFresco');
    expect(doc.title).toBe('Nav');
    expect(doc.sections.length).toBeGreaterThanOrEqual(3);
    for (const s of doc.sections) expect(s.content.trim()).not.toBe('');
    const tag = doc.sections.find(s => s.id === 'tagNav')!;
    expect(tag.heading).toBe('Tag Nav');
    expect(tag.content).toMatch(/\|\s*Tag\s*\|\s*Meaning\s*\|/);
    expect(tag.content).toMatch(/\|\s*-+\s*\|/);
    const ex = doc.sections.find(s => s.id === 'tagNavEx')!;
    expect(ex.level).toBe(3);
    expect(ex.codeExamples[0]).toContain('readAll(site)');
    expect(doc.fullText).not.toContain('Home');
    expect(doc.fullText).not.toContain('05-Jun-2025');
    expect(doc.fullText).toContain('doc://lib-ui/uiMeta');
  });

  test('pickDocSections by anchor, heading and substring, with sub-sections', () => {
    const doc = parser.parseDocument(NAV, path.join(docsRoot, '3.1.11', 'docFresco', 'Nav.html'), docsRoot)!;
    const byId = pickDocSections(doc, 'tagNav')!;
    expect(byId.map(s => s.id)).toEqual(['tagNav', 'tagNavEx']);
    expect(pickDocSections(doc, 'Ordering')!.map(s => s.id)).toEqual(['ordering']);
    expect(pickDocSections(doc, 'tag n')![0].id).toBe('tagNav');
    expect(pickDocSections(doc, 'nope')).toBeNull();
  });
});

describe('incremental doc index', () => {
  test('add, update, remove; fingerprint changes', async () => {
    const parser = new HtmlDocParser();
    const index = new FlexSearchDocIndex();
    const fp1 = docsFingerprint(docsRoot);

    let r = await applyDocChanges(index, parser, docsRoot, ['3.1.11/docFresco/Nav.html']);
    expect(r.added).toBe(1);
    expect(index.getByDocId('docFresco/Nav')).not.toBeNull();

    const newFile = path.join(docsRoot, '3.1.11', 'docFresco', 'Zap.html');
    fs.writeFileSync(newFile, page('Zap', `<h2 id='overview'>Overview</h2><p>Zebrafrog widget.</p>`));
    expect(docsFingerprint(docsRoot).fileCount).toBe(fp1.fileCount + 1);

    r = await applyDocChanges(index, parser, docsRoot, ['3.1.11/docFresco/Zap.html', '3.1.11/docFresco/Nav.html', '../x.html']);
    expect(r).toMatchObject({ added: 1, updated: 1, removed: 0 });
    expect(r.errors.join()).toMatch(/Unsafe/);
    expect((await index.search('zebrafrog')).map(x => x.document.docId)).toEqual(['docFresco/Zap']);

    fs.unlinkSync(newFile);
    r = await applyDocChanges(index, parser, docsRoot, ['3.1.11/docFresco/Zap.html']);
    expect(r.removed).toBe(1);
    expect(index.getByDocId('docFresco/Zap')).toBeNull();
    expect(await index.search('zebrafrog')).toEqual([]);
    expect(index.libraryCounts()).toEqual({ docFresco: 1 });
  });

  test('DocChangeQueue merges a burst into one run', async () => {
    const calls: string[][] = [];
    const q = new DocChangeQueue(async p => { calls.push(p); return { added: 0, updated: 0, removed: 0, skipped: 0, errors: [], durationMs: 0 }; }, 50);
    q.enqueue(['a.html']);
    q.enqueue(['b.html', 'a.html']);
    await q.flush();
    expect(calls).toEqual([['a.html', 'b.html']]);
  });
});

describe('changes hook: docs root', () => {
  let server: Server;
  let base: string;
  const seen: Array<{ paths: string[]; rootPath: string }> = [];

  beforeAll(() => {
    const { router } = createChangesRouter({
      getPrisma: async (): Promise<any> => { throw new Error('prisma must not be used for docs roots'); },
      token: () => 'tok',
      config: () => ({
        mirrorDir: '/mirror',
        roots: [
          { sidecar: 'mac-alper-axon', root: 'axon-docs', kind: 'docs', path: '/mirror/lib/docs' },
          { sidecar: 'mac-alper-axon', root: 'axon-library', kind: 'library', path: '/mirror/lib/axon-library' },
        ],
      }),
      onDocsChange: (paths: string[], rootPath: string) => { seen.push({ paths, rootPath }); return { queued: paths.length }; },
    });
    const app = express();
    app.use(express.json());
    app.use('/admin/changes', router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(r => server.close(() => r())));

  const post = (body: unknown) => fetch(`${base}/admin/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: JSON.stringify(body),
  });

  test('axon-docs root goes to onDocsChange', async () => {
    const res = await post({ sidecar: 'mac-alper-axon', root: 'axon-docs', paths: ['3.1.11/docFresco/Nav.html'] });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ kind: 'docs', root: 'axon-docs', queued: 1 });
    expect(seen).toEqual([{ paths: ['3.1.11/docFresco/Nav.html'], rootPath: '/mirror/lib/docs' }]);
  });

  test('library root without handler -> 501', async () => {
    const res = await post({ sidecar: 'mac-alper-axon', root: 'axon-library', paths: ['a.axon'] });
    expect(res.status).toBe(501);
  });
});
