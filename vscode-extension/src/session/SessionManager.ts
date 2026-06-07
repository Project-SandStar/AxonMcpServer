import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { SessionMessage, SessionMetadata } from '../webview/MessageProtocol';
import { getLogger } from '../utils/logger';

/**
 * Session data structure
 */
export interface Session {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    messages: SessionMessage[];
    metadata: SessionMetadata;
}

/**
 * Session storage options
 */
interface SessionStorageOptions {
    maxSessions: number;
    autoSave: boolean;
    saveInterval: number; // milliseconds
}

/**
 * Manages conversation sessions
 * 
 * Features:
 * - Create and manage sessions
 * - Add messages with metadata
 * - Persist sessions to disk
 * - Restore sessions on load
 * - Export sessions (JSON, Markdown)
 * - Session history tracking
 * - Automatic saving
 */
export class SessionManager implements vscode.Disposable {
    private currentSession: Session | null = null;
    private sessions: Map<string, Session> = new Map();
    private context: vscode.ExtensionContext;
    private logger = getLogger();
    private disposables: vscode.Disposable[] = [];
    private saveTimer: NodeJS.Timeout | null = null;
    private options: SessionStorageOptions;
    private sessionDir: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        
        // Load options from config
        const config = vscode.workspace.getConfiguration('axon.chat');
        this.options = {
            maxSessions: config.get('maxHistorySize', 50),
            autoSave: config.get('autoSave', true),
            saveInterval: 5000 // Save every 5 seconds when dirty
        };

        // Setup session directory
        this.sessionDir = path.join(context.globalStorageUri.fsPath, 'sessions');
        this.ensureSessionDir();

        // Load last session
        this.loadLastSession();

        this.logger.info('SessionManager initialized');
    }

    /**
     * Ensure session directory exists
     */
    private async ensureSessionDir(): Promise<void> {
        try {
            await fs.mkdir(this.sessionDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create session directory', error as Error);
        }
    }

    /**
     * Get current session or create new one
     */
    getCurrentSession(): Session {
        if (!this.currentSession) {
            this.currentSession = this.createNewSession();
        }
        return this.currentSession;
    }

    /**
     * Create a new session
     */
    createNewSession(): Session {
        const session: Session = {
            id: this.generateSessionId(),
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: [],
            metadata: {
                totalTokens: 0,
                cacheHits: 0,
                cacheMisses: 0,
                averageResponseTime: 0,
                messageCount: 0
            }
        };

        this.currentSession = session;
        this.sessions.set(session.id, session);
        
        this.logger.info(`New session created: ${session.id}`);
        
        // Save to current session reference
        this.saveCurrentSessionId(session.id);
        
        if (this.options.autoSave) {
            this.scheduleSave();
        }

        return session;
    }

    /**
     * Add a message to current session
     */
    addMessage(
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata?: Partial<SessionMessage['metadata']>
    ): SessionMessage {
        const session = this.getCurrentSession();

        const message: SessionMessage = {
            id: this.generateMessageId(),
            role,
            content,
            timestamp: new Date(),
            metadata: metadata || {}
        };

        session.messages.push(message);
        session.updatedAt = new Date();
        session.metadata.messageCount = session.messages.length;

        // Update metadata stats
        if (metadata?.tokens) {
            session.metadata.totalTokens = (session.metadata.totalTokens || 0) + metadata.tokens;
        }

        if (metadata?.cached !== undefined) {
            if (metadata.cached) {
                session.metadata.cacheHits = (session.metadata.cacheHits || 0) + 1;
            } else {
                session.metadata.cacheMisses = (session.metadata.cacheMisses || 0) + 1;
            }
        }

        if (metadata?.duration && role === 'assistant') {
            // Update rolling average response time
            const totalMessages = session.messages.filter(m => m.role === 'assistant').length;
            const currentAvg = session.metadata.averageResponseTime || 0;
            session.metadata.averageResponseTime = 
                (currentAvg * (totalMessages - 1) + metadata.duration) / totalMessages;
        }

        this.logger.debug(`Message added: ${role} (${message.id})`);

        if (this.options.autoSave) {
            this.scheduleSave();
        }

        return message;
    }

    /**
     * Get message by ID
     */
    getMessage(id: string): SessionMessage | undefined {
        const session = this.getCurrentSession();
        return session.messages.find(m => m.id === id);
    }

    /**
     * Update message metadata
     */
    updateMessage(id: string, updates: Partial<SessionMessage>): boolean {
        const session = this.getCurrentSession();
        const message = session.messages.find(m => m.id === id);
        
        if (!message) {
            return false;
        }

        Object.assign(message, updates);
        session.updatedAt = new Date();

        if (this.options.autoSave) {
            this.scheduleSave();
        }

        return true;
    }

    /**
     * Get all messages from current session
     */
    getMessages(): SessionMessage[] {
        return this.getCurrentSession().messages;
    }

    /**
     * Get last N messages
     */
    getRecentMessages(count: number): SessionMessage[] {
        const messages = this.getMessages();
        return messages.slice(-count);
    }

    /**
     * Clear current session
     */
    clearSession(): void {
        const oldSessionId = this.currentSession?.id;
        
        // Create new session
        this.currentSession = this.createNewSession();
        
        this.logger.info(`Session cleared. Old: ${oldSessionId}, New: ${this.currentSession.id}`);
    }

    /**
     * Delete a session
     */
    async deleteSession(id: string): Promise<boolean> {
        try {
            // Remove from memory
            this.sessions.delete(id);

            // Delete file
            const filepath = this.getSessionFilePath(id);
            await fs.unlink(filepath);

            // If it was the current session, create a new one
            if (this.currentSession?.id === id) {
                this.currentSession = this.createNewSession();
            }

            this.logger.info(`Session deleted: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete session ${id}`, error as Error);
            return false;
        }
    }

    /**
     * Save current session to disk
     */
    async saveSession(): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        try {
            const filepath = this.getSessionFilePath(this.currentSession.id);
            const data = JSON.stringify(this.currentSession, null, 2);
            await fs.writeFile(filepath, data, 'utf-8');
            
            this.logger.debug(`Session saved: ${this.currentSession.id}`);
        } catch (error) {
            this.logger.error('Failed to save session', error as Error);
        }
    }

    /**
     * Load a session from disk
     */
    async loadSession(id: string): Promise<Session | null> {
        try {
            const filepath = this.getSessionFilePath(id);
            const data = await fs.readFile(filepath, 'utf-8');
            const session = JSON.parse(data) as Session;

            // Convert date strings back to Date objects
            session.createdAt = new Date(session.createdAt);
            session.updatedAt = new Date(session.updatedAt);
            session.messages.forEach(m => {
                m.timestamp = new Date(m.timestamp);
            });

            this.sessions.set(session.id, session);
            this.logger.info(`Session loaded: ${id}`);
            
            return session;
        } catch (error) {
            this.logger.error(`Failed to load session ${id}`, error as Error);
            return null;
        }
    }

    /**
     * Load the last active session
     */
    private async loadLastSession(): Promise<void> {
        const lastSessionId = this.context.globalState.get<string>('currentSessionId');
        
        if (lastSessionId) {
            const session = await this.loadSession(lastSessionId);
            if (session) {
                this.currentSession = session;
                this.logger.info(`Restored last session: ${lastSessionId}`);
                return;
            }
        }

        // If no last session or failed to load, create new
        this.createNewSession();
    }

    /**
     * List all saved sessions
     */
    async listSessions(): Promise<{ id: string; createdAt: Date; messageCount: number }[]> {
        try {
            const files = await fs.readdir(this.sessionDir);
            const sessionFiles = files.filter(f => f.endsWith('.json'));
            
            const sessions = await Promise.all(
                sessionFiles.map(async (file) => {
                    try {
                        const filepath = path.join(this.sessionDir, file);
                        const data = await fs.readFile(filepath, 'utf-8');
                        const session = JSON.parse(data) as Session;
                        
                        return {
                            id: session.id,
                            createdAt: new Date(session.createdAt),
                            messageCount: session.messages.length
                        };
                    } catch {
                        return null;
                    }
                })
            );

            return sessions
                .filter((s): s is NonNullable<typeof s> => s !== null)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } catch (error) {
            this.logger.error('Failed to list sessions', error as Error);
            return [];
        }
    }

    /**
     * Export session as JSON
     */
    exportAsJson(session?: Session): string {
        const sess = session || this.getCurrentSession();
        return JSON.stringify(sess, null, 2);
    }

    /**
     * Export session as Markdown
     */
    exportAsMarkdown(session?: Session): string {
        const sess = session || this.getCurrentSession();
        const lines: string[] = [];

        lines.push(`# Axon AI Assistant Session`);
        lines.push(`\n**Session ID**: ${sess.id}`);
        lines.push(`**Created**: ${sess.createdAt.toLocaleString()}`);
        lines.push(`**Updated**: ${sess.updatedAt.toLocaleString()}`);
        lines.push(`**Messages**: ${sess.messages.length}`);
        
        if (sess.metadata.totalTokens) {
            lines.push(`**Total Tokens**: ${sess.metadata.totalTokens}`);
        }
        
        if (sess.metadata.cacheHits !== undefined) {
            lines.push(`**Cache Hits**: ${sess.metadata.cacheHits} / Misses: ${sess.metadata.cacheMisses}`);
        }

        lines.push('\n---\n');

        // Add messages
        sess.messages.forEach((msg, index) => {
            const emoji = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : 'ℹ️';
            const time = msg.timestamp.toLocaleTimeString();
            
            lines.push(`## ${emoji} ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)} (${time})`);
            lines.push('');
            
            // Handle code blocks in content
            const content = msg.content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return '```' + (lang || '') + '\n' + code + '```';
            });
            
            lines.push(content);
            lines.push('');

            // Add metadata if present
            if (msg.metadata?.duration) {
                lines.push(`*Response time: ${msg.metadata.duration}ms*`);
            }
            if (msg.metadata?.cached) {
                lines.push(`*Cached response*`);
            }
            
            lines.push('\n---\n');
        });

        return lines.join('\n');
    }

    /**
     * Get session statistics
     */
    getSessionStats(): SessionMetadata {
        return this.getCurrentSession().metadata;
    }

    /**
     * Schedule an auto-save
     */
    private scheduleSave(): void {
        if (!this.options.autoSave) {
            return;
        }

        // Clear existing timer
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }

        // Schedule new save
        this.saveTimer = setTimeout(() => {
            this.saveSession();
            this.saveTimer = null;
        }, this.options.saveInterval);
    }

    /**
     * Save current session ID reference
     */
    private async saveCurrentSessionId(id: string): Promise<void> {
        await this.context.globalState.update('currentSessionId', id);
    }

    /**
     * Get session file path
     */
    private getSessionFilePath(id: string): string {
        return path.join(this.sessionDir, `${id}.json`);
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `session-${timestamp}-${random}`;
    }

    /**
     * Generate unique message ID
     */
    private generateMessageId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `msg-${timestamp}-${random}`;
    }

    /**
     * Clean up old sessions (keep only most recent N)
     */
    async cleanupOldSessions(): Promise<number> {
        try {
            const sessions = await this.listSessions();
            
            if (sessions.length <= this.options.maxSessions) {
                return 0;
            }

            const toDelete = sessions.slice(this.options.maxSessions);
            let deleted = 0;

            for (const session of toDelete) {
                const success = await this.deleteSession(session.id);
                if (success) {
                    deleted++;
                }
            }

            this.logger.info(`Cleaned up ${deleted} old sessions`);
            return deleted;
        } catch (error) {
            this.logger.error('Failed to cleanup old sessions', error as Error);
            return 0;
        }
    }

    /**
     * Dispose and cleanup
     */
    dispose(): void {
        this.logger.info('Disposing SessionManager');

        // Clear save timer
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        // Save current session one last time
        if (this.currentSession) {
            this.saveSession();
        }

        // Dispose subscriptions
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Clear sessions from memory
        this.sessions.clear();
        this.currentSession = null;
    }
}

/**
 * Global session manager instance
 */
let sessionManagerInstance: SessionManager | null = null;

/**
 * Initialize session manager
 */
export function initializeSessionManager(context: vscode.ExtensionContext): SessionManager {
    if (!sessionManagerInstance) {
        sessionManagerInstance = new SessionManager(context);
    }
    return sessionManagerInstance;
}

/**
 * Get session manager instance
 */
export function getSessionManager(): SessionManager | null {
    return sessionManagerInstance;
}
