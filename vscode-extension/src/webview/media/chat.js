/**
 * Axon AI Assistant Chat UI Logic
 * 
 * Full implementation with:
 * - Message rendering with markdown-like formatting
 * - Code block detection and rendering
 * - Code actions (apply, copy)
 * - Streaming animation
 * - Session restoration
 */

(function() {
    // Get VS Code API
    const vscode = acquireVsCodeApi();

    // DOM elements
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesContainer = document.getElementById('messages');
    const statusText = document.getElementById('status-text');
    const newSessionBtn = document.getElementById('new-session');
    const clearSessionBtn = document.getElementById('clear-session');

    // State
    let isStreaming = false;
    let currentConfig = null;

    // Initialize
    function init() {
        console.log('Axon Chat UI initialized');
        
        // Setup event listeners
        sendButton.addEventListener('click', handleSend);
        messageInput.addEventListener('keydown', handleKeyDown);
        newSessionBtn.addEventListener('click', handleNewSession);
        clearSessionBtn.addEventListener('click', handleClearSession);

        // Setup quick actions
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prompt = e.target.getAttribute('data-prompt');
                if (prompt) {
                    messageInput.value = prompt;
                    handleSend();
                }
            });
        });

        // Listen for messages from extension
        window.addEventListener('message', handleExtensionMessage);

        // Request initial config
        sendToExtension({ type: 'requestConfig' });
    }

    // Handle send button click
    function handleSend() {
        const prompt = messageInput.value.trim();
        if (!prompt || isStreaming) {
            return;
        }

        console.log('Sending prompt:', prompt);

        // Send to extension
        sendToExtension({
            type: 'sendPrompt',
            prompt: prompt,
            context: {
                includeOpenFiles: false,
                includeSelection: false
            }
        });

        // Clear input
        messageInput.value = '';
        
        // Update status
        updateStatus('Sending...');
        setStreaming(true);

        // Remove welcome message if exists
        const welcomeMsg = document.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
    }

    // Handle keyboard shortcuts
    function handleKeyDown(e) {
        // Send on Cmd/Ctrl + Enter
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    }

    // Handle new session
    function handleNewSession() {
        if (confirm('Start a new session? Current conversation will be cleared.')) {
            sendToExtension({ type: 'clearSession' });
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>New Session Started</h2>
                    <p>Start a fresh conversation!</p>
                </div>
            `;
            updateStatus('New session started');
        }
    }

    // Handle clear session
    function handleClearSession() {
        if (confirm('Clear the conversation history?')) {
            sendToExtension({ type: 'clearSession' });
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>History Cleared</h2>
                    <p>Your conversation history has been cleared.</p>
                </div>
            `;
            updateStatus('History cleared');
        }
    }

    // Handle messages from extension
    function handleExtensionMessage(event) {
        const message = event.data;
        console.log('Received message from extension:', message.type);

        switch (message.type) {
            case 'streamStart':
                handleStreamStart(message);
                break;
            case 'streamChunk':
                handleStreamChunk(message);
                break;
            case 'streamComplete':
                handleStreamComplete(message);
                break;
            case 'streamError':
                handleStreamError(message);
                break;
            case 'configUpdated':
                handleConfigUpdated(message);
                break;
            case 'system':
                handleSystemMessage(message);
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    // Handle stream start
    function handleStreamStart(message) {
        console.log('Stream started:', message.id);
        updateStatus('Receiving response...');
        
        // Add user message first
        const userMessageEl = createMessageElement('user', message.prompt, `user-${Date.now()}`);
        messagesContainer.appendChild(userMessageEl);
        
        // Add placeholder for streaming assistant message
        const messageEl = createMessageElement('assistant', '', message.id, true);
        messagesContainer.appendChild(messageEl);
        scrollToBottom();
    }

    // Handle stream chunk
    function handleStreamChunk(message) {
        // Update the message content
        const messageEl = document.getElementById(`message-${message.id}`);
        if (messageEl) {
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                // Render with markdown-like formatting
                contentEl.innerHTML = renderMessageContent(message.accumulated);
                scrollToBottom();
            }
        }
    }

    // Handle stream complete
    function handleStreamComplete(message) {
        console.log('Stream completed:', message.id);
        setStreaming(false);
        
        const duration = message.metadata?.duration || 0;
        const durationText = duration > 0 ? ` (${(duration / 1000).toFixed(1)}s)` : '';
        updateStatus(`Ready${durationText}`);
        
        // Finalize the message
        const messageEl = document.getElementById(`message-${message.id}`);
        if (messageEl) {
            messageEl.classList.remove('streaming');
            
            // Final render with code blocks
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.innerHTML = renderMessageContent(message.response);
                
                // Add message actions
                addMessageActions(messageEl, message.id);
            }
        }
        
        // Update stats if available
        if (message.metadata) {
            updateStats(message.metadata);
        }
    }

    // Handle stream error
    function handleStreamError(message) {
        console.error('Stream error:', message.error);
        setStreaming(false);
        updateStatus(`Error: ${message.error}`);
        
        // Show error in UI
        const errorEl = createMessageElement('system', `Error: ${message.error}`, message.id);
        errorEl.classList.add('error');
        messagesContainer.appendChild(errorEl);
        scrollToBottom();
    }

    // Handle config update
    function handleConfigUpdated(message) {
        currentConfig = message.config;
        console.log('Config updated:', currentConfig);
    }

    // Handle system messages
    function handleSystemMessage(message) {
        console.log(`System ${message.level}:`, message.message);
        const systemEl = createMessageElement('system', message.message, `system-${Date.now()}`);
        systemEl.classList.add(message.level);
        messagesContainer.appendChild(systemEl);
        scrollToBottom();
    }

    // Create message element
    function createMessageElement(role, content, id, isStreaming = false) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${role}`;
        messageEl.id = `message-${id}`;
        
        if (isStreaming) {
            messageEl.classList.add('streaming');
        }

        // Add message header
        const headerEl = document.createElement('div');
        headerEl.className = 'message-header';
        
        const roleEl = document.createElement('span');
        roleEl.className = 'message-role';
        roleEl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'Axon AI' : 'System';
        
        const timestampEl = document.createElement('span');
        timestampEl.className = 'message-timestamp';
        timestampEl.textContent = new Date().toLocaleTimeString();
        
        headerEl.appendChild(roleEl);
        headerEl.appendChild(timestampEl);

        // Add message content
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.innerHTML = renderMessageContent(content);

        messageEl.appendChild(headerEl);
        messageEl.appendChild(contentEl);
        
        return messageEl;
    }
    
    // Render message content with formatting
    function renderMessageContent(content) {
        if (!content) return '';
        
        // Escape HTML first
        const escaped = escapeHtml(content);
        
        // Detect and render code blocks
        const withCodeBlocks = renderCodeBlocks(escaped);
        
        // Simple markdown-like formatting
        let formatted = withCodeBlocks;
        
        // Bold: **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic: *text*
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Inline code: `code`
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Line breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        return `<p>${formatted}</p>`;
    }
    
    // Render code blocks
    function renderCodeBlocks(content) {
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        
        return content.replace(codeBlockRegex, (match, language, code) => {
            const lang = language || 'axon';
            const blockId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            return `
                <div class="code-block" data-block-id="${blockId}">
                    <div class="code-block-header">
                        <span class="code-block-language">${lang}</span>
                        <div class="code-block-actions">
                            <button class="code-action-btn" onclick="copyCode('${blockId}')" title="Copy code">
                                📋 Copy
                            </button>
                            <button class="code-action-btn" onclick="applyCode('${blockId}', '${lang}')" title="Apply to editor">
                                ✨ Apply
                            </button>
                        </div>
                    </div>
                    <div class="code-block-content">
                        <pre><code>${code.trim()}</code></pre>
                    </div>
                </div>
            `;
        });
    }
    
    // Add message actions (copy, regenerate, etc.)
    function addMessageActions(messageEl, messageId) {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn';
        copyBtn.textContent = '📋 Copy';
        copyBtn.onclick = () => copyMessageContent(messageId);
        
        const regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'message-action-btn';
        regenerateBtn.textContent = '🔄 Regenerate';
        regenerateBtn.onclick = () => regenerateMessage(messageId);
        
        actionsEl.appendChild(copyBtn);
        actionsEl.appendChild(regenerateBtn);
        messageEl.appendChild(actionsEl);
    }
    
    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Update status
    function updateStatus(text) {
        statusText.textContent = text;
    }

    // Set streaming state
    function setStreaming(streaming) {
        isStreaming = streaming;
        sendButton.disabled = streaming;
        messageInput.disabled = streaming;
    }

    // Scroll to bottom
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Send message to extension
    function sendToExtension(message) {
        vscode.postMessage(message);
    }
    
    // Update stats display
    function updateStats(metadata) {
        const statsEl = document.getElementById('stats');
        if (statsEl && metadata) {
            const parts = [];
            if (metadata.tokens) {
                parts.push(`${metadata.tokens} tokens`);
            }
            if (metadata.cached !== undefined) {
                parts.push(metadata.cached ? '📦 Cached' : '🔄 Fresh');
            }
            statsEl.textContent = parts.join(' · ');
        }
    }
    
    // Global code action handlers
    window.copyCode = function(blockId) {
        const block = document.querySelector(`[data-block-id="${blockId}"]`);
        if (block) {
            const code = block.querySelector('code').textContent;
            sendToExtension({
                type: 'copyCode',
                code: code,
                messageId: blockId
            });
        }
    };
    
    window.applyCode = function(blockId, language) {
        const block = document.querySelector(`[data-block-id="${blockId}"]`);
        if (block) {
            const code = block.querySelector('code').textContent;
            sendToExtension({
                type: 'applyCode',
                code: code,
                language: language,
                messageId: blockId
            });
        }
    };
    
    // Copy message content
    function copyMessageContent(messageId) {
        const messageEl = document.getElementById(`message-${messageId}`);
        if (messageEl) {
            const content = messageEl.querySelector('.message-content').textContent;
            sendToExtension({
                type: 'copyCode',
                code: content,
                messageId: messageId
            });
        }
    }
    
    // Regenerate message
    function regenerateMessage(messageId) {
        // Find the user prompt that preceded this message
        const messageEl = document.getElementById(`message-${messageId}`);
        if (messageEl) {
            // For now, ask user to re-enter the prompt
            // In a full implementation, we'd track the original prompt
            updateStatus('Regeneration not yet implemented');
        }
    }

    // Initialize on load
    init();
})();
