/**
 * Message Protocol for Extension ↔ WebView Communication
 * 
 * Defines all message types exchanged between the extension host and WebView panel
 */

/**
 * Messages sent from Extension → WebView
 */
export type ToWebViewMessage =
    | StreamStartMessage
    | StreamChunkMessage
    | StreamCompleteMessage
    | StreamErrorMessage
    | SessionRestoredMessage
    | ConfigUpdatedMessage
    | ActionCompleteMessage
    | ActionErrorMessage
    | SystemMessage;

/**
 * Messages sent from WebView → Extension
 */
export type FromWebViewMessage =
    | SendPromptMessage
    | CancelStreamMessage
    | ApplyCodeMessage
    | CopyCodeMessage
    | RegenerateMessage
    | EditPromptMessage
    | ClearSessionMessage
    | ExportSessionMessage
    | RequestConfigMessage;

/**
 * Stream start notification
 */
export interface StreamStartMessage {
    type: 'streamStart';
    id: string;
    prompt: string;
    timestamp: number;
}

/**
 * Streaming chunk received
 */
export interface StreamChunkMessage {
    type: 'streamChunk';
    id: string;
    chunk: string;
    accumulated: string;
    timestamp: number;
}

/**
 * Stream completed successfully
 */
export interface StreamCompleteMessage {
    type: 'streamComplete';
    id: string;
    response: string;
    metadata?: {
        duration?: number;
        cached?: boolean;
        tokens?: number;
    };
    timestamp: number;
}

/**
 * Stream encountered an error
 */
export interface StreamErrorMessage {
    type: 'streamError';
    id: string;
    error: string;
    timestamp: number;
}

/**
 * Session restored from storage
 */
export interface SessionRestoredMessage {
    type: 'sessionRestored';
    session: {
        id: string;
        messages: SessionMessage[];
        metadata: SessionMetadata;
    };
}

/**
 * Configuration updated
 */
export interface ConfigUpdatedMessage {
    type: 'configUpdated';
    config: ChatConfig;
}

/**
 * Action completed successfully
 */
export interface ActionCompleteMessage {
    type: 'actionComplete';
    action: string;
    messageId?: string;
}

/**
 * Action encountered an error
 */
export interface ActionErrorMessage {
    type: 'actionError';
    action: string;
    error: string;
    messageId?: string;
}

/**
 * System notification or status update
 */
export interface SystemMessage {
    type: 'system';
    level: 'info' | 'warning' | 'error';
    message: string;
    timestamp: number;
}

/**
 * User sends a prompt
 */
export interface SendPromptMessage {
    type: 'sendPrompt';
    prompt: string;
    context?: {
        includeOpenFiles?: boolean;
        includeSelection?: boolean;
        files?: string[];
    };
}

/**
 * Cancel ongoing stream
 */
export interface CancelStreamMessage {
    type: 'cancelStream';
    id: string;
}

/**
 * Apply generated code to editor
 */
export interface ApplyCodeMessage {
    type: 'applyCode';
    code: string;
    language: string;
    messageId: string;
}

/**
 * Copy code to clipboard
 */
export interface CopyCodeMessage {
    type: 'copyCode';
    code: string;
    messageId: string;
}

/**
 * Regenerate response for a prompt
 */
export interface RegenerateMessage {
    type: 'regenerate';
    messageId: string;
    originalPrompt: string;
}

/**
 * Edit and resubmit a prompt
 */
export interface EditPromptMessage {
    type: 'editPrompt';
    messageId: string;
    newPrompt: string;
}

/**
 * Clear current session
 */
export interface ClearSessionMessage {
    type: 'clearSession';
}

/**
 * Export session to file
 */
export interface ExportSessionMessage {
    type: 'exportSession';
    format: 'json' | 'markdown';
}

/**
 * Request current configuration
 */
export interface RequestConfigMessage {
    type: 'requestConfig';
}

/**
 * Session message structure
 */
export interface SessionMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: MessageMetadata;
}

/**
 * Message metadata
 */
export interface MessageMetadata {
    streaming?: boolean;
    cached?: boolean;
    duration?: number;
    tokens?: number;
    actions?: string[];
    codeBlocks?: CodeBlock[];
}

/**
 * Code block information
 */
export interface CodeBlock {
    language: string;
    code: string;
    startLine: number;
    endLine: number;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
    totalTokens?: number;
    cacheHits?: number;
    cacheMisses?: number;
    averageResponseTime?: number;
    messageCount?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Chat configuration
 */
export interface ChatConfig {
    enabled: boolean;
    streamingEnabled: boolean;
    maxHistorySize: number;
    autoSave: boolean;
    theme: 'auto' | 'dark' | 'light';
    showTimestamps: boolean;
    showLineNumbers: boolean;
    syntaxHighlighting: boolean;
    confirmBeforeApply: boolean;
}

/**
 * Type guards for message validation
 */
export function isToWebViewMessage(message: any): message is ToWebViewMessage {
    return message && typeof message.type === 'string';
}

export function isFromWebViewMessage(message: any): message is FromWebViewMessage {
    return message && typeof message.type === 'string';
}

export function isSendPromptMessage(message: FromWebViewMessage): message is SendPromptMessage {
    return message.type === 'sendPrompt';
}

export function isApplyCodeMessage(message: FromWebViewMessage): message is ApplyCodeMessage {
    return message.type === 'applyCode';
}

export function isCopyCodeMessage(message: FromWebViewMessage): message is CopyCodeMessage {
    return message.type === 'copyCode';
}

export function isCancelStreamMessage(message: FromWebViewMessage): message is CancelStreamMessage {
    return message.type === 'cancelStream';
}

/**
 * Message factory functions
 */
export class MessageFactory {
    static streamStart(id: string, prompt: string): StreamStartMessage {
        return {
            type: 'streamStart',
            id,
            prompt,
            timestamp: Date.now()
        };
    }

    static streamChunk(id: string, chunk: string, accumulated: string): StreamChunkMessage {
        return {
            type: 'streamChunk',
            id,
            chunk,
            accumulated,
            timestamp: Date.now()
        };
    }

    static streamComplete(id: string, response: string, metadata?: any): StreamCompleteMessage {
        return {
            type: 'streamComplete',
            id,
            response,
            metadata,
            timestamp: Date.now()
        };
    }

    static streamError(id: string, error: string): StreamErrorMessage {
        return {
            type: 'streamError',
            id,
            error,
            timestamp: Date.now()
        };
    }

    static systemMessage(level: 'info' | 'warning' | 'error', message: string): SystemMessage {
        return {
            type: 'system',
            level,
            message,
            timestamp: Date.now()
        };
    }

    static actionComplete(action: string, messageId?: string): ActionCompleteMessage {
        return {
            type: 'actionComplete',
            action,
            messageId
        };
    }

    static actionError(action: string, error: string, messageId?: string): ActionErrorMessage {
        return {
            type: 'actionError',
            action,
            error,
            messageId
        };
    }
}
