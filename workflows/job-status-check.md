---
title: Check SkySpark Job Status
description: Step-by-step guide for inspecting active jobs, recent runs, and progress logs without instructions
category: monitoring
tags: [job, monitoring, status, jobLog, jobStatusAll, debugging, sync]
version: 1.0
---

# Check SkySpark Job Status Workflow

## Overview

When the user asks anything like *"is the sync running?"*, *"check job progress"*, *"is everything moving along well?"*, or *"how far along is the import?"*, follow this workflow to answer without asking how to do it.

SkySpark jobs run in the background using `jobRun(expr)`. They live as **two distinct entities**:

1. **Job records** — folio Dicts with the `job` marker tag. They define the schedule and the expression to run.
2. **Run handles** — runtime ids generated each time the job fires. Used to fetch live status and logs.

`jobLog` takes the **handle string**, not the `@id` of the job record — confusing the two yields `Job handle not found`.

## When to Use This Workflow

Trigger words from the user that should make you run this workflow automatically:

- "is the sync running"
- "check the job"
- "what's the status"
- "is it making progress"
- "how is the import going"
- "any errors in the run"
- "show me the job log"

## Prerequisites

Before checking job status:

1. **Active project context**: every `executeAxonCode` is routed through the primary project. After an MCP server restart or new session, you usually need:
   ```
   mcp__axon-mcp__setPrimaryProject(instanceName="<inst>", projectName="<proj>")
   ```
   If `executeAxonCode` returns `403` or `UnknownRecErr` on entities you know exist, this is the cause.
2. **`mcp__axon-mcp__listSkySparkProjects`** can confirm the project is loaded; if missing, the MCP server needs a restart to pick up new `<instance>-skyspark.json` configs.

## Step 1: Find the Configured Job Records

Run this to enumerate all scheduled jobs in the project:

```axon
readAll(job).sortDis.map(r => {
  dis: r->dis,
  id: r->id.toStr,
  expr: r["jobExpr"],
  jobLastStatus: r["jobLastStatus"],
  jobLastTime: r["jobLastTime"],
  jobLastRuntime: r["jobLastRuntime"]
})
```

Returns one row per scheduled job. Note `dis` (e.g. *"SolrenView Sync All"*) and `id` (the job-record ref).

## Step 2: Find Active or Recent Run Handles

`jobStatusAll()` is the canonical "what's happening now" query:

```axon
jobStatusAll()
```

| Column | Meaning |
|--------|---------|
| `handle` | runtime id — pass this string (not `@ref`) to `jobLog` |
| `jobStatus` | `pending` / `running` / `cancelling` / `doneOk` / `doneErr` / `doneCancel` |
| `dis` | display name or expr |
| `progress` | integer percent 0–100 (only meaningful if the job calls `jobProgress()`) |
| `progressMsg` | latest progress message |
| `started` | DateTime job was started |
| `runtime` | Number with `sec` / `min` / `hr` unit |

To filter to running jobs only:

```axon
jobStatusAll()
  .findAll(r => r["jobStatus"] == "running")
  .map(r => {
    handle: r["handle"],
    dis: r["dis"],
    runtime: r["runtime"],
    progress: r["progress"],
    progressMsg: r["progressMsg"]
  })
```

If the result is empty, no jobs are running and the user's "active job" no longer exists. Show the most recent `doneOk` / `doneErr` from `jobStatusAll()` instead.

## Step 3: Read the Run's Log

```axon
jobLog("<handle-string>")
```

Returns a Grid of `{ts, level, msg, errTrace}` rows.

**Always filter aggressively.** Long-running jobs accrue 10k+ lines. Never dump the full log into context.

### Day-completion summaries

```axon
jobLog("<handle>").findAll(r => r["msg"].toStr.contains(": fetched="))
```

Each row is one completed day-step.

To see the latest 5 only:

```axon
days: jobLog("<handle>").findAll(r => r["msg"].toStr.contains(": fetched="))
n: days.size
days[(n - 5)..(n - 1)].map(r => {ts: r["ts"], msg: r["msg"]})
```

### Errors / partial events / aborts

```axon
jobLog("<handle>").findAll(r =>
  r["msg"].toStr.contains("partial:") or
  r["msg"].toStr.contains("ABORT") or
  r["msg"].toStr.contains("Throttled") or
  r["msg"].toStr.contains("timed out") or
  r["msg"].toStr.contains("download:")
).map(r => {ts: r["ts"], msg: r["msg"]})
```

Empty result = healthy run, no failures.

### Connector boundaries (when each connector started)

```axon
jobLog("<handle>").findAll(r => r["msg"].toStr.contains("interval="))
                  .map(r => {ts: r["ts"], msg: r["msg"]})
```

### Month archives

```axon
jobLog("<handle>").findAll(r => r["msg"].toStr.contains("archived "))
                  .map(r => {ts: r["ts"], msg: r["msg"]})
```

## Step 4: Cross-Check Folio State

What's actually in folio (not just log noise):

### Connector overview

```axon
readAll(solrenviewConn).map(c => {
  dis: c->dis,
  siteId: c["solrenviewSiteId"],
  actDate: c["solrenviewActivationDate"],
  interval: c["solrenviewInterval"],
  tz: c["solrenviewTz"],
  pts: readAll(solrenviewConnRef == c->id and his).size
})
```

### Points + their hisEnd (resume position)

```axon
readAll(solrenviewConnRef and his).map(pt => {
  conn: pt["solrenviewConnRef"]->dis,
  dis: dis(pt),
  hisEnd: pt["hisEnd"],
  hisSize: pt["hisSize"],
  hisStatus: pt["hisStatus"]
})
```

Compare `hisEnd` to the active job's `progressMsg` to gauge how far behind the laggards are.

### Limiter and cache stats

```axon
solrenviewLimiterStats()                         // inFlight, totalAcquired, hasWaiters
solrenviewCacheStats(read(solrenviewConn), null) // bytes, files, archived, oldest, newest
```

`solrenviewLimiterStats().totalAcquired` is a JVM-wide counter; a steadily incrementing value means the connector is making API calls.

## Step 5: Quick Health-Check Template

Use this as the **default first response** to "is the sync running?":

```axon
// 1) running jobs
running: jobStatusAll()
           .findAll(r => r["jobStatus"] == "running")
           .map(r => {
             handle: r["handle"],
             dis: r["dis"],
             runtime: r["runtime"],
             progress: r["progress"],
             progressMsg: r["progressMsg"]
           })

// 2) errors in the active sync (replace <handle>)
errors: jobLog("<handle>").findAll(r =>
          r["msg"].toStr.contains("partial:") or
          r["msg"].toStr.contains("ABORT") or
          r["msg"].toStr.contains("download:") or
          r["msg"].toStr.contains("Throttled"))

// 3) latest day completed
days: jobLog("<handle>").findAll(r => r["msg"].toStr.contains(": fetched="))
last: days[days.size - 1]

// 4) limiter snapshot
solrenviewLimiterStats()
```

Report results in this order:
1. Is a job running? Runtime + progress message.
2. Any errors? (errors.size = 0 → "healthy, 0 errors").
3. Latest completed day-step.
4. Limiter snapshot (in-flight / waiters).

## Common Pitfalls

- **Wrong project context**: 403 or UnknownRecErr means re-call `setPrimaryProject`.
- **Job handle vs job record id**: `jobLog` takes the **handle string** from `jobStatusAll`, not the `@id` of the job record.
- **Huge log results**: always wrap `jobLog` in a `findAll` filter. Never `.map` the raw grid.
- **In-flight job uses parsed source**: editing the func in folio while the job is running has **no effect** on the running run; it only affects subsequent launches. Same for pod redeploys — they need a SkySpark restart, which kills the in-flight job.
- **`pt.hisEnd` is the resume marker**: drivers walk days from `min(pt.hisEnd)` per connector. If a single point's `hisEnd` is null, the whole connector replays from `activationDate`.
- **`runtime: 0ms` in `jobLastRuntime`** can mean the job submitted in background and the field measures only the foreground submission. Use `jobStatusAll()` for live runtime.

## Reference: Job Function Names

| Function | Purpose |
|----------|---------|
| `jobRun(expr)` | Submit a job in the background; arg can be a job-record `Ref` |
| `jobStatusAll()` | List active/recent run statuses with handle, status, progress |
| `jobStatus(handle)` | Single run's status as a Dict |
| `jobLog(handle)` | Full log Grid for a single run |
| `jobProgress(percent, msg)` | (called *inside* a job) report progress |
| `jobIsRunning()` | Boolean: am I executing inside a job? |
| `jobCurRec(checked: true)` | The job-record Dict if we're inside one |
| `jobCancel(handle)` | Request graceful cancellation |
| `jobSleep(dur)` | Pause the current job |

## Driver-Specific Log Shape (solrenviewSyncAll)

The current Solrenview driver emits one log line per day per connector:

```
2025-05-12: fetched=N cached=M ptsOk=K ptsSkipped=S marked=R archived=A
```

| Token | Meaning |
|-------|---------|
| `fetched=N` | windows downloaded from network this day |
| `cached=M` | windows already on disk (or in per-month ZIP archive) |
| `ptsOk=K` | his points whose `solrenviewSyncHis` succeeded |
| `ptsSkipped=S` | his points skipped because `pt.hisEnd >= syncSpan.end` |
| `marked=R` | rows newly stamped `syncedToFolio` |
| `archived=A` | only present when day is the 1st of a month and prev month was zipped |

Special log lines:

- `~ 2025-05-15 partial: <error> — flushing through 2025-05-15T13:00:00Z` — partial-day resume kicked in.
- `! 2025-05-15 ABORT: <error>` — a day fully failed before any cache write.
- `archived 2025yr/12mo: 744 entries` — month archive written.
- `=== DONE: {totals dict} ===` — final summary at the end of a run.
