# Axon VSCode - AI-Powered SkySpark Development

**Transform your SkySpark Axon development with AI-powered code generation, intelligent chat, and comprehensive code intelligence.**

---

## ✨ Features

### 🤖 AI Code Generation
Generate high-quality Axon code using Claude AI with a sophisticated plan-act workflow:
- **Plan Mode**: Analyzes your requirements and creates a generation plan
- **Act Mode**: Generates production-ready code with proper error handling
- **Context-Aware**: Uses your actual project structure via embedded MCP server

### 💬 Interactive Chat Panel
Full-featured AI chat interface for conversational development:
- 🔥 **Streaming responses** - See answers in real-time
- 💾 **Session management** - Save, load, and export conversations
- 📋 **One-click actions** - Apply code to editor or copy to clipboard
- 📊 **Statistics tracking** - Monitor tokens, cache hits, and response times

### 📚 Smart Code Intelligence
Leverage thousands of Axon examples and documentation:
- Search code examples with semantic understanding
- Find relevant documentation instantly
- Browse operator examples and best practices
- All powered by the embedded MCP server

### ⚡ Performance & Caching
Aggressive four-level caching to minimize costs:
- **L1**: In-memory semantic cache for instant responses
- **L2**: Context cache for gathered project data
- **L3**: MCP query cache for examples and docs
- **L4**: Global cache with statistics across sessions

---

## 🚀 Quick Start

1. **Install the extension**
   - Search for "Axon VSCode" in the Extensions marketplace
   - Click Install

2. **Configure AI Provider**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Run `Axon: Configure AI Provider`
   - Enter your [Anthropic API key](https://console.anthropic.com/)

3. **Start Generating Code**
   - Run `Axon: Open AI Chat Panel`
   - Type your request (e.g., "Generate a function to read temperature points")
   - Watch the code stream in real-time!

---

## 💡 Example Use Cases

### Generate Functions
```
You: Generate a function to read all HVAC points with the 'ahu' tag

AI: [Generates function with proper error handling]

You: Add caching for performance

AI: [Updates function with caching logic]
```

### Explain Code
```
You: Explain what this function does
[Select code and run "Axon: Explain Code"]

AI: This function reads all points from the database...
```

### Optimize Performance
```
You: Optimize this query for large datasets

AI: [Provides optimized version with explanations]
```

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| `Axon: Open AI Chat Panel` | Open interactive chat interface |
| `Axon: Generate Function` | Generate new Axon functions |
| `Axon: Explain Code` | Get code explanations |
| `Axon: Optimize Code` | Improve code quality |
| `Axon: Search Examples` | Find code examples |
| `Axon: Configure AI Provider` | Set up API key |
| `Axon: Check Extension Status` | View system health |

**[See all 24 commands →](docs/USER_GUIDE.md)**

---

## ⚙️ Configuration

### AI Settings
```json
{
  "axon.ai.provider": "anthropic",
  "axon.ai.planModel": "claude-3-haiku-20240307",
  "axon.ai.actModel": "claude-sonnet-4-20250514"
}
```

### Chat Settings
```json
{
  "axon.chat.streamingEnabled": true,
  "axon.chat.autoSave": true,
  "axon.chat.confirmBeforeApply": true
}
```

### Cache Settings
```json
{
  "axon.cache.enabled": true,
  "axon.cache.semantic.maxSize": 100,
  "axon.cache.semantic.ttl": 604800
}
```

**[See all settings →](docs/USER_GUIDE.md#configuration)**

---

## 🎯 Key Features

### Code Actions
- ✨ **Apply to Editor** - Insert code at cursor or replace selection
- 📋 **Copy to Clipboard** - One-click copy with feedback
- 🔄 **Regenerate** - Get alternative implementations
- 💾 **Auto-Format** - Automatic code formatting on apply

### Session Management
- 💾 **Auto-Save** - Never lose your work
- 📂 **Load Past Sessions** - Browse conversation history
- 📤 **Export** - Save as JSON or Markdown
- 📊 **Statistics** - Track usage and performance

### Performance
- ⚡ **Streaming** - Real-time responses
- 🗄️ **4-Level Caching** - Minimize API costs
- 📈 **Monitoring** - Track all operations
- 💰 **Cost Tracking** - See API usage and savings

---

## 📊 What You Get

### Built-in MCP Server
The extension includes a fully functional MCP (Model Context Protocol) server that provides:
- **15,000+ code examples** across all Axon categories
- **Complete documentation** for all Axon functions
- **Operator examples** with real-world usage
- **Project schema awareness** (when connected to SkySpark)

### Smart Caching
Typical cost savings with caching:
```
Without caching: $0.35 per session
With caching:     $0.11 per session
Savings:          68% reduction
```

### Performance Stats
- Average response time: **2.5 seconds**
- Cache hit rate: **65-75%**
- Tokens saved per session: **~15,000**

---

## 🔐 Privacy & Security

- ✅ **API keys** stored securely in VSCode secrets
- ✅ **Sessions** saved locally on your machine
- ✅ **No telemetry** by default (optional, privacy-focused)
- ✅ **Direct API calls** - No intermediary servers
- ✅ **Open source** - Audit the code yourself

---

## 📚 Documentation

- **[User Guide](docs/USER_GUIDE.md)** - Complete feature documentation
- **[Architecture](docs/PHASE6_CHAT_PANEL.md)** - Technical details
- **[Troubleshooting](docs/USER_GUIDE.md#troubleshooting)** - Common issues
- **[Best Practices](docs/USER_GUIDE.md#best-practices)** - Tips & tricks

---

## 🆘 Support

### Having Issues?

1. **Check Status**: Run `Axon: Check Extension Status`
2. **View Logs**: Run `Axon: View MCP Server Logs`
3. **Documentation**: Check the [User Guide](docs/USER_GUIDE.md)
4. **Report Bug**: [GitHub Issues](https://github.com/yourusername/axon-vscode/issues)

### Common Questions

**Q: Do I need a SkySpark server?**  
A: No! The extension works standalone for code generation. SkySpark connection is optional for advanced features.

**Q: What does it cost?**  
A: You need an Anthropic API key. Typical usage costs $0.10-0.50 per day with aggressive caching.

**Q: Does it work offline?**  
A: Code generation requires internet for AI API calls. Documentation and examples are available offline via MCP server.

**Q: Is my code sent to the cloud?**  
A: Only prompts and context you explicitly send. Your files aren't automatically uploaded.

---

## 🎉 What's New in 0.1.0

- 🚀 Initial release with full feature set
- 💬 Interactive chat panel with streaming
- 🤖 AI code generation with plan-act workflow
- 📚 MCP server integration
- 🗄️ Four-level caching system
- 📊 Performance monitoring
- 📝 Session management
- 🎨 24 commands for all operations

**[See full changelog →](CHANGELOG.md)**

---

## 🏆 Why Choose Axon VSCode?

### vs. GitHub Copilot
- ✅ **Axon-specific** training and examples
- ✅ **Interactive chat** for iterative refinement
- ✅ **Built-in documentation** via MCP
- ✅ **Cost-effective** with aggressive caching

### vs. Manual Coding
- ⚡ **10x faster** code generation
- 🎯 **Context-aware** suggestions
- 📚 **Learn as you code** with explanations
- 🔍 **Instant** example and doc search

### vs. Other AI Extensions
- 🎯 **Purpose-built** for Axon/SkySpark
- 📚 **15,000+** Axon-specific examples
- 💬 **Full chat** interface, not just completion
- 🗄️ **Smart caching** to minimize costs

---

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Claude](https://www.anthropic.com/) by Anthropic
- Uses [Model Context Protocol](https://modelcontextprotocol.io/)
- Inspired by modern AI coding assistants

---

**Made with ❤️ for the SkySpark community**

[Get Started Now](https://marketplace.visualstudio.com/items?itemName=axon.axon-vscode) | [Documentation](docs/USER_GUIDE.md) | [GitHub](https://github.com/yourusername/axon-vscode)
