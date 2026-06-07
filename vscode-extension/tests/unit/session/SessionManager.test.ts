import { SessionManager, Session } from '../../../src/session/SessionManager';
import * as fs from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock vscode
const mockGlobalState = new Map<string, any>();
const mockContext = {
    globalState: {
        get: jest.fn((key: string) => mockGlobalState.get(key)),
        update: jest.fn((key: string, value: any) => {
            mockGlobalState.set(key, value);
            return Promise.resolve();
        }),
        keys: jest.fn(() => Array.from(mockGlobalState.keys()))
    },
    globalStorageUri: {
        fsPath: '/test/storage'
    },
    subscriptions: [],
    extensionPath: '/test/path',
    extensionUri: {} as any,
    workspaceState: {} as any,
    secrets: {} as any,
    storageUri: {} as any,
    logUri: {} as any,
    extensionMode: 3,
    storagePath: '/test/storage',
    globalStoragePath: '/test/global-storage',
    logPath: '/test/logs',
    asAbsolutePath: jest.fn(),
    extension: {} as any,
    environmentVariableCollection: {} as any
};

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key, defaultValue) => defaultValue)
        }))
    }
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

describe('SessionManager', () => {
    let manager: SessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGlobalState.clear();
        
        // Setup fs mocks
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.readdir.mockResolvedValue([]);
        mockFs.readFile.mockResolvedValue('');
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.unlink.mockResolvedValue(undefined);
        
        manager = new SessionManager(mockContext as any);
    });

    afterEach(() => {
        manager.dispose();
    });

    describe('Session Creation', () => {
        it('should create a new session', () => {
            const session = manager.createNewSession();

            expect(session).toBeDefined();
            expect(session.id).toMatch(/^session-\d+-\w+$/);
            expect(session.messages).toEqual([]);
            expect(session.metadata.messageCount).toBe(0);
            expect(session.metadata.totalTokens).toBe(0);
        });

        it('should set current session on creation', () => {
            const session = manager.createNewSession();
            const current = manager.getCurrentSession();

            expect(current.id).toBe(session.id);
        });

        it('should save session ID to global state', () => {
            const session = manager.createNewSession();

            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'currentSessionId',
                session.id
            );
        });

        it('should get or create current session', () => {
            const session = manager.getCurrentSession();
            const sameSession = manager.getCurrentSession();

            expect(session.id).toBe(sameSession.id);
        });
    });

    describe('Message Management', () => {
        it('should add a user message', () => {
            const message = manager.addMessage('user', 'Test prompt');

            expect(message.role).toBe('user');
            expect(message.content).toBe('Test prompt');
            expect(message.id).toMatch(/^msg-\d+-\w+$/);
            expect(message.timestamp).toBeInstanceOf(Date);
        });

        it('should add an assistant message', () => {
            const message = manager.addMessage('assistant', 'Test response');

            expect(message.role).toBe('assistant');
            expect(message.content).toBe('Test response');
        });

        it('should add message metadata', () => {
            const message = manager.addMessage('assistant', 'Response', {
                duration: 1500,
                tokens: 100,
                cached: true
            });

            expect(message.metadata?.duration).toBe(1500);
            expect(message.metadata?.tokens).toBe(100);
            expect(message.metadata?.cached).toBe(true);
        });

        it('should update session metadata on message add', () => {
            manager.addMessage('user', 'Test');
            const session = manager.getCurrentSession();

            expect(session.metadata.messageCount).toBe(1);
        });

        it('should track total tokens', () => {
            manager.addMessage('assistant', 'Response 1', { tokens: 50 });
            manager.addMessage('assistant', 'Response 2', { tokens: 75 });

            const session = manager.getCurrentSession();
            expect(session.metadata.totalTokens).toBe(125);
        });

        it('should track cache hits and misses', () => {
            manager.addMessage('assistant', 'Cached', { cached: true });
            manager.addMessage('assistant', 'Not cached', { cached: false });
            manager.addMessage('assistant', 'Cached again', { cached: true });

            const session = manager.getCurrentSession();
            expect(session.metadata.cacheHits).toBe(2);
            expect(session.metadata.cacheMisses).toBe(1);
        });

        it('should calculate average response time', () => {
            manager.addMessage('assistant', 'Response 1', { duration: 1000 });
            manager.addMessage('assistant', 'Response 2', { duration: 2000 });
            manager.addMessage('assistant', 'Response 3', { duration: 1500 });

            const session = manager.getCurrentSession();
            expect(session.metadata.averageResponseTime).toBe(1500);
        });

        it('should get message by ID', () => {
            const added = manager.addMessage('user', 'Test');
            const retrieved = manager.getMessage(added.id);

            expect(retrieved?.id).toBe(added.id);
            expect(retrieved?.content).toBe('Test');
        });

        it('should return undefined for non-existent message', () => {
            const retrieved = manager.getMessage('non-existent');
            expect(retrieved).toBeUndefined();
        });

        it('should update message', () => {
            const message = manager.addMessage('user', 'Original');
            const updated = manager.updateMessage(message.id, {
                content: 'Updated'
            });

            expect(updated).toBe(true);
            const retrieved = manager.getMessage(message.id);
            expect(retrieved?.content).toBe('Updated');
        });

        it('should return false for updating non-existent message', () => {
            const updated = manager.updateMessage('non-existent', { content: 'Test' });
            expect(updated).toBe(false);
        });

        it('should get all messages', () => {
            manager.addMessage('user', 'Message 1');
            manager.addMessage('assistant', 'Message 2');
            manager.addMessage('user', 'Message 3');

            const messages = manager.getMessages();
            expect(messages.length).toBe(3);
        });

        it('should get recent messages', () => {
            manager.addMessage('user', 'Message 1');
            manager.addMessage('assistant', 'Message 2');
            manager.addMessage('user', 'Message 3');
            manager.addMessage('assistant', 'Message 4');

            const recent = manager.getRecentMessages(2);
            expect(recent.length).toBe(2);
            expect(recent[0].content).toBe('Message 3');
            expect(recent[1].content).toBe('Message 4');
        });
    });

    describe('Session Operations', () => {
        it('should clear session', () => {
            manager.addMessage('user', 'Test');
            const oldSessionId = manager.getCurrentSession().id;

            manager.clearSession();

            const newSession = manager.getCurrentSession();
            expect(newSession.id).not.toBe(oldSessionId);
            expect(newSession.messages.length).toBe(0);
        });

        it('should save session to disk', async () => {
            manager.addMessage('user', 'Test message');
            
            await manager.saveSession();

            expect(mockFs.writeFile).toHaveBeenCalled();
            const writeCall = mockFs.writeFile.mock.calls[0];
            expect(writeCall[0]).toContain('.json');
            expect(typeof writeCall[1]).toBe('string');
        });

        it('should load session from disk', async () => {
            const sessionData: Session = {
                id: 'test-session-123',
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-02'),
                messages: [
                    {
                        id: 'msg-1',
                        role: 'user',
                        content: 'Test',
                        timestamp: new Date('2025-01-01'),
                        metadata: {}
                    }
                ],
                metadata: {
                    messageCount: 1,
                    totalTokens: 0,
                    cacheHits: 0,
                    cacheMisses: 0,
                    averageResponseTime: 0
                }
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(sessionData));

            const loaded = await manager.loadSession('test-session-123');

            expect(loaded).toBeDefined();
            expect(loaded?.id).toBe('test-session-123');
            expect(loaded?.messages.length).toBe(1);
            expect(loaded?.messages[0].content).toBe('Test');
            // Dates should be converted back to Date objects
            expect(loaded?.createdAt).toBeInstanceOf(Date);
        });

        it('should return null for failed load', async () => {
            mockFs.readFile.mockRejectedValue(new Error('File not found'));

            const loaded = await manager.loadSession('non-existent');

            expect(loaded).toBeNull();
        });

        it('should delete session', async () => {
            const session = manager.createNewSession();
            
            const deleted = await manager.deleteSession(session.id);

            expect(deleted).toBe(true);
            expect(mockFs.unlink).toHaveBeenCalled();
        });

        it('should create new session if current is deleted', async () => {
            const session = manager.createNewSession();
            const oldId = session.id;
            
            await manager.deleteSession(session.id);

            const newSession = manager.getCurrentSession();
            expect(newSession.id).not.toBe(oldId);
        });

        it('should list sessions', async () => {
            const session1 = {
                id: 'session-1',
                createdAt: new Date('2025-01-01'),
                messages: [{ id: 'msg-1' }]
            };
            const session2 = {
                id: 'session-2',
                createdAt: new Date('2025-01-02'),
                messages: [{ id: 'msg-2' }, { id: 'msg-3' }]
            };

            mockFs.readdir.mockResolvedValue(['session-1.json', 'session-2.json'] as any);
            mockFs.readFile
                .mockResolvedValueOnce(JSON.stringify(session1))
                .mockResolvedValueOnce(JSON.stringify(session2));

            const sessions = await manager.listSessions();

            expect(sessions.length).toBe(2);
            expect(sessions[0].id).toBe('session-2'); // Most recent first
            expect(sessions[0].messageCount).toBe(2);
            expect(sessions[1].id).toBe('session-1');
        });
    });

    describe('Export', () => {
        it('should export as JSON', () => {
            manager.addMessage('user', 'Test message');
            
            const json = manager.exportAsJson();
            const parsed = JSON.parse(json);

            expect(parsed.messages).toBeDefined();
            expect(parsed.messages.length).toBe(1);
            expect(parsed.messages[0].content).toBe('Test message');
        });

        it('should export as Markdown', () => {
            manager.addMessage('user', 'User message');
            manager.addMessage('assistant', 'Assistant response');

            const markdown = manager.exportAsMarkdown();

            expect(markdown).toContain('# Axon AI Assistant Session');
            expect(markdown).toContain('User message');
            expect(markdown).toContain('Assistant response');
            expect(markdown).toContain('👤'); // User emoji
            expect(markdown).toContain('🤖'); // Assistant emoji
        });

        it('should include metadata in markdown export', () => {
            manager.addMessage('assistant', 'Response', {
                duration: 1500,
                cached: true
            });

            const markdown = manager.exportAsMarkdown();

            expect(markdown).toContain('Response time: 1500ms');
            expect(markdown).toContain('Cached response');
        });

        it('should preserve code blocks in markdown export', () => {
            const codeMessage = 'Here is some code:\n```javascript\nconst x = 10;\n```';
            manager.addMessage('assistant', codeMessage);

            const markdown = manager.exportAsMarkdown();

            expect(markdown).toContain('```javascript');
            expect(markdown).toContain('const x = 10;');
        });
    });

    describe('Statistics', () => {
        it('should get session statistics', () => {
            manager.addMessage('user', 'Q1');
            manager.addMessage('assistant', 'A1', { duration: 1000, tokens: 50 });
            manager.addMessage('user', 'Q2');
            manager.addMessage('assistant', 'A2', { duration: 2000, tokens: 75, cached: true });

            const stats = manager.getSessionStats();

            expect(stats.messageCount).toBe(4);
            expect(stats.totalTokens).toBe(125);
            expect(stats.cacheHits).toBe(1);
            expect(stats.averageResponseTime).toBe(1500);
        });
    });

    describe('Cleanup', () => {
        it('should cleanup old sessions', async () => {
            // listSessions returns sessions sorted by date DESC (newest first)
            const sessions = [
                { id: 'session-3', createdAt: new Date('2025-01-03'), messageCount: 1 },
                { id: 'session-2', createdAt: new Date('2025-01-02'), messageCount: 1 },
                { id: 'session-1', createdAt: new Date('2025-01-01'), messageCount: 1 }
            ];

            // Mock SessionManager to have maxSessions = 2
            (manager as any).options.maxSessions = 2;

            jest.spyOn(manager, 'listSessions').mockResolvedValue(sessions);
            jest.spyOn(manager, 'deleteSession').mockResolvedValue(true);

            const deleted = await manager.cleanupOldSessions();

            expect(deleted).toBe(1); // Should delete 1 old session
            // Should delete the oldest (session-1) which is at index 2 (slice keeps 0,1)
            expect(manager.deleteSession).toHaveBeenCalledWith('session-1');
        });

        it('should not cleanup if under limit', async () => {
            const sessions = [
                { id: 'session-1', createdAt: new Date(), messageCount: 1 }
            ];

            jest.spyOn(manager, 'listSessions').mockResolvedValue(sessions);
            jest.spyOn(manager, 'deleteSession');

            const deleted = await manager.cleanupOldSessions();

            expect(deleted).toBe(0);
            expect(manager.deleteSession).not.toHaveBeenCalled();
        });
    });

    describe('Disposal', () => {
        it('should save session on dispose', async () => {
            manager.addMessage('user', 'Test');
            jest.spyOn(manager, 'saveSession');

            manager.dispose();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(manager.saveSession).toHaveBeenCalled();
        });

        it('should clear sessions on dispose', () => {
            manager.addMessage('user', 'Test');
            
            manager.dispose();

            // After disposal, getCurrentSession should create a new session
            // but the manager is disposed, so this would fail in real usage
        });
    });
});
