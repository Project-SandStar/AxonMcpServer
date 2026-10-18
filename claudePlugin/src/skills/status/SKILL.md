---
name: status
description: One-screen Axon MCP status - server, endpoint, index size, sessions.
---

Axon MCP status:

```
!`node "${CLAUDE_SKILL_DIR}/../../bin/axon-mcp.mjs" status 2>&1 || true`
```

If the block above is empty (shell injection is off), run it yourself:

```
node "${CLAUDE_SKILL_DIR}/../../bin/axon-mcp.mjs" status
```

Show the lines as they are. If the server is DOWN, point to `/axon-mcp:doctor`.
To see the active SkySpark project, call the `getPrimaryProject` tool.
