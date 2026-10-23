import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkflowManager } from '../workflows/workflowManager.js';

function write(root: string, rel: string, body: string) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

const fm = (extra = '') => `---\ntitle: T\ndescription: D\ncategory: ops\ntags: [pump]\n${extra}---\n\n# Body\n`;

describe('WorkflowManager project workflows', () => {
  let root: string;
  let wm: WorkflowManager;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
    write(root, 'workflows/generic-one.md', fm());
    write(root, 'workflows/proj/README.md', '# index');
    write(root, 'workflows/proj/_template.md', fm());
    write(root, 'workflows/proj/instA/projA/README.md', '# index');
    write(root, 'workflows/proj/instA/projA/RULES.md', '# rules');
    write(root, 'workflows/proj/instA/projA/pump-reset.md', fm('lastVerified: 2026-10-01\n'));
    write(root, 'workflows/proj/instA/projB/other.md', fm());
    wm = new WorkflowManager(path.join(root, 'workflows'), path.join(root, '.cache'));
    await wm.loadWorkflows();
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  test('loads generic and project workflows, skips README/RULES/_ files', () => {
    const ids = wm.getWorkflowList().map(w => w.metadata.id).sort();
    expect(ids).toEqual([
      'generic-one',
      'proj/instA/projA/pump-reset',
      'proj/instA/projB/other',
    ]);
  });

  test('takes instance/project from the folder path', () => {
    const w = wm.getWorkflow('proj/instA/projA/pump-reset')!;
    expect(w.metadata.scope).toBe('project');
    expect(w.metadata.instance).toBe('instA');
    expect(w.metadata.project).toBe('projA');
    expect(w.metadata.lastVerified).toBe('2026-10-01');
    expect(wm.getWorkflow('generic-one')!.metadata.scope).toBe('generic');
  });

  test('no project: generic only', () => {
    const ids = wm.searchSummaries({}).map(h => h.id);
    expect(ids).toEqual(['generic-one']);
  });

  test('active project: its workflows first, other projects hidden', () => {
    const hits = wm.searchSummaries({ query: 'T', project: { instance: 'instA', project: 'projA' } });
    expect(hits.map(h => h.id)).toEqual(['proj/instA/projA/pump-reset', 'generic-one']);
    const list = wm.getAllSummaries({ instance: 'instA', project: 'projA' }).map(h => h.id);
    expect(list).toEqual(['proj/instA/projA/pump-reset', 'generic-one']);
  });

  test("'*' returns every workflow", () => {
    expect(wm.getAllSummaries('*')).toHaveLength(3);
  });
});
