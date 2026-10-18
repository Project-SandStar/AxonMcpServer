---
name: doctor
description: Check the Axon MCP plugin - server, proxy, plugin install, and duplicate manual MCP entries.
---

# Axon MCP doctor

Result for `${CLAUDE_PROJECT_DIR}`:

```
!`node "${CLAUDE_SKILL_DIR}/../../bin/doctor.mjs" --cwd "${CLAUDE_PROJECT_DIR}" 2>&1 || true`
```

If the block above is empty (shell injection is off), run it yourself:

```
node "${CLAUDE_SKILL_DIR}/../../bin/doctor.mjs" --cwd "${CLAUDE_PROJECT_DIR}"
```

Then tell the user, in one short list, what failed and the fix line the doctor
printed. Common cases:

- **server not reachable**: start it in the axon-mcp-server repo with
  `npm run daemon:start` (PM2) or `npm run start:http`.
- **mcp endpoint not reachable**: the `:9191` mcp-proxy is down. Start it
  (`pm2 start mcp-proxy`), or set the plugin option `mcp_url` to the server's
  own `/mcp` URL.
- **legacy MCP entry**: the fix is one command, run it for the user after they
  agree: `node "${CLAUDE_SKILL_DIR}/../../bin/axon-mcp.mjs" clean-legacy`
  (add `--dry-run` to list first). While a manual `axon-mcp` entry exists,
  Claude Code suppresses the plugin's own MCP server.
