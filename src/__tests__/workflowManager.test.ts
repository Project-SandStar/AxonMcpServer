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

  describe('saveProjectWorkflow', () => {
    const good = '---\ntitle: Fan check\ndescription: Check fans\ncategory: ops\nlastVerified: 2026-10-23\n---\n\n# Fan\n';

    test('writes file, updates README index, and loads it', async () => {
      write(root, 'workflows/proj/instA/projA/README.md', '# projA\n\n## Workflows\n\n_None yet._\n');
      const r = await wm.saveProjectWorkflow({ instance: 'instA', project: 'projA', name: 'fan-check', content: good });
      expect(r.id).toBe('proj/instA/projA/fan-check');
      expect(r.created).toBe(true);
      expect(r.warnings).toEqual([]);
      const readme = fs.readFileSync(path.join(root, 'workflows/proj/instA/projA/README.md'), 'utf8');
      expect(readme).toContain('- [Fan check](fan-check.md) — Check fans');
      expect(readme).not.toContain('_None yet._');
      expect(wm.getProjectWorkflowList('instA', 'projA').map(w => w.id)).toContain('proj/instA/projA/fan-check');
    });

    test('refuses to overwrite without overwrite: true, and keeps one index line', async () => {
      await expect(wm.saveProjectWorkflow({ instance: 'instA', project: 'projA', name: 'fan-check', content: good }))
        .rejects.toThrow(/exists/);
      await wm.saveProjectWorkflow({ instance: 'instA', project: 'projA', name: 'fan-check', content: good, overwrite: true });
      const readme = fs.readFileSync(path.join(root, 'workflows/proj/instA/projA/README.md'), 'utf8');
      expect(readme.match(/fan-check\.md/g)).toHaveLength(1);
    });

    test('rejects bad names, missing frontmatter, wrong project, and secrets', async () => {
      const base = { instance: 'instA', project: 'projA' };
      await expect(wm.saveProjectWorkflow({ ...base, name: '../x', content: good })).rejects.toThrow(/Bad workflow name/);
      await expect(wm.saveProjectWorkflow({ ...base, name: 'RULES', content: good })).rejects.toThrow(/Bad workflow name/);
      await expect(wm.saveProjectWorkflow({ ...base, instance: '..', name: 'x', content: good })).rejects.toThrow(/Bad instance/);
      await expect(wm.saveProjectWorkflow({ ...base, name: 'x', content: '# no fm' })).rejects.toThrow(/frontmatter/);
      await expect(wm.saveProjectWorkflow({ ...base, name: 'x', content: good.replace('category: ops\n', 'category: ops\nproject: projB\n') }))
        .rejects.toThrow(/does not match/);
      await expect(wm.saveProjectWorkflow({ ...base, name: 'x', content: good + 'password: hunter2xyz\n' }))
        .rejects.toThrow(/secret/);
    });
  });

  describe('instance workflows', () => {
    const inst = '---\ntitle: Shared door rule\ndescription: Door rule for all projects\ncategory: rules\n---\n\n# Door\n';

    test('proj/<instance>/globalWorkflow/<file>.md applies to every project of that instance only', async () => {
      write(root, 'workflows/proj/instA/globalWorkflow/RULES.md', '# instance rules');
      const r = await wm.saveProjectWorkflow({ instance: 'instA', name: 'door-rule', content: inst });
      expect(r.id).toBe('proj/instA/globalWorkflow/door-rule');
      expect(r.scope).toBe('instance');
      const w = wm.getWorkflow('proj/instA/globalWorkflow/door-rule')!;
      expect(w.metadata.scope).toBe('instance');
      expect(w.metadata.project).toBeUndefined();

      const a = wm.getAllSummaries({ instance: 'instA', project: 'projA' }).map(h => h.id);
      const b = wm.getAllSummaries({ instance: 'instA', project: 'projB' }).map(h => h.id);
      const other = wm.getAllSummaries({ instance: 'instZ', project: 'p' }).map(h => h.id);
      expect(a).toContain('proj/instA/globalWorkflow/door-rule');
      expect(b).toContain('proj/instA/globalWorkflow/door-rule');
      expect(other).not.toContain('proj/instA/globalWorkflow/door-rule');
      // order: project, instance, generic
      expect(a.indexOf('proj/instA/projA/pump-reset')).toBeLessThan(a.indexOf('proj/instA/globalWorkflow/door-rule'));
      expect(a.indexOf('proj/instA/globalWorkflow/door-rule')).toBeLessThan(a.indexOf('generic-one'));
    });

    test('switch helpers list instance workflows and both RULES files', () => {
      const list = wm.getProjectWorkflowList('instA', 'projB');
      expect(list.map(w => w.scope)).toEqual(['project', 'instance']);
      const rules = wm.getProjectRulesPaths('instA', 'projA').map(p => path.relative(root, p));
      expect(rules).toEqual(['workflows/proj/instA/globalWorkflow/RULES.md', 'workflows/proj/instA/projA/RULES.md']);
    });

    test('rejects a project in frontmatter and globalWorkflow as a project', async () => {
      await expect(wm.saveProjectWorkflow({ instance: 'instA', name: 'x', content: inst.replace('category: rules\n', 'category: rules\nproject: projA\n') }))
        .rejects.toThrow(/all projects/);
      await expect(wm.saveProjectWorkflow({ instance: 'instA', project: 'globalWorkflow', name: 'x', content: inst.replace('category: rules\n', 'category: rules\n') }))
        .rejects.toThrow(/not a project/);
    });

    test('loose files in proj/<instance>/ are not loaded', async () => {
      write(root, 'workflows/proj/instA/loose.md', inst);
      await wm.loadWorkflows();
      expect(wm.getWorkflow('proj/instA/loose')).toBeUndefined();
      expect(wm.getWorkflow('proj/instA/globalWorkflow/door-rule')).toBeDefined();
    });
  });
});
