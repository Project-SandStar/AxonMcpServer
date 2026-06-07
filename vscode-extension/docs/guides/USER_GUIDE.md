# Axon AI Assistant - User Guide

## 🚀 Getting Started

The Axon AI Assistant provides an interactive chat panel where you can generate, explain, and optimize Axon code using Claude AI.

### Prerequisites

1. **Install the Extension**: The Axon VSCode extension should be installed
2. **Configure API Key**: Run `Axon: Configure AI Provider` and enter your Anthropic API key
3. **Open the Chat**: Run `Axon: Open AI Chat Panel` (Cmd+Shift+P)

## 💬 Using the Chat Panel

### Opening the Chat

**Command Palette:**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Axon: Open AI Chat Panel"
3. Press Enter

The chat panel will open in a new column to the right of your editor.

### Sending Messages

1. **Type your message** in the input area at the bottom
2. **Press** `Cmd/Ctrl+Enter` or click the "Send" button
3. Watch as the **AI response streams** in real-time

### Quick Actions

When you first open the chat, you'll see quick action buttons:

- **📊 Generate Function** - Create a new Axon function
- **💡 Explain Code** - Get explanations for code in your file
- **⚡ Optimize Code** - Improve selected code

Click any button to pre-fill a prompt.

## 🎯 Example Prompts

### Code Generation

```
Generate a function to read all points with the 'temp' tag from the database
```

```
Create a function that calculates average power consumption over the last 24 hours
```

### Code Explanation

```
Explain the code in my current file
```

```
What does the readAll() function do?
```

### Code Optimization

```
Optimize this function for better performance
```

```
Refactor this code to be more maintainable
```

## 🔧 Working with Code

### Code Blocks

When the AI generates code, it appears in formatted code blocks with:
- **Language indicator** (e.g., `AXON`, `JSON`)
- **Copy button** (📋) - Copy code to clipboard
- **Apply button** (✨) - Insert code into your editor

### Applying Code to Editor

1. Click the **✨ Apply** button on a code block
2. If enabled, confirm the action
3. Code is inserted at:
   - Your **cursor position** (if no selection)
   - **Replacing your selection** (if text is selected)
4. The document is automatically formatted

**Tip:** You can disable the confirmation dialog in settings:
```json
{
  "axon.chat.confirmBeforeApply": false
}
```

### Copying Code

Click the **📋 Copy** button to copy code to your clipboard. You'll see a notification showing:
- Number of lines copied
- Total character count

## 📝 Managing Sessions

### Session Features

- **Auto-save**: Your conversations are automatically saved
- **Persistence**: Sessions survive VSCode restarts
- **History**: Access past conversations anytime

### Session Commands

| Command | Description |
|---------|-------------|
| `Axon: New Chat Session` | Start a fresh conversation |
| `Axon: Clear Chat Session` | Delete current conversation |
| `Axon: List Chat Sessions` | Browse and load past sessions |
| `Axon: Export Chat Session` | Save as JSON or Markdown |
| `Axon: Show Chat Session Statistics` | View session metrics |

### Creating a New Session

1. Run `Axon: New Chat Session`
2. Confirm you want to start fresh
3. Your current session is saved automatically
4. A new empty session begins

### Exporting Sessions

1. Run `Axon: Export Chat Session`
2. Choose format:
   - **📄 JSON** - Machine-readable format
   - **📝 Markdown** - Human-readable with formatting
3. Choose save location
4. File is saved with session ID in filename

**Example Markdown Export:**
```markdown
# Axon AI Assistant Session

**Session ID**: session-1234567890-abc123
**Created**: 1/1/2025, 2:00:00 PM
**Messages**: 12

---

## 👤 You (2:00:15 PM)

Generate a function to read temperature points

---

## 🤖 Axon AI (2:00:18 PM)

Here's a function to read temperature points:

```axon
readTempPoints: () => do
  readAll(temp)
end
```

*Response time: 2847ms*

---
```

### Loading Past Sessions

1. Run `Axon: List Chat Sessions`
2. Select a session from the list
3. Confirm you want to load it
4. Current session is saved, selected session loads

## ⚙️ Configuration

### Chat Settings

All settings are under `axon.chat.*`:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable the chat panel |
| `streamingEnabled` | `true` | Stream responses in real-time |
| `maxHistorySize` | `50` | Maximum messages to keep |
| `autoSave` | `true` | Automatically save sessions |
| `theme` | `auto` | Theme: `auto`, `light`, or `dark` |
| `showTimestamps` | `true` | Show message timestamps |
| `showLineNumbers` | `true` | Show line numbers in code |
| `syntaxHighlighting` | `true` | Enable syntax highlighting |
| `confirmBeforeApply` | `true` | Confirm before applying code |

### Example Configuration

```json
{
  "axon.chat.streamingEnabled": true,
  "axon.chat.maxHistorySize": 100,
  "axon.chat.confirmBeforeApply": false,
  "axon.chat.theme": "dark"
}
```

### Toggling Streaming

Run `Axon: Toggle Streaming Mode` to quickly enable/disable streaming.

## 🔄 Advanced Features

### Streaming Responses

Streaming allows you to see the AI's response as it's generated:
- **Real-time feedback** - No waiting for complete response
- **Cancel anytime** - Stop generation if needed
- **Lower perceived latency** - Start reading immediately

### Message Actions

Hover over any message to see actions:
- **📋 Copy** - Copy message content
- **🔄 Regenerate** - Get a new response (coming soon)

### Session Statistics

View detailed metrics:
- Total messages and tokens
- Cache hit/miss ratio
- Average response time
- Cost tracking

Run `Axon: Show Chat Session Statistics` to see your session stats.

## 💡 Tips & Best Practices

### Writing Effective Prompts

1. **Be specific**: Include context and requirements
   - ❌ "Generate a function"
   - ✅ "Generate a function to read all HVAC points with the 'ahu' tag"

2. **Provide examples**: Show input/output if possible
   ```
   Create a function that takes a point ID and returns its history.
   Input: @p:123
   Output: Grid with timestamp and value columns
   ```

3. **Iterate**: Refine based on AI responses
   ```
   That's good, but can you add error handling?
   ```

### Performance Tips

- **Use caching**: Similar prompts use cached responses
- **Keep sessions manageable**: Export old sessions
- **Leverage streaming**: Cancel if response goes off-track

### Integration with Editor

1. **Select code** → Run `Axon: Send Selection to Chat`
2. Choose an action:
   - 💡 Explain this code
   - ⚡ Optimize this code
   - 🐛 Find bugs
   - 📝 Add comments
   - ✨ Refactor

## 🐛 Troubleshooting

### Chat Panel Won't Open

1. Check API key is configured: `Axon: Configure AI Provider`
2. Look for errors in output: `View → Output → Axon`
3. Restart VSCode

### Streaming Not Working

1. Check setting: `axon.chat.streamingEnabled`
2. Verify network connection
3. Check API key permissions

### Code Not Applying

1. Ensure an editor is active
2. Check file is not read-only
3. Verify `confirmBeforeApply` setting

### Session Not Saving

1. Check `autoSave` is enabled
2. Verify storage permissions
3. Look for errors in logs

## 📊 Understanding Session Storage

### Where Sessions Are Stored

Sessions are saved in VSCode's global storage:
```
<userHome>/.vscode/globalStorage/<extensionId>/sessions/
```

### Storage Format

Each session is a JSON file:
```
session-1234567890-abc123.json
```

### Managing Storage

- **Maximum sessions**: 50 (configurable)
- **Auto-cleanup**: Old sessions are automatically removed
- **Manual cleanup**: Delete files from sessions directory

## 🔐 Privacy & Security

### Data Handling

- **API Key**: Stored securely in VSCode's secret storage
- **Sessions**: Stored locally on your machine
- **API Calls**: Sent directly to Anthropic, not through intermediary

### What Gets Sent to AI

When you send a prompt:
- ✅ Your message text
- ✅ Selected code (if using context features)
- ❌ Unrelated files
- ❌ Credentials or secrets

**Tip:** Review your prompt before sending to ensure no sensitive data is included.

## 🎓 Learning Resources

### Example Use Cases

1. **Learning Axon**: Ask for explanations and examples
2. **Code Review**: Get feedback on your functions
3. **Debugging**: Ask for help finding issues
4. **Documentation**: Generate comments and docs
5. **Refactoring**: Improve code quality

### Sample Conversations

**Learning:**
```
You: What is the difference between readAll() and readById()?
AI: [Explains the difference with examples]
You: Can you show me an example using readAll()?
AI: [Provides code example]
```

**Debugging:**
```
You: This function isn't working: [paste code]
AI: [Analyzes and finds issues]
You: How do I fix the syntax error on line 5?
AI: [Provides fix with explanation]
```

## 🆘 Getting Help

### Support Resources

- **View Logs**: `Axon: View MCP Server Logs`
- **Check Status**: `Axon: Check Extension Status`
- **Documentation**: Check `/docs` folder
- **GitHub Issues**: Report bugs and request features

### Common Questions

**Q: Can I use this offline?**
A: No, the AI requires an internet connection to Anthropic's API.

**Q: Does this cost money?**
A: Yes, you need an Anthropic API key with credits. See Anthropic's pricing.

**Q: Can I customize the AI's behavior?**
A: Currently, the AI uses predefined prompts. Custom system prompts coming soon.

**Q: How do I share a conversation?**
A: Export as Markdown and share the file.

## 🎉 What's Next?

Stay tuned for upcoming features:
- Multi-file context awareness
- Custom prompt templates
- Conversation branching
- Team collaboration features
- Voice input support
- Integration with Git for code reviews

---

**Happy Coding with Axon AI! 🚀**
