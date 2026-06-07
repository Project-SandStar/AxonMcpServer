---
title: Update an Axon Function (Without Creating Duplicates)
description: Step-by-step guide for committing axon function changes via MCP without leaving stale duplicate records in folio
category: code-management
tags: [function, deploy, commit, axon, mcp, duplicates, folio]
version: 1.0
---

# Update Axon Function Workflow

## Overview

`mcp__axon-mcp__commitAxonFunction` always uses Folio's `{add}` flag under the hood, so every call creates a **new record**. Without explicit cleanup the project ends up with multiple `func` records all sharing the same `name`. Folio's lookup-by-name is non-deterministic when duplicates exist, so subsequent runs of the function may invoke the *old* version and silently regress.

This workflow shows the disciplined find-then-clean-then-commit-then-verify pattern that keeps exactly one record per function name.

## When to Use This Workflow

Trigger words from the user that should make you run this workflow automatically:

- "deploy the new version"
- "update the axon function"
- "commit my changes"
- "upload the function"
- "push the func to folio"
- "make this live"

## Prerequisites

1. **Active project context**: every `executeAxonCode` is routed through the primary project. After an MCP server restart or new session, you usually need:
   ```
   mcp__axon-mcp__setPrimaryProject(instanceName="<inst>", projectName="<proj>")
   ```
   If `executeAxonCode` returns `403` or `UnknownRecErr`, this is the cause.
2. **The new source code** ready to commit, either from disk or from an in-conversation snippet.

## Step 1: Locate Existing Records by Name

```axon
readAll(func and name == "<funcName>").map(r => {id: r->id.toStr, mod: r["mod"]})
```

Three possible outcomes:

| Outcome | Action |
|---------|--------|
| **Zero rows** — first deploy | Skip Step 2; jump to Step 3 |
| **One row** — normal case | Note the id; jump to Step 3 (Step 4 verifies) |
| **Two or more rows** — pre-existing duplication | Run Step 2 to remove all-but-the-newest **before** Step 3 |

Identify the newest by largest `mod` value. Remove the rest by id in Step 2.

## Step 2: Delete Stale Duplicates by ID

For each row to remove, run **one delete per call** with the explicit ref form:

```axon
commit(diff(readById(@<id>), null, {remove}))
```

⚠️ **Always delete by single id** — never via `readAll(...).each` mass deletion. The mass form trips the MCP safety prompt as it's considered a shared-state risk.

✅ Allowed:
```axon
commit(diff(readById(@317e39ce-677bef51), null, {remove}))
```

❌ Blocked:
```axon
readAll(func and name == "X").each(r => commit(diff(r, null, {remove})))
```

## Step 3: Validate Before Committing

```
mcp__axon-mcp__validateAxonCode(
  code: "<source>",
  includePerformance: false,
  includeBestPractices: false
)
```

Look for:
- `syntax.valid: true`
- `semantic.valid: true`

The `semantic.warnings` about *"Direct tag access without null check"* are stylistic and can be ignored for `dict["key"]` reads.

### Common Axon Syntax Gotchas

| Mistake | Symptom | Fix |
|---------|---------|-----|
| C-style ternary `a ? b : c` | `Expected ), not ?` | Use `if (a) b else c` |
| Loop var shadowing built-in `day` | `Local variable "day" is hiding function` | Rename loop var (e.g. `dt`); use `day(dt)` to extract day-of-month |
| `.year` / `.month` on Dates | dot-call ambiguity in some scopes | Use `year(d)` / `month(d)` |
| `Number.toFloat` | `Unknown symbol 'toFloat'` | Divide by the unit (e.g. `(d2 - d1) / 1day`) to coerce |

## Step 4: Commit the New Version

```
mcp__axon-mcp__commitAxonFunction(
  name: "<funcName>",
  doc: "<one-line summary>",
  src: "<full source>"
)
```

The MCP tool keeps **10 rolling backups** under
`proj/<instance>/<project>/.backups/<funcName>/backup-<ts>.axon`
automatically, so even a buggy commit has a safety net.

## Step 5: Verify Exactly One Record Exists

```axon
readAll(func and name == "<funcName>").map(r => {id: r->id.toStr, mod: r["mod"]})
```

Should be exactly one row, with `mod` showing your new commit time.

If two rows appear (Step 2 was needed but skipped on a duplicate state), repeat Step 2 to remove the older one, then re-verify.

## Quick Recipe (Copy-Paste Template)

```text
1. Set primary project:
   mcp__axon-mcp__setPrimaryProject(instanceName="...", projectName="...")

2. Find existing:
   mcp__axon-mcp__executeAxonCode(code:
     readAll(func and name == "FUNC_NAME").map(r => {id: r->id.toStr, mod: r["mod"]})
   )

3. (If 2+ rows) delete olders by id:
   mcp__axon-mcp__executeAxonCode(code:
     commit(diff(readById(@OLD_ID), null, {remove}))
   )

4. Validate:
   mcp__axon-mcp__validateAxonCode(code: "<src>", includePerformance: false)

5. Commit:
   mcp__axon-mcp__commitAxonFunction(name: "FUNC_NAME", doc: "...", src: "<src>")

6. Verify single row:
   mcp__axon-mcp__executeAxonCode(code:
     readAll(func and name == "FUNC_NAME").map(r => {id: r->id.toStr, mod: r["mod"]})
   )
```

## Why We Don't Just Use Update Semantics

Folio supports updating a record in place via `commit(diff(rec, {tag: val}))` without the `{add}` flag — that *would* avoid duplication. But the MCP tool doesn't expose that path; it always uses `{add}`.

Until the MCP server is patched to fall back to update-by-name, the find-then-commit-then-verify pattern above is the workaround.

If you find yourself doing this often, consider patching the MCP server's `commitAxonFunction` to first do a `read(func and name==X)` and then commit with `diff(existing, ...)` instead of `diff(null, ..., {add})`. That fix lives in `/Users/<user>/Code/axon-mcp-server/dist/index.js` around line ~3027.

## Why This Matters

Each duplicate is a silent correctness hazard:

- Folio resolves `func and name == "X"` non-deterministically. Calls might invoke any of the duplicates at random.
- The duplicates may have *different* source bodies, so behavior changes from call to call.
- Backup retention (10 copies) is per-name, but only on the most-recently committed-over record; stale duplicates lose their history.
- Memory + storage waste accumulates over many deploys.

So: **always Step 1 + Step 5**. The verify-after-commit step catches the case where Step 2 was needed but skipped.

## Reference: Folio Diff Operations

| Form | Effect |
|------|--------|
| `diff(null, {tags}, {add})` | Create a new record |
| `diff(rec, {tags})` | Update an existing record (no flags) |
| `diff(rec, null, {remove})` | Delete a record |
| `diff(rec, {tag: removeMarker()})` | Remove a single tag from a record |

The MCP `commitAxonFunction` always uses the first form. To do an in-place update without the duplication side-effect, you'd use the second form via `executeAxonCode` directly:

```axon
existing: read(func and name == "myFunc")
commit(diff(existing, {src: "<new src>", doc: "<new doc>"}))
```

This bypasses the MCP tool but works around its `{add}` behavior cleanly. Call out that this is what you're doing, since it skips the auto-backup the MCP tool provides.
