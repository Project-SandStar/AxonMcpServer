# Chat Feature Improvements & API Key Setup

## Current Issue: "No Active AI Provider Configured"

### Why This Happens

When you click "Explain Code" or any AI feature, you're seeing this error because the Anthropic API key hasn't been configured yet.

### Quick Fix: Configure API Key

**Option 1: Via Command Palette**
```
Cmd+Shift+P → "Axon: Configure AI Provider"
```
This will prompt you to enter your Anthropic API key.

**Option 2: Via Settings**
```
Cmd+, → Search "Axon AI API Key" → Paste your key
```

**Option 3: Via Sidebar**
```
Open Axon sidebar → Click "Configure API Key" button
```

### Get an API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key
5. Copy and paste it into VSCode

---

## Chat Feature: Current vs Cline-like

### Current Chat Implementation

**What Works:**
- ✅ Basic chat panel exists (`Axon: Open AI Chat`)
- ✅ Streaming responses
- ✅ Session management
- ✅ Message history
- ✅ Send selection to chat

**What's Limited:**
- ❌ Not as prominent as Cline (toolbar only, not sidebar)
- ❌ No rich UI with code blocks and syntax highlighting
- ❌ No inline code execution/insertion
- ❌ No file tree/context selector
- ❌ No conversation branching
- ❌ Limited command system

### Cline's Chat Features

**Sidebar Integration:**
- Always visible in sidebar
- Shows conversation history
- File context panel
- Tool use display

**Rich UI:**
- Markdown rendering
- Syntax-highlighted code blocks
- Diff view for changes
- File tree showing affected files

**Interactive:**
- Click to insert code
- Approve/reject changes
- Edit/retry messages
- Branch conversations

**Context Management:**
- Show which files are in context
- Add/remove files from context
- Search and add relevant files
- Show MCP tools being used

---

## Proposed Improvements

### Phase 1: Enhanced Sidebar Chat (Quick Win)

**Move chat to sidebar view:**
```typescript
// Add to package.json views
"axon-sidebar": [
  {
    "type": "webview",
    "id": "axon.chatView",
    "name": "AI Chat"
  }
]
```

**Features:**
- Always-visible chat interface in sidebar
- Message bubbles (user/assistant)
- Code syntax highlighting
- Quick actions (copy, insert, explain more)

**Effort:** 2-3 days

### Phase 2: Rich Code Rendering (Medium)

**Implement:**
- Markdown-it for rendering
- Prism.js for syntax highlighting
- Code block actions (copy, insert at cursor, apply)
- Diff viewer for code changes

**UI Components:**
- Message bubbles with avatars
- Code blocks with language tags
- Collapsible sections
- Loading indicators

**Effort:** 3-5 days

### Phase 3: Context Management (Advanced)

**File Context Panel:**
```
📁 Context (3 files)
  ├─ functions.axon (added)
  ├─ utils.axon (mentioned)
  └─ config.json (current)
  
[+ Add File] [Clear All]
```

**Features:**
- Drag & drop files into context
- Auto-add current file
- Show file preview on hover
- Remove files from context

**MCP Tools Display:**
```
🔧 Tools Used
  ✓ searchAxonExamples (2 results)
  ✓ getFunctionHelp (hisRead)
```

**Effort:** 5-7 days

### Phase 4: Interactive Actions (Advanced)

**Message Actions:**
- Edit and resend messages
- Branch conversations
- Save/load conversations
- Export to markdown

**Code Actions:**
- Apply code changes with diff preview
- Insert at cursor
- Replace selection
- Create new file

**Effort:** 5-7 days

---

## Implementation Plan

### Immediate (Today)

1. **Fix API Key Issue**
   - Add clear error message with setup instructions
   - Auto-prompt for API key on first use
   - Validate key on save

2. **Document Current Features**
   - Update README with chat commands
   - Add quick start guide

### Short Term (This Week)

1. **Enhanced Error Messages**
   - Better error handling for API failures
   - Show rate limits and usage
   - Suggest solutions

2. **Sidebar Chat View**
   - Create webview-based chat sidebar
   - Move chat from panel to sidebar
   - Basic message bubbles

### Medium Term (Next 2 Weeks)

1. **Rich Code Rendering**
   - Markdown support
   - Syntax highlighting
   - Code block actions

2. **Context Display**
   - Show active file
   - Display MCP tool calls
   - Add file selector

### Long Term (Next Month)

1. **Full Cline-like Experience**
   - Interactive code application
   - Conversation branching
   - Advanced context management
   - File tree integration

---

## Technical Architecture

### Current Chat Implementation

```
ChatOrchestrator (src/chat/)
├─ Manages chat sessions
├─ Handles streaming
└─ Interfaces with WorkflowOrchestrator

WebViewPanelManager (src/webview/)
├─ Creates chat panels
└─ Manages webview lifecycle

Commands (src/commands/chatActions.ts)
├─ openChat
├─ newSession
├─ sendSelectionToChat
└─ exportSession
```

### Proposed Architecture

```
SidebarChatProvider (NEW)
├─ Webview sidebar for chat
├─ Message rendering with markdown
├─ Code block syntax highlighting
└─ Interactive buttons

ContextManager (NEW)
├─ Track files in context
├─ Manage MCP tool results
└─ File tree integration

MessageRenderer (NEW)
├─ Markdown-it for rendering
├─ Prism.js for syntax
├─ Custom components for actions
└─ Diff viewer

ActionHandler (NEW)
├─ Apply code changes
├─ Insert at cursor
├─ Create/edit files
└─ Execute commands
```

---

## Comparison: Current vs Proposed

### Current Chat
```
Location: Panel (bottom)
UI: Plain text
Code: No highlighting
Actions: Copy only
Context: Hidden
Files: Not shown
Tools: Not visible
Streaming: Yes ✓
```

### Proposed Chat (Cline-like)
```
Location: Sidebar (always visible)
UI: Rich markdown
Code: Syntax highlighted + actions
Actions: Insert, apply, explain, copy
Context: File list + tool display
Files: Drag & drop, tree view
Tools: Show usage + results
Streaming: Yes ✓
```

---

## Priority Roadmap

### P0 (Immediate - Hours)
- ✅ Fix "No active AI provider" error messaging
- ✅ Add API key setup guide
- ✅ Auto-prompt for API key

### P1 (This Week - Days)
- 🔲 Move chat to sidebar view
- 🔲 Add basic markdown rendering
- 🔲 Add syntax highlighting
- 🔲 Show current file context

### P2 (Next 2 Weeks)
- 🔲 Rich message bubbles
- 🔲 Code block action buttons
- 🔲 File context panel
- 🔲 MCP tool usage display

### P3 (Next Month)
- 🔲 Interactive code application
- 🔲 Diff preview
- 🔲 Conversation branching
- 🔲 Full context management

---

## Getting Started Now

### 1. Fix Immediate Issue

Configure your API key:
```
Cmd+Shift+P → "Axon: Configure AI Provider"
```

### 2. Test Current Chat

Open the chat:
```
Cmd+Shift+P → "Axon: Open AI Chat"
```

### 3. Try Current Features

- Send selection to chat: Select code → `Cmd+Shift+P` → "Axon: Send Selection to Chat"
- New session: `Cmd+Shift+P` → "Axon: New Chat Session"
- Export: `Cmd+Shift+P` → "Axon: Export Chat Session"

---

## Questions?

**"When will Cline-like chat be ready?"**
- Basic sidebar chat: 1 week
- Rich UI with code blocks: 2-3 weeks
- Full Cline-like experience: 1 month

**"Can I use the current chat?"**
- Yes! Just configure your API key first
- Open chat panel from command palette
- Send code selections to chat

**"Will it replace the current chat?"**
- No, both will coexist
- Toolbar/panel chat for quick tasks
- Sidebar chat for extended conversations

**"What about the explain/optimize commands?"**
- Those will continue to work
- They use the same AI backend
- Just need API key configured

---

## Next Steps

1. **Configure API Key** (required for any AI features)
2. **Test current chat** to understand baseline
3. **Provide feedback** on which Cline features you want most
4. **Wait for sidebar chat** (coming this week)

---

**Note:** The Cline-like chat is a significant enhancement that will be built incrementally. Meanwhile, all core AI features (explain, optimize, generate) work once you configure the API key.
