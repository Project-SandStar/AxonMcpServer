# AGENTS.md

Guidance for AI coding agents working in this repository. Project details are
in CLAUDE.md and README.md.

## Use context-mode for reading and searching

This repository is large. Raw `grep`, `cat`, `find` and long log tails flood
the context window and slow every agent down.

Use the **context-mode** tools for any search or read that may return more
than a few dozen lines. Only the result you print enters your context.

| Task | Use | Not |
|---|---|---|
| Search code or text across files | context-mode `ctx_batch_execute` or `ctx_execute` with a small script that prints only the matches you need | `grep -r`, `rg`, `find` with long output |
| Read part of a large file to analyse it | context-mode `ctx_execute_file` (path + code that prints only what you need) | `cat` of the whole file |
| Read a file you are about to edit | the Read tool, with `offset`/`limit` for the part you need | context-mode (Edit needs the exact bytes in context) |
| Logs, test and build output | context-mode: filter by time and pattern, print counts, failures and the last few matches | long `tail`, full test output |
| Fetch a web page or API | context-mode `ctx_fetch_and_index`, then `ctx_search` | `curl` into the context |
| Text you need again later | context-mode `ctx_index`, then `ctx_search` | reading it twice |

Short, targeted shell commands are fine: `git status`, `git log --oneline -5`,
`ls` of one folder.

If the context-mode tools are not available in a session, keep shell output
small: filter with `head`, `tail`, `grep -c`, `wc -l`, and never print whole
logs, generated files or build folders.

Never search these folders: node_modules/, dist/, dashboard/.next/, dashboard/node_modules/, proj/ (synced SkySpark projects), cache folders.

Several agents may work in this repo at once: work in your own git worktree
under `.worktrees/<name>` (ignored by git), commit only your own files, and
never print secrets (tokens, passwords, keys, `.env` values).
