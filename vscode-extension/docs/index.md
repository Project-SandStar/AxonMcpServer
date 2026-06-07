# Axon VSCode Extension

An AI-powered VSCode extension for Axon development with integrated MCP server, code generation, and SkySpark connectivity.

## Features

- **AI-Powered Code Generation** - Generate Axon code using Claude AI
- **Integrated Chat Panel** - Interactive chat for code questions and generation
- **MCP Server Integration** - Connect to Axon MCP Server for code search and execution
- **SkySpark Connectivity** - Execute code directly in SkySpark projects
- **DefComp Templates** - Generate component definitions from templates
- **Performance Monitoring** - Track and optimize extension performance

## Quick Links

- [API Key Setup](getting-started/API_KEY_SETUP.md) - Configure your Anthropic API key
- [User Guide](guides/USER_GUIDE.md) - Complete usage guide
- [Chat Panel](features/PHASE6_CHAT_PANEL.md) - Using the AI chat interface
- [Troubleshooting](troubleshooting/MCP_TROUBLESHOOTING.md) - Common issues and solutions

## Installation

1. Install from VSCode Marketplace or build from source
2. Configure your Anthropic API key
3. Connect to your SkySpark instance
4. Start generating code!

```bash
# Build from source
cd vscode-extension
npm install
npm run compile
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Chat Panel  │  │   Sidebar    │  │   Commands   │       │
│  │  (Webview)   │  │  (Webview)   │  │              │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         └─────────────────┼─────────────────┘               │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │              Workflow Orchestrator                   │    │
│  │         (Haiku planning → Sonnet generation)         │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌──────────────┐  ┌──────▼───────┐  ┌──────────────┐       │
│  │  MCP Client  │  │ Context      │  │  Anthropic   │       │
│  │              │  │ Gatherer     │  │  SDK         │       │
│  └──────┬───────┘  └──────────────┘  └──────────────┘       │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│                    Axon MCP Server                          │
│         (25 tools for search, execute, generate)            │
└─────────────────────────────────────────────────────────────┘
```

## Documentation

Use `mkdocs serve` to browse documentation locally:

```bash
cd vscode-extension
pip install mkdocs mkdocs-material
mkdocs serve
```

Then open [http://localhost:8000](http://localhost:8000)
