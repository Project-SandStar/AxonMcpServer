---
name: axon-mcp
description: SkySpark Axon from the Axon MCP server (examples, patterns, docs, call graph, Haystack queries, run and commit Axon in the active SkySpark project). Use it before writing or guessing Axon. Tools are deferred - ToolSearch("axon", 30) first.
---

# Axon MCP: which tool, when

The server knows Axon: an example and pattern library, the SkySpark docs, a
call graph and vectors over the Axon functions of the active project, and a
live connection to SkySpark projects. The tools are deferred. Load them once
per session:

```
ToolSearch("axon", 30)
```

**Active project first.** `executeAxonCode`, `commitAxonFunction`,
`queryHaystack` and `getProjectSchema` act on this MCP session's active
SkySpark project. Call `getPrimaryProject` before the first one, and pass
`project` ("instance/project") on every run or commit to pin the target.
Switch with `switchSkySparkProject` (this session only) or `setPrimaryProject`
(also the default for new sessions). A wrong-project commit is the most
common mistake.

**SkySpark docs live on the MCP server.** Use `searchAxonDocs` (param
`keyword`), then `getAxonDoc` with the `docId` it returns. `listAxonDocs`
lists libraries and pages. Never ls/find/cat local doc paths.

| You want to | Call | Notes |
|---|---|---|
| Write new Axon | `searchAxonExamples`, `getAxonPattern`, `searchAxonDocs` | Then `validateAxonCode` before running it. `/axon-mcp:wf-axon-lang-information` lists the syntax traps. |
| Read SkySpark docs | `searchAxonDocs`, then `getAxonDoc` | `listAxonDocs` to browse (docSkySpark, docFresco, lib-*). Docs are on the server; never read local doc files. |
| Look up an operator | `searchAxonOperatorExamples` | `>=`, `==`, `->` and so on. |
| Generate from a template | `listAxonTemplates`, `generateAxonCode` | |
| Run Axon | `executeAxonCode` | `project` set. Read-only first; confirm with the user before code that writes. |
| Save a function | `commitAxonFunction` | `project` set. Updates in place by name: never delete first. `/axon-mcp:wf-axon-func-update`. |
| Query points, equips, sites, history | `queryHaystack` | Haystack filter. `getProjectSchema` to browse what exists. |
| Find a function by meaning | `semanticCodeSearch`, `findSimilarCode` | |
| Find by text or regex | `searchAxonRegex`, `findFunctionUsage` | |
| Know what breaks if you change a function | `getCallers`, then `getCodeImpact` | Before every change to a shared function. |
| Follow calls | `getCallees`, `findCodePath`, `getFunctionCallGraph` | |
| Read the graph | `queryGraph`, `getMostCalledFunctions`, `getPageRank`, `detectCycles` | |
| Rebuild the index | `buildProjectGraph`, `buildProjectEmbeddings`, `getGraphStats` | After many commits, or when results look stale. |
| List or switch projects | `listSkySparkProjects`, `switchSkySparkProject`, `discoverProjectFunctions` | `reauthenticateSkySparkProject` on a 401 from SkySpark. |
| Find a workflow | `searchWorkflows` | Or the `/axon-mcp:wf-*` skills below. |

**With the Fantom MCP plugin.** Fantom's `axonSearch` and `axonFunction` search
Axon functions across every indexed project. The tools here work on the active
SkySpark project and can run and commit code. Use Fantom's for "where else is
this done", and these for the project you are changing.

Rules:

- When a tool returns nothing, say "not found in the Axon index" rather than
  invent a SkySpark function. Many look plausible and do not exist.
- A failing tool with a connection error means the server is down. Run
  `/axon-mcp:doctor` and tell the user. Do not retry in a loop.
- Never send credentials or tokens through `executeAxonCode`.

Workflows (full guides, load on demand): `/axon-mcp:wf-axon-func-update`,
`wf-axon-lang-information`, `wf-spark-rule-creation`,
`wf-cur-rule-computed-points`, `wf-app-creation`, `wf-recform-template-design`,
`wf-html-email-skyspark`, `wf-job-status-check`,
`wf-task-subscriber-permissions`, `wf-mobilytik-dashboard-generation`,
`wf-visualytik-mcp-authoring`, and more: `ls` the plugin's `skills/` or call
`listWorkflows`.
