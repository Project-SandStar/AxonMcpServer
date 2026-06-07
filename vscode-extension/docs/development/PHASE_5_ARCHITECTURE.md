# Phase 5: Interactive UI & Streaming - Architecture

## Overview

Phase 5 adds real-time, interactive code generation capabilities with a modern chat-based interface. Users can have ongoing conversations with the AI, see streaming responses, and take immediate actions on generated code.

## Goals

1. **Streaming Responses**: Real-time AI response streaming with progress updates
2. **Interactive Chat UI**: Modern chat interface for conversations with the AI
3. **Code Actions**: Apply, copy, edit, and regenerate code directly from the UI
4. **Session Management**: Persistent conversation history and context
5. **Seamless Integration**: Work with existing caching and performance systems

## Architecture Components

### 1. Streaming Layer

#### **StreamingResponseHandler**
- Handles AI streaming responses from Anthropic
- Manages progress callbacks and updates
- Supports cancellation and error handling
- Integrates with PerformanceMonitor
- Buffers and parses streaming chunks

```typescript
interface StreamingConfig {
    onProgress?: (chunk: string, accumulated: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
}

class StreamingResponseHandler {
    async streamGenerate(
        prompt: string,
        config: StreamingConfig
    ): Promise<string>
}
```

### 2. WebView Layer

#### **WebViewPanelManager**
- Manages VSCode WebView panel lifecycle
- Handles panel creation, visibility, and disposal
- Manages WebView state persistence
- Coordinates message passing

```typescript
class WebViewPanelManager {
    createOrShow(): void
    sendMessage(message: Message): void
    dispose(): void
}
```

#### **Message Protocol**
Bidirectional communication between extension and WebView:

**Extension → WebView:**
```typescript
type ToWebViewMessage =
    | { type: 'streamStart', id: string, prompt: string }
    | { type: 'streamChunk', id: string, chunk: string, accumulated: string }
    | { type: 'streamComplete', id: string, response: string }
    | { type: 'streamError', id: string, error: string }
    | { type: 'sessionRestored', history: Message[] }
    | { type: 'configUpdated', config: Config };
```

**WebView → Extension:**
```typescript
type FromWebViewMessage =
    | { type: 'sendPrompt', prompt: string, context?: any }
    | { type: 'cancelStream', id: string }
    | { type: 'applyCode', code: string, language: string }
    | { type: 'copyCode', code: string }
    | { type: 'regenerate', promptId: string }
    | { type: 'editPrompt', promptId: string, newPrompt: string }
    | { type: 'clearSession' }
    | { type: 'exportSession' };
```

### 3. Session Layer

#### **SessionManager**
- Manages conversation history
- Persists sessions to disk
- Restores sessions on reload
- Handles context accumulation
- Manages session metadata

```typescript
interface Session {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    messages: SessionMessage[];
    metadata: {
        totalTokens?: number;
        cacheHits?: number;
        averageResponseTime?: number;
    };
}

interface SessionMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        streaming?: boolean;
        cached?: boolean;
        duration?: number;
        actions?: string[];
    };
}

class SessionManager {
    getCurrentSession(): Session | null
    createNewSession(): Session
    addMessage(role: string, content: string, metadata?: any): void
    saveSession(): Promise<void>
    loadSession(id: string): Promise<Session>
    exportSession(format: 'json' | 'markdown'): string
    clearSession(): void
}
```

### 4. UI Layer

#### **Chat Interface** (WebView HTML/CSS/JS)

**Components:**
- **Message List**: Scrollable conversation history
- **Input Area**: Multi-line text input with send button
- **Code Blocks**: Syntax-highlighted code with actions
- **Action Buttons**: Apply, Copy, Regenerate, Edit
- **Status Bar**: Token count, cache stats, session info
- **Settings Panel**: Quick access to configuration

**Technologies:**
- Vanilla JavaScript (no framework dependencies)
- VSCode WebView API
- Highlight.js for syntax highlighting
- Markdown-it for markdown rendering
- CSS Grid/Flexbox for layout

#### **UI Features**

**Message Display:**
- User messages (right-aligned, blue)
- Assistant messages (left-aligned, gray)
- System messages (centered, italic)
- Streaming indicator (animated dots)
- Timestamp and metadata

**Code Blocks:**
- Language detection
- Syntax highlighting
- Line numbers (optional)
- Copy button
- Apply to editor button
- Expand/collapse for long code

**Input Area:**
- Multi-line support
- Send on Cmd/Ctrl+Enter
- Clear button
- Character/token counter
- Suggestion chips

**Actions:**
- New Session
- Export Session
- Clear History
- Settings/Preferences
- Cancel Streaming

### 5. Integration Layer

#### **WorkflowOrchestrator Integration**
- Use existing context gathering
- Leverage semantic caching
- Apply performance monitoring
- Handle AI provider communication

#### **CacheManager Integration**
- Cache streaming responses semantically
- Invalidate on code changes
- Use context cache for files
- Track cache hit rates in session metadata

#### **PerformanceMonitor Integration**
- Measure streaming latency
- Track end-to-end response times
- Monitor WebView performance
- Measure action execution times

## Data Flow

### Streaming Code Generation Flow

```
User Input (WebView)
    ↓
WebView → Extension (sendPrompt message)
    ↓
SessionManager.addMessage('user', prompt)
    ↓
Check SemanticCache (CacheManager)
    ↓ [Cache Miss]
StreamingResponseHandler.streamGenerate()
    ↓
Anthropic API (streaming)
    ↓ [chunks]
StreamingResponseHandler → WebView (streamChunk messages)
    ↓
WebView updates UI (append chunks)
    ↓ [complete]
SessionManager.addMessage('assistant', response)
    ↓
SemanticCache.set(prompt, response)
    ↓
SessionManager.saveSession()
```

### Apply Code Action Flow

```
User clicks "Apply" button
    ↓
WebView → Extension (applyCode message)
    ↓
Get active editor
    ↓
Determine insertion point (cursor or selection)
    ↓
Insert code with proper indentation
    ↓
Format document (if enabled)
    ↓
Extension → WebView (actionComplete message)
    ↓
WebView shows success notification
```

## File Structure

```
vscode-extension/
├── src/
│   ├── streaming/
│   │   ├── StreamingResponseHandler.ts    (Streaming logic)
│   │   └── StreamBuffer.ts                 (Chunk buffering)
│   ├── webview/
│   │   ├── WebViewPanelManager.ts         (Panel management)
│   │   ├── MessageProtocol.ts             (Message types)
│   │   └── media/
│   │       ├── chat.html                   (UI template)
│   │       ├── chat.css                    (Styles)
│   │       ├── chat.js                     (UI logic)
│   │       └── vendor/
│   │           ├── highlight.min.js        (Syntax highlighting)
│   │           └── markdown-it.min.js      (Markdown parsing)
│   ├── session/
│   │   ├── SessionManager.ts              (Session management)
│   │   └── SessionStorage.ts              (Persistence)
│   ├── actions/
│   │   ├── CodeActionHandler.ts           (Apply, copy actions)
│   │   └── EditorIntegration.ts           (Editor operations)
│   └── commands/
│       ├── openChat.ts                     (Open chat command)
│       └── sessionCommands.ts             (Session management)
├── tests/
│   ├── unit/
│   │   ├── streaming/
│   │   │   └── StreamingResponseHandler.test.ts
│   │   ├── session/
│   │   │   └── SessionManager.test.ts
│   │   └── webview/
│   │       └── MessageProtocol.test.ts
│   └── integration/
│       └── InteractiveUI.test.ts
└── docs/
    ├── PHASE_5_ARCHITECTURE.md            (This file)
    ├── INTERACTIVE_UI_GUIDE.md            (User guide)
    └── STREAMING_API.md                   (API documentation)
```

## UI Mockup

```
┌─────────────────────────────────────────────────────────┐
│ Axon AI Assistant                    [−] [□] [✕]        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  👤 You (2:30 PM)                                       │
│  ┌────────────────────────────────────────────────┐    │
│  │ Generate a function to calculate fibonacci      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│              🤖 Axon Assistant (2:30 PM)                │
│         ┌─────────────────────────────────────────┐    │
│         │ Here's a function to calculate the      │    │
│         │ Fibonacci sequence:                     │    │
│         │                                         │    │
│         │ ```axon                                 │    │
│         │ fib: (n) => do                         │    │
│         │   if (n <= 1) n                        │    │
│         │   else fib(n-1) + fib(n-2)             │    │
│         │ end                                     │    │
│         │ ```                                     │    │
│         │                                         │    │
│         │ [Apply] [Copy] [Regenerate]            │    │
│         └─────────────────────────────────────────┘    │
│                                                          │
│  👤 You (2:31 PM)                                       │
│  ┌────────────────────────────────────────────────┐    │
│  │ Add memoization for better performance         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│              🤖 Axon Assistant (typing...)              │
│         ┌─────────────────────────────────────────┐    │
│         │ I'll add memoization to optimize the... │    │
│         │ ▌                                       │    │
│         └─────────────────────────────────────────┘    │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ 💬 Type your message...                    [Send]       │
│ Tokens: 156 | Cache Hits: 2 | Session: 15m             │
└─────────────────────────────────────────────────────────┘
```

## State Management

### Extension State
```typescript
interface ExtensionState {
    currentSession: Session | null;
    activeStreams: Map<string, AbortController>;
    panelState: {
        visible: boolean;
        position: ViewColumn;
    };
}
```

### WebView State
```typescript
interface WebViewState {
    messages: UIMessage[];
    inputValue: string;
    isStreaming: boolean;
    streamingMessageId: string | null;
    settings: {
        showTimestamps: boolean;
        showLineNumbers: boolean;
        theme: 'dark' | 'light';
    };
}
```

## Performance Considerations

### Streaming Optimization
- Buffer small chunks (< 10 chars) to reduce message overhead
- Debounce UI updates to 50ms
- Use virtual scrolling for large message lists
- Lazy-load syntax highlighting

### Memory Management
- Limit session history (default: 50 messages)
- Compress old sessions
- Clear completed streams from memory
- Dispose unused resources

### Caching Strategy
- Cache complete responses semantically
- Don't cache partial streaming responses
- Use context cache for gathered files
- Track cache effectiveness in session metadata

## Security Considerations

### WebView Security
- Use Content Security Policy (CSP)
- Sanitize all user input
- Escape code blocks properly
- No inline event handlers
- Use nonce for inline scripts

### Code Execution
- Never auto-execute generated code
- Confirm before applying to editor
- Validate code before insertion
- Sandbox preview environments

### Data Privacy
- Sessions stored locally only
- No telemetry without consent
- API keys never in WebView
- Secure message passing

## Error Handling

### Streaming Errors
- Network failures: Retry with exponential backoff
- API errors: Show user-friendly message
- Timeout: Cancel after 60 seconds
- Rate limits: Queue requests

### WebView Errors
- Panel disposal: Gracefully handle and restore
- Message errors: Log and continue
- Rendering errors: Fallback to plain text
- State corruption: Clear and reinitialize

### Session Errors
- Load failure: Create new session
- Save failure: Retry and warn user
- Corruption: Backup and recreate
- Version mismatch: Migrate or discard

## Testing Strategy

### Unit Tests
- StreamingResponseHandler (mocked API)
- SessionManager (mocked storage)
- MessageProtocol (type validation)
- CodeActionHandler (mocked editor)

### Integration Tests
- End-to-end streaming flow
- Session persistence and restoration
- WebView message round-trips
- Cache integration

### UI Tests
- Message rendering
- Input handling
- Action button clicks
- Streaming animations

### Performance Tests
- Streaming latency
- Large message lists
- Concurrent streams
- Memory usage over time

## Configuration

### New Settings
```json
{
    "axon.chat.enabled": true,
    "axon.chat.streamingEnabled": true,
    "axon.chat.maxHistorySize": 50,
    "axon.chat.autoSave": true,
    "axon.chat.theme": "auto",
    "axon.chat.showTimestamps": true,
    "axon.chat.showLineNumbers": true,
    "axon.chat.syntaxHighlighting": true,
    "axon.chat.confirmBeforeApply": true
}
```

## Metrics to Track

### Usage Metrics
- Chat sessions created
- Messages per session
- Streaming vs non-streaming requests
- Actions taken (apply, copy, etc.)
- Cache hit rate in chat

### Performance Metrics
- Time to first chunk
- Time to complete response
- UI render time
- Memory usage
- Network bandwidth

### Quality Metrics
- Successful code applications
- Regeneration frequency
- Error rate
- User satisfaction (if feedback enabled)

## Future Enhancements (Post-Phase 5)

1. **Multi-turn Context**: Smarter context management across turns
2. **Code Diffs**: Show changes when regenerating
3. **Voice Input**: Speech-to-text for prompts
4. **Collaborative Sessions**: Share sessions with team
5. **Templates**: Save and reuse prompt templates
6. **Workspace Integration**: Auto-gather relevant files
7. **Testing Integration**: Generate and run tests
8. **Documentation**: Auto-generate doc comments
9. **Refactoring**: Suggest code improvements
10. **Analytics Dashboard**: Visualize usage and performance

## Success Criteria

Phase 5 is complete when:

- ✅ Streaming responses work smoothly with < 100ms latency to first chunk
- ✅ Chat UI is responsive and intuitive
- ✅ Sessions persist and restore correctly
- ✅ Code actions work reliably
- ✅ Integration with Phase 4 (caching, performance) is seamless
- ✅ Comprehensive tests pass (> 80% coverage)
- ✅ Documentation is complete
- ✅ No memory leaks or performance issues
- ✅ Code compiles without errors

## Timeline Estimate

- Streaming Layer: 1-2 days
- WebView Infrastructure: 2-3 days
- Chat UI: 2-3 days
- Session Management: 1-2 days
- Integration & Actions: 1-2 days
- Testing: 2-3 days
- Documentation: 1 day

**Total: 10-16 days**

For this implementation session, we'll focus on core functionality and can iterate on polish and advanced features later.
