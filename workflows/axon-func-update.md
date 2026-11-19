---
title: Update an Axon Function (One Record per Name)
description: Step-by-step guide for committing axon function changes via MCP with commitAxonFunction, with the stale-write check and one func record per name
category: code-management
tags: [function, deploy, commit, axon, mcp, duplicates, folio]
version: 2.0
---

# Update Axon Function Workflow

## Overview

`mcp__axon-mcp__commitAxonFunction` keeps exactly one `func` record per name:

- A function that exists is **updated in place** (`commit(diff(existing, changes))`, no `{add}`). The record keeps its id.
- A new function is added (`{add}`). This is the only case that adds a record.
- If older records with the same name are already there (an old server build added a new record on every commit), the tool updates the newest one (largest `mod`) and removes the others. It **backs up each one first**: the whole record (id, `mod`, `src`, `doc`, all tags) goes to `.backups/<funcName>/removed-<ts>-<id>.json`, and only then is the record removed. If a backup cannot be written, nothing is committed and no record is removed; the tool returns the error. `removedDuplicates` in the reply lists them: `[{id, mod, backup}]`.

Do **not** delete records before you commit. The tool does the clean-up.

The MCP tool and the IDE API (`POST /api/ide/projects/{instance}/{project}/functions/{name}`) use the same code: `commitFunction()` in `src/ide/commitFunction.ts`.

## When to Use This Workflow

Trigger words from the user that should make you run this workflow automatically:

- "deploy the new version"
- "update the axon function"
- "commit my changes"
- "upload the function"
- "push the func to folio"
- "make this live"

## Prerequisites

1. **Active project**: call `mcp__axon-mcp__getPrimaryProject` and confirm the instance and project. Pass `project` ("instance/project") on the commit: a wrong project makes the call fail instead of writing to the wrong place.
2. **The new source code**, from disk or from the conversation.

## Step 1: Read the Current Record (for the stale-write check)

```axon
read(func and name == "<funcName>", false).map(r => {mod: r["mod"], doc: r["doc"]})
```

Note the `mod`. If the function is new, there is no row; use `expectedMod: null` in Step 3.

## Step 2: Validate Before Committing

```
mcp__axon-mcp__validateAxonCode(
  code: "<source>",
  includePerformance: false,
  includeBestPractices: false
)
```

Look for `syntax.valid: true` and `semantic.valid: true`. The `semantic.warnings` about *"Direct tag access without null check"* are stylistic and can be ignored for `dict["key"]` reads.

### Common Axon Syntax Gotchas

| Mistake | Symptom | Fix |
|---------|---------|-----|
| C-style ternary `a ? b : c` | `Expected ), not ?` | Use `if (a) b else c` |
| Loop var shadowing built-in `day` | `Local variable "day" is hiding function` | Rename loop var (e.g. `dt`); use `day(dt)` to extract day-of-month |
| `.year` / `.month` on Dates | dot-call ambiguity in some scopes | Use `year(d)` / `month(d)` |
| `Number.toFloat` | `Unknown symbol 'toFloat'` | Divide by the unit (e.g. `(d2 - d1) / 1day`) to coerce |

## Step 3: Commit

```
mcp__axon-mcp__commitAxonFunction(
  name: "<funcName>",
  src: "<full source>",
  project: "<instance>/<project>",
  expectedMod: "<mod from Step 1, or null for a new function>"
)
```

Rules:

| Argument | Effect |
|----------|--------|
| `doc` not given | The stored doc is kept. Pass `""` to clear it. |
| `expectedMod` ISO date-time | The commit is refused if the record's `mod` is not that time. |
| `expectedMod: null` | The function must not exist yet. |
| `expectedMod` not given | No stale-write check. |
| `name` | A letter, then letters, digits or `_`. Other names are refused before anything is sent. |

The reply:

- `"status": "ok"`: `operation` ("added" or "updated"), the new `mod` (use it as the next `expectedMod`), `hash` (sha256 of src), `doc`, `backupPath`, `removedDuplicates`.
- `"status": "conflict"` (an error reply): the function changed since you read it. Nothing was written. The reply holds the server's `mod` and `hash`. Read the function again, merge, and commit with the new `mod`.

The tool keeps the last **10 backups** of the replaced source under
`proj/<instance>/<project>/.backups/<funcName>/backup-<ts>.axon`. The backups of removed duplicates
(`removed-<ts>-<id>.json`, the whole record) in the same folder are never trimmed.

## Step 4 (optional): Verify

```axon
readAll(func and name == "<funcName>").map(r => {id: r->id.toStr, mod: r["mod"]})
```

There should be one row, with the `mod` from the reply.

## Quick Recipe

```text
1. mcp__axon-mcp__getPrimaryProject()
2. mcp__axon-mcp__executeAxonCode(code:
     read(func and name == "FUNC_NAME", false).map(r => {mod: r["mod"]}))
3. mcp__axon-mcp__validateAxonCode(code: "<src>", includePerformance: false)
4. mcp__axon-mcp__commitAxonFunction(name: "FUNC_NAME", src: "<src>",
     project: "INSTANCE/PROJECT", expectedMod: "<mod>")
5. On "conflict": read again, merge, retry with the new mod.
```

## Why One Record per Name Matters

Folio has a unique `id` but no unique `name` on `func`. With two records of one name:

- `func and name == "X"` picks one of them, so a call may run the old source.
- The records may hold different source, so behaviour changes from call to call.

That is why the tool updates in place and removes older records with the same name.

## Reference: Folio Diff Operations

| Form | Effect |
|------|--------|
| `diff(null, {tags}, {add})` | Create a new record |
| `diff(rec, {tags})` | Update an existing record (no flags) |
| `diff(rec, null, {remove})` | Delete a record |
| `diff(rec, {tag: removeMarker()})` | Remove a single tag from a record |

`commitAxonFunction` uses the second form for a function that exists and the first form only for a new one.
