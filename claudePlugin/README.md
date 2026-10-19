# Axon MCP: Claude Code plugin

This plugin connects Claude Code to the Axon MCP server. It adds:

- **MCP server** `axon`: every Axon MCP tool, through the mcp-proxy on `:9191` by default.
- **Skills**: `axon-mcp` (which tool to use, and when), `/axon-mcp:doctor`, `/axon-mcp:status`,
  and one `/axon-mcp:wf-*` skill for each file in `workflows/`.
- **Hooks**
  - `SessionStart`: checks the server. In a directory with `.axon` or `.trio` files, it
    tells the model whether the server is up and to check the active SkySpark project
    before running or committing code.
  - `UserPromptSubmit`: adds one short hint (tool and workflow) to prompts about Axon or
    SkySpark. It makes no network call.

There is no edit-report hook, because the Axon server has no change-report endpoint. All
hooks fail open: a server that is down never blocks a prompt.

## Install

You need Node 20+ and the `claude` CLI. The server must run on `:3847`, and the mcp-proxy
on `:9191` serves it as `/axon/mcp`.

```bash
npm run plugin:install                       # from the repo root
# or
claudePlugin/scripts/install-local.sh --remove-legacy
```

The install builds `dist/`, adds this directory as the `axon-mcp` marketplace, installs
`axon-mcp@axon-mcp` and runs the doctor.

`--remove-legacy` removes the manual `axon-mcp` entries made with `claude mcp add`. While
such an entry exists, Claude Code uses it and turns off the plugin's own server. Each
removal of a local entry by direct edit makes a backup of `~/.claude.json` first.

Then start a new session, or run `/reload-plugins`. `/mcp` shows the server as
`plugin:axon-mcp:axon`.

From another machine, without a checkout:

```bash
claude plugin marketplace add <git url of this repo>   # or the Project Sandstar MCP marketplace repo
claude plugin install axon-mcp@axon-mcp                # axon-mcp@project-sandstar-mcp from project-sandstar-mcp
```

`dist/` is committed and the repo root holds the marketplace, so the clone has
the built plugin. Use one marketplace per plugin, not both.

## Settings

| Option | Default | Use |
|---|---|---|
| `mcp_url` | `http://localhost:9191/axon/mcp` | MCP endpoint. Set it to `http://localhost:3847/mcp` to skip the proxy. |
| `server_url` | `http://localhost:3847` | Health check for the hooks and the doctor. |

Change them with `claude plugin configure axon-mcp@axon-mcp`.

## Work on the plugin

```bash
npm run plugin:build      # build dist/ and run claude plugin validate
npm run plugin:test       # build, unit tests with a fake server, live checks when :3847 is up
```

- Edit `src/`, never `dist/` (the build deletes and rebuilds it).
- A workflow skill takes its `title` and `description` from the workflow's frontmatter.
  File names change to kebab case: `curRule-computed-points.md` becomes
  `wf-cur-rule-computed-points`.
- The version comes from the root `package.json`.
- Commit `claudePlugin/dist` with every change: git installs use it as is.

## Remove

```bash
claudePlugin/scripts/uninstall-local.sh
```

## Use with the Fantom MCP plugin

The two plugins are separate and work side by side. Fantom's `axonSearch` and
`axonFunction` search Axon functions across every indexed project. This plugin works on
the active SkySpark project and can run and commit code. The prompt hints of this plugin
fire only on Axon or SkySpark prompts, or in Axon directories, so the two do not compete.
