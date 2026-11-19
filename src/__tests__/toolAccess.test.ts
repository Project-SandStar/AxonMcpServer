/**
 * The role rule for MCP tools, and the user store parts it depends on.
 * No network, no SkySpark. All names are made up.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ADMIN_TOOLS, READ_TOOLS, WRITE_TOOLS, parseAnonymousRole, toolDenied } from '../auth/toolAccess.js';
import { UserStore, isUserRole } from '../admin/userStore.js';

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

/** The tool names of the dispatcher: every case label of `switch (name)`. */
function dispatcherTools(): string[] {
  const start = indexSource.indexOf('switch (name) {');
  const end = indexSource.indexOf('`Unknown tool: ${name}`', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return [...indexSource.slice(start, end).matchAll(/^\s+case '([A-Za-z]+)':/gm)].map(m => m[1]);
}

describe('tool lists', () => {
  test('the two lists together name every tool of the dispatcher, each one once', () => {
    const tools = dispatcherTools();
    expect(tools.length).toBeGreaterThan(40);
    expect(new Set(tools).size).toBe(tools.length);
    const listed = [...READ_TOOLS, ...WRITE_TOOLS];
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...tools].sort());
  });

  test('every tool that runs caller-given Axon or changes shared state is a write tool', () => {
    for (const tool of [
      'executeAxonCode', 'commitAxonFunction', 'saveProjectWorkflow', 'clearProjectCache', 'setPrimaryProject',
      'reauthenticateSkySparkProject', 'buildProjectGraph', 'buildProjectEmbeddings', 'queryHaystack',
      'getProjectSchema', 'discoverInstanceProjects',
    ]) {
      expect(WRITE_TOOLS).toContain(tool);
    }
    expect(READ_TOOLS).toContain('switchSkySparkProject');
    expect(READ_TOOLS).toContain('discoverProjectFunctions');
  });

  test('the gate runs before the call is tracked and before the tool runs', () => {
    const handler = indexSource.indexOf('server.setRequestHandler(CallToolRequestSchema');
    const gate = indexSource.indexOf('toolDenied(name,', handler);
    const track = indexSource.indexOf('this.usageTracker.trackToolCall(', handler);
    const dispatch = indexSource.indexOf('switch (name) {', handler);
    expect(handler).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(handler);
    expect(gate).toBeLessThan(track);
    expect(track).toBeLessThan(dispatch);
  });
});

describe('toolDenied', () => {
  test('a read-only user cannot call a write tool; the text names the tool', () => {
    for (const tool of WRITE_TOOLS) {
      const text = toolDenied(tool, 'readonly');
      expect(text).toContain('read-only');
      expect(text).toContain(tool);
    }
  });

  test('a read-only user can call every read tool', () => {
    for (const tool of READ_TOOLS) expect(toolDenied(tool, 'readonly')).toBeNull();
  });

  test('a tool on no list is refused for a read-only user', () => {
    expect(toolDenied('someNewTool', 'readonly')).toContain('someNewTool');
    expect(toolDenied('', 'readonly')).not.toBeNull();
  });

  test('user and admin have no rule here (except the admin tools for a user)', () => {
    for (const role of ['user', 'admin'] as const) {
      for (const tool of [...WRITE_TOOLS, ...READ_TOOLS, 'someNewTool'].filter(t => role === 'admin' || !ADMIN_TOOLS.includes(t))) expect(toolDenied(tool, role)).toBeNull();
    }
  });

  test('a call with no token is read-only by default: no write tool, every read tool', () => {
    for (const role of [undefined, null] as const) {
      for (const tool of WRITE_TOOLS) {
        const text = toolDenied(tool, role);
        expect(text).toContain(tool);
        expect(text).toContain('access key');
      }
      for (const tool of READ_TOOLS) expect(toolDenied(tool, role)).toBeNull();
      expect(toolDenied('someNewTool', role)).not.toBeNull();
    }
  });

  test('MCP_ANONYMOUS_ROLE=user lets a call with no token use every tool', () => {
    for (const tool of [...WRITE_TOOLS, ...READ_TOOLS, 'someNewTool']) expect(toolDenied(tool, undefined, 'user')).toBeNull();
  });

  test('the anonymous role never widens a read-only user', () => {
    for (const tool of WRITE_TOOLS) expect(toolDenied(tool, 'readonly', 'user')).not.toBeNull();
  });

  test('the tool handler passes the anonymous role from the config', () => {
    const handler = indexSource.indexOf('server.setRequestHandler(CallToolRequestSchema');
    const gate = indexSource.slice(handler, indexSource.indexOf('this.usageTracker.trackToolCall(', handler));
    expect(gate).toMatch(/toolDenied\(name,\s*this\.sessionScope\.getStore\(\)\?\.role,\s*this\.config\.mcpAnonymousRole \?\? 'readonly'\)/);
  });
});

describe('MCP_ANONYMOUS_ROLE', () => {
  test('unset or blank: no override; user and readonly are read; anything else is invalid', () => {
    expect(parseAnonymousRole(undefined)).toBeUndefined();
    expect(parseAnonymousRole('  ')).toBeUndefined();
    expect(parseAnonymousRole('user')).toBe('user');
    expect(parseAnonymousRole(' readonly ')).toBe('readonly');
    for (const bad of ['admin', 'USER', 'yes', 'true']) expect(parseAnonymousRole(bad)).toBe('invalid');
  });

  test('config.ts reads the variable with parseAnonymousRole and never stores an invalid value', () => {
    const configSource = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.ts'), 'utf8');
    expect(configSource).toContain('parseAnonymousRole(process.env.MCP_ANONYMOUS_ROLE)');
    expect(configSource).toMatch(/=== 'invalid'\)\s*\{[^}]*console\.error/);
  });
});

describe('user store: roles and the disabled flag', () => {
  let tmp: string;
  let store: UserStore;
  let logSpy: jest.SpyInstance;
  const file = () => path.join(tmp, 'users.json');

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-users-'));
    store = new UserStore(tmp); // makes the default admin
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  test('three roles', () => {
    expect(['admin', 'user', 'readonly'].every(isUserRole)).toBe(true);
    expect(['root', '', 'Admin', null, undefined, 5].some(isUserRole)).toBe(false);
    expect(store.createUser('rita', 'rita-password', 'readonly')).toMatchObject({ username: 'rita', role: 'readonly', disabled: false });
    expect(store.updateRole('rita', 'user')).toBe(true);
    expect(store.updateRole('rita', 'readonly')).toBe(true);
    expect(store.getUser('rita')?.role).toBe('readonly');
    expect(store.authenticate('rita', 'rita-password')?.role).toBe('readonly');
  });

  test('getUserById finds the user and never gives the password hash', () => {
    const alice = store.createUser('alice', 'alice-password')!;
    expect(store.getUserById(alice.id)).toMatchObject({ id: alice.id, username: 'alice', role: 'user', disabled: false });
    expect(JSON.stringify(store.getUserById(alice.id))).not.toContain('passwordHash');
    expect(store.getUserById('no-such-id')).toBeNull();
    expect(store.getUserById('')).toBeNull();
  });

  test('a user made again with the same name has a new id', () => {
    const first = store.createUser('alice', 'alice-password')!;
    expect(store.deleteUser('alice')).toBe(true);
    const second = store.createUser('alice', 'alice-password')!;
    expect(second.id).not.toBe(first.id);
    expect(store.getUserById(first.id)).toBeNull();
  });

  test('a disabled user cannot log in; enable brings the login back', () => {
    store.createUser('alice', 'alice-password');
    expect(store.authenticate('alice', 'alice-password')).not.toBeNull();
    expect(store.setDisabled('ALICE', true)).toBe(true);
    expect(store.getUser('alice')?.disabled).toBe(true);
    expect(store.authenticate('alice', 'alice-password')).toBeNull();
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).users.find((u: any) => u.username === 'alice').disabled).toBe(true);

    // The flag is still there after a restart.
    expect(new UserStore(tmp).authenticate('alice', 'alice-password')).toBeNull();

    expect(store.setDisabled('alice', false)).toBe(true);
    expect(store.authenticate('alice', 'alice-password')).not.toBeNull();
    expect('disabled' in JSON.parse(fs.readFileSync(file(), 'utf8')).users.find((u: any) => u.username === 'alice')).toBe(false);
    expect(store.setDisabled('nobody', true)).toBe(false);
  });

  test('the last admin who is enabled and can log in cannot be disabled', () => {
    expect(store.setDisabled('admin', true)).toBe(false);
    expect(store.getUser('admin')?.disabled).toBe(false);

    store.createUser('bob', 'bob-password', 'admin');
    expect(store.setDisabled('bob', true)).toBe(true);
    // bob is an admin, but disabled: admin is again the last one.
    expect(store.setDisabled('admin', true)).toBe(false);
    expect(store.setDisabled('bob', false)).toBe(true);

    // An admin with no dashboard login does not count.
    store.setDashboardLogin('bob', false);
    expect(store.setDisabled('admin', true)).toBe(false);
    store.setDashboardLogin('bob', true);
    expect(store.setDisabled('admin', true)).toBe(true);
    expect(store.setDisabled('bob', true)).toBe(false);
  });

  test('the last working admin cannot lose the admin role or be deleted; a disabled admin does not count', () => {
    store.createUser('bob', 'bob-password', 'admin');
    expect(store.setDisabled('bob', true)).toBe(true);
    // bob is disabled, so admin is the last working admin.
    expect(store.isLastWorkingAdmin('admin')).toBe(true);
    expect(store.updateRole('admin', 'user')).toBe(false);
    expect(store.deleteUser('admin')).toBe(false);
    expect(store.getUser('admin')?.role).toBe('admin');
    // A disabled admin can be demoted or deleted.
    expect(store.updateRole('bob', 'user')).toBe(true);
    // An admin with no dashboard login does not count either.
    store.createUser('dora', 'dora-password', 'admin');
    store.setDashboardLogin('dora', false);
    expect(store.updateRole('admin', 'readonly')).toBe(false);
    // With a second working admin the first can be demoted.
    store.setDashboardLogin('dora', true);
    expect(store.updateRole('admin', 'user')).toBe(true);
    expect(store.isLastWorkingAdmin('dora')).toBe(true);
  });

  test('an old users.json with no disabled field loads as enabled and is not rewritten', () => {
    const old = {
      users: [
        { id: 'id-1', username: 'admin', passwordHash: 'x', role: 'admin', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'id-2', username: 'alice', passwordHash: 'y', role: 'user', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    };
    const text = JSON.stringify(old, null, 2);
    fs.writeFileSync(file(), text);
    const loaded = new UserStore(tmp);
    expect(loaded.getAllUsers().map(u => [u.username, u.role, u.disabled])).toEqual([['admin', 'admin', false], ['alice', 'user', false]]);
    expect(loaded.getUserById('id-2')?.username).toBe('alice');
    expect(fs.readFileSync(file(), 'utf8')).toBe(text);
  });
});

describe('admin-only tools', () => {
  test('discover and cache clear need an admin when the call has a key', () => {
    expect([...ADMIN_TOOLS].sort()).toEqual(['clearProjectCache', 'discoverInstanceProjects']);
    for (const tool of ADMIN_TOOLS) {
      expect(WRITE_TOOLS).toContain(tool);
      expect(toolDenied(tool, 'admin')).toBeNull();
      expect(toolDenied(tool, 'user')).toContain('needs an admin');
      expect(toolDenied(tool, 'readonly')).not.toBeNull();
    }
  });

  test('set primary project, reauth and sync stay open to a user', () => {
    for (const tool of ['setPrimaryProject', 'reauthenticateSkySparkProject', 'executeAxonCode', 'commitAxonFunction'])
      expect(toolDenied(tool, 'user')).toBeNull();
  });

  test('a call with no token follows MCP_ANONYMOUS_ROLE for the admin tools, as before', () => {
    for (const tool of ADMIN_TOOLS) {
      expect(toolDenied(tool, undefined, 'user')).toBeNull();
      expect(toolDenied(tool, undefined, 'readonly')).not.toBeNull();
    }
  });
});
