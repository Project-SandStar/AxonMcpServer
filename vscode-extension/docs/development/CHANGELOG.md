# Change Log

All notable changes to the "Axon VSCode Extension" will be documented in this file.

## [0.1.0] - 2025-01-01

### Added
- 🤖 **AI Code Generation** - Plan-act workflow with Claude Sonnet for intelligent Axon code generation
- 💬 **Interactive Chat Panel** - Full-featured chat interface with streaming responses
- 📚 **MCP Server Integration** - Embedded axon-mcp-server for code examples and documentation
- 🔍 **Smart Search** - Search Axon examples, docs, and operators via MCP
- 💡 **Code Intelligence** - Explain and optimize Axon code
- ⚡ **Streaming Responses** - Real-time AI responses with cancelation support
- 📝 **Session Management** - Save, load, and export chat conversations
- 🎨 **Code Actions** - Apply generated code to editor or copy to clipboard
- 📊 **Performance Monitoring** - Track operation performance and costs
- 🗄️ **Four-Level Caching** - Aggressive caching to minimize API costs
  - L1: In-memory semantic cache
  - L2: Context cache
  - L3: MCP query cache
  - L4: Global cache with statistics

### Commands
- `Axon: Generate Function` - Generate new Axon functions with AI
- `Axon: Explain Code` - Get detailed explanations of selected code
- `Axon: Optimize Code` - Improve code quality and performance
- `Axon: Search Examples` - Find code examples via MCP
- `Axon: Search Documentation` - Search Axon docs
- `Axon: Configure AI Provider` - Set up Anthropic API key
- `Axon: Check Extension Status` - View extension health
- `Axon: Connect to SkySpark` - Configure SkySpark connection
- `Axon: Open AI Chat Panel` - Open interactive chat interface
- `Axon: New Chat Session` - Start fresh conversation
- `Axon: Export Chat Session` - Export as JSON or Markdown
- `Axon: Clear Chat Session` - Clear conversation history
- `Axon: Show Chat Session Statistics` - View session metrics
- `Axon: List Chat Sessions` - Browse past conversations
- `Axon: Toggle Streaming Mode` - Enable/disable streaming
- `Axon: Send Selection to Chat` - Send code to chat for analysis
- `Axon: MCP Server Actions` - Start/stop/restart MCP server
- `Axon: View MCP Server Logs` - View server logs
- `Axon: View Cache Statistics` - See cache performance
- `Axon: Clear All Caches` - Reset all caches
- `Axon: View Performance Report` - See operation metrics
- `Axon: Export Performance Statistics` - Export metrics as JSON

### Configuration
- **AI Settings**: Provider selection, model configuration, API keys
- **Chat Settings**: 9 customizable options for chat behavior
- **Cache Settings**: Granular control over caching layers
- **Performance Settings**: Monitoring and threshold configuration
- **MCP Settings**: Server enable/disable
- **SkySpark Settings**: Connection configuration

### Features
- ✨ Real-time streaming responses
- 🔄 Conversation history with auto-save
- 📋 One-click code application to editor
- 🎯 Context-aware code generation using MCP
- 📈 Cost tracking and cache hit rates
- 🔐 Secure API key storage in VSCode secrets
- 🎨 VSCode theme integration
- ⚡ Optimized performance with caching
- 🛡️ Comprehensive error handling
- 📊 Detailed session statistics

### Technical
- Built with TypeScript 5.x
- Webpack bundled for optimal performance
- MCP server bundled for production
- 33 passing unit tests for SessionManager
- Comprehensive logging system
- Performance monitoring integration
- Error handler with recovery strategies

### Documentation
- Complete user guide with examples
- Technical architecture documentation
- API reference for all components
- Troubleshooting guide
- Best practices

## [Unreleased]

### Planned Features
- Multi-file context awareness
- Custom prompt templates
- Conversation branching
- Code diff preview
- Integration tests
- Voice input support
- Team collaboration features
- Git integration for code reviews
