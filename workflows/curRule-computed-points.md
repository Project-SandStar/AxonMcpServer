---
title: Cur Rules — Computed curVal Points from Another Point's Write
description: How to build a SkySpark curRule (rule + defcomp) that drives a computed curVal point in real-time, with history, including the gotchas that bite when committing rules/comps via Folio instead of the UI
category: automation
tags: [curRule, rule, ruleExt, defcomp, comp, computed-point, curVal, curSource, bindOut, toCurVal, hisCollectCov, ruleRosterRefresh, ruleTest, ruleDebug, folio, mcp]
version: 1.2
---

# Cur Rules — Computed curVal Points

## Overview

A **cur rule** (`curRule`) is one of the three SkySpark Rule Engine (`ruleExt`) rule types (alongside `sparkRule` and `kpiRule`). Cur rules implement *soft real-time analytics and control logic*. They have exactly two output mechanisms:

1. **drive the `curVal` of a point** — a "computed current value" (via `bindOut` + `toCurVal`)
2. **drive the write level of a writable point** (via `bindOut` + `toWriteLevel:<1..16>`)

This workflow covers mechanism #1: creating a **computed point** whose `curVal` is calculated in real-time from *another* record — the worked example drives a "Chamber 42 Status" point's curVal from the `writeVal` of the live "Chamber 42" command point, and historizes it.

The default execution frequency is **10sec** (tunable per-rule via `ruleFreq`).

## When to Use This Workflow

Trigger phrases from the user:

- "create a curRule" / "computed curVal point" / "computed point"
- "make this point's curVal track that point's write / value"
- "I need a status point that mirrors the write"
- "drive a point's level from a rule"
- any time you need a **read-only point whose value is calculated** rather than read from a connector

### When NOT to use a cur rule

- **The point should track its *own* write** → just add the `curTracksWrite` marker to the writable point. No rule needed.
  But note the trap below: `curTracksWrite` is **ignored when the point's cur is bound to a connector** (`attuneAwsCur`, `bacnetCur`, etc.). In that case the connector wins and `curStatus` stays `unknown` — which is exactly why you fall back to a cur rule on a *separate* computed point.
- **One-off / event-driven write** → use a `task` (obsCurVals / obsSchedule) instead. Cur rules are for continuous real-time computation.

## Prerequisites

1. **Rule engine enabled.** Confirm `ruleExt` (lib-rule) is loaded:
   ```axon
   ruleRosterRefresh()   // throws Unknown symbol if lib-rule is absent
   ```
2. **Active project context** for MCP routing:
   ```
   mcp__axon-mcp__setPrimaryProject(instanceName="<inst>", projectName="<proj>")
   mcp__axon-mcp__getPrimaryProject   // verify before any commit
   ```
3. The **source record(s)** you want to read from, and the **target equip / site** the computed point will live under (`equipRef`, `siteRef`).

## How a Cur Rule Is Wired

A rule is a Folio record. A cur rule needs:

| Tag        | Value                                                                 |
|------------|-----------------------------------------------------------------------|
| `rule`     | marker                                                                |
| `curRule`  | marker — types it as a cur rule                                        |
| `dis`      | display name                                                          |
| `ruleOn`   | **Str** Haystack filter selecting the *targets* (the computed points) |
| `ruleFunc` | Axon source of a **`defcomp` component** (cur rules MUST use a comp)   |
| `ruleFreq` | optional Duration; default `10sec`                                    |
| `disabled` | optional marker to pause the rule                                     |

The `ruleFunc` **must be a component** (`defcomp`), not a plain function. A unique comp instance runs per rule+target combination and keeps state between executions (re-instantiated — state lost — if the rule or comp source is edited).

### The defcomp shape

Named cells the engine recognises:

| Cell / cell-meta      | Purpose                                                            |
|-----------------------|-------------------------------------------------------------------|
| `target: {}`          | input cell — the matched target record (the computed point)        |
| `{bind:"<filter>"}`   | bind a cell to **one** input record via a `{{macro}}` filter       |
| `{bindAll:"<filter>"}`| bind a cell to a **list** of input records                         |
| `{bindOut:"<filter>", toCurVal}` | output cell → drives the bound point's computed `curVal` |
| `{bindOut:"<filter>", toWriteLevel:<n>}` | output cell → drives a writable point at level n |
| `{... watch}`         | subscribe the bound input point to a watch (fresh connector data)  |
| `{readonly}`          | cell may not be written by another component                       |

`bind` / `bindOut` filters use `{{var}}` macro syntax. Supported vars:
- `{{target->id}}` — the target's id ref
- `{{target->foo}}` — value of tag `foo` on the target

### Worked example (what we actually shipped)

`ruleOn`: `"chamberWriteStatus"` (a marker we put on each status point)

`ruleFunc`:
```
defcomp
  target: {}
  out: {bindOut:"id=={{target->id}}", toCurVal}
  do
    out = readById(target->statusSourceRef)["writeVal"] == true
  end
end
```

The target (a "Chamber 42 Status" point) carries `statusSourceRef: @<source point id>`. The comp reads the source's `writeVal` fresh and outputs a clean Bool to the target's `curVal`.

## Step 1: Create the Computed Point(s)

A computed cur point needs `point` + `computed`, a `kind`, the equip/site refs, plus whatever tag links it to its source and a marker for `ruleOn` to match. Add `his` + `hisCollectCov` if you want history.

> **Do NOT add the `cur` marker.** A cur rule does not need it, and its presence silently breaks the rule: the comp runs, `ruleDebug("comp", …)` reports `out[ok]` with the right value and the right `bindOut` binding, `numErrs` stays `0`, no error appears in `logRead()` — and `curVal` stays `null` forever. See Gotcha #10.

```axon
diff(null, {
  point, computed,                // computed point — NO `cur` marker
  his, hisCollectCov,             // historize curVal on change
  kind:"Bool", enum:"off,on", tz:"Chicago",
  navName:"Chamber 42 Status",
  disMacro:"\$equipRef \$navName", // NOTE the escaped $ — see Gotchas
  equipRef:@<equip-id>,
  siteRef:@<site-id>,
  statusSourceRef:@<source-point-id>,  // link consumed by the comp body
  chamberWriteStatus               // marker matched by ruleOn
}, {add}).commit
```

- Do **not** add `cur` — see the warning above. `toCurVal` will not commit to a point tagged `cur`.
- Do **not** add `writable` — the value is computed, not written.
- Do **not** bind it to a connector (`xxxCur`) — the rule supplies curVal.

## Step 2: Create the Cur Rule

Build the `ruleFunc` defcomp source as a **newline-joined string** (see the triple-quote gotcha), then commit the rule and refresh the roster:

```axon
nl: "\n"
src: "defcomp" + nl +
     "  target: {}" + nl +
     "  out: {bindOut:\"id=={{target->id}}\", toCurVal}" + nl +
     "  do" + nl +
     "    out = readById(target->statusSourceRef)[\"writeVal\"] == true" + nl +
     "  end" + nl +
     "end"
diff(null, {rule, curRule, dis:"Chamber Write Status",
            ruleOn:"chamberWriteStatus", ruleFunc:src}, {add}).commit
ruleRosterRefresh()   // force the engine to pick up the new rule + targets
```

One rule covers **all** targets matching `ruleOn`. To add more computed points later, just create the point with the marker — no rule change, only a `ruleRosterRefresh()`.

## Step 3: Verify — A Change, Not a Snapshot

A populated curVal proves nothing about *tracking*. Force the input to change and confirm the output follows within ~one `ruleFreq`.

To test deterministically **without racing other writers** (e.g. an armed override task writing at level 8), drive the source from **emergency level 1**:

```axon
pointWrite(@<source-id>, true, 1, "curRule-test")   // level 1 beats lower levels
ruleRosterRefresh()
// wait ~10-15s (the rule cycle), then:
src: readById(@<source-id>)
st:  read(chamberWriteStatus and statusSourceRef==@<source-id>)
{srcWriteVal:(src["writeVal"]).toStr,
 statusCurVal:(st["curVal"]).toStr, curStatus:(st["curStatus"]).toStr}
// expect: statusCurVal follows srcWriteVal, curStatus == "ok"

pointWrite(@<source-id>, false, 1, "curRule-test")  // flip and re-check
// ...then release the test write:
pointWrite(@<source-id>, null, 1, "curRule-test")
```

Then confirm history captured the transitions:
```axon
st: read(chamberWriteStatus and statusSourceRef==@<source-id>)
hisRead(st->id, today()).toRecList.map(r => r["ts"].toStr + " = " + (r["v0"]).toStr)
// expect rows at each transition, e.g. "...08:38:28 = true", "...08:39:10 = false"
```

Healthy end-state: `curStatus == "ok"`, curVal mirrors the input, and `hisSize` grows on each change.

## Gotchas (all hit while building this via Folio/MCP)

| # | Symptom | Cause / Fix |
|---|---------|-------------|
| 1 | `String interpolation not supported yet` on a value containing `$` (e.g. `disMacro:"$equipRef $navName"`) | `$` triggers interpolation in eval. Escape it: `"\$equipRef \$navName"`. |
| 2 | `Leading space in multi-line string must be 8` | Axon triple-quoted (`"""`) strings enforce an 8-space continuation indent. For multi-line `ruleFunc` source, **concatenate lines with `"\n"`** instead. |
| 3 | `Unexpected token defcomp` when you try to parse-test the comp in the eval scratch | `defcomp` is a top-level definition (like `func`) — it can't be assigned to a var or evaluated via ad-hoc `/evalAll`. You **cannot** parse-test it that way. Instead: validate the **body expression** alone (e.g. `readById(@x)["writeVal"] == true`), commit the rule, then read back the rule + target `curStatus`/`curVal` to confirm it instantiated. |
| 4 | Computed point `curVal` stays null / `curStatus` not `ok` | Roster not refreshed after creating the rule or target → run `ruleRosterRefresh()`. Or the comp threw — check the target's `curStatus` and the source ref resolves. |
| 5 | Status tracks the wrong thing / goes stale | Don't `bind`+`watch` the source to read its **writeVal** — `watch` subscribes to *curVal*. If the source's cur is connector-bound/broken (`curStatus=unknown`, `curTracksWrite` ignored), a watched cell tracks the broken cur. **Read `writeVal` fresh in the comp body** (`readById(target->ref)["writeVal"]`). Cost: one `readById` per cycle — negligible. |
| 6 | `curVal` is sometimes null, history noisy | Coerce to a clean type in the body: `... ["writeVal"] == true` yields a Bool that's never null, which `hisCollectCov` trends cleanly. |
| 7 | Test override fights another writer | If a task/loop is overriding the same point (e.g. at level 8), test from **level 1** (`pointWrite(pt, val, 1, who)`) so your test value deterministically wins; release with `pointWrite(pt, null, 1, who)`. |
| 8 | `diff(...).commit` "fails" but the record exists | A commit followed by reading a *macro-computed* tag (`r->dis` from `disMacro`) throws `UnknownNameErr: dis` because the computed `dis` isn't resolved on the returned rec. The commit DID land — re-`read` the rec and check real tags, don't read `dis` off the commit result. |
| 9 | `readAll(defcomp or comp)` → `Unexpected token defcomp` | `defcomp` is reserved. Query comps with `readAll(comp)` only. |
| 10 | Comp runs cleanly, `ruleTest` shows the right `run.out` value bound to the right point, `ruleStatus:"ok"`, `numErrs=0`, `rule.fault` empty, `callNum` climbing — but `curVal` and `curStatus` stay `null` forever | **A stale persisted `curSource` tag on the target point.** This is the single most common cause and it is invisible in every rule-level diagnostic. `toCurVal` silently discards the value. Clearing `cur` alone is **not** enough — `curSource` is the one that matters. Note the distinction: a `curSource` written by a *running* rule is **transient** and harmless (a persistent commit against it fails with `folio::CommitErr: Cannot update transient tag persistently: curSource`). The poison is a **persisted** `curSource` left behind by something other than the live engine. Clear a persistent one with an ordinary commit; clear a transient one with `{transient}`. Fix both, plus set `computed`:<br>`readAll(<ruleOn out filter>).toRecList.each(p => commit(diff(p, {computed:marker(), cur:removeMarker(), curSource:removeMarker()})))`<br>then `ruleRosterRefresh()`. The engine rewrites `curStatus:"ok"` and `curSource:"Rule: <dis>"` itself on the next cycle. Audit with `readAll(<filter> and (cur or curSource))` — must be empty **before** the rule first runs. |
| 11 | Two targets driven by the same rule report almost identical `curVal` even though their sources differ, and the value changes with the span the comp asks for | Not a rule-engine problem — look at the `hisFunc`, then at the source data. If the comp derives `out` from `hisRead` on a `hisFunc` point, the series is recomputed per call, and a **stateful** `hisFunc` (e.g. an exponential lag model) re-seeds from the first row of whatever window it is handed, so `hisRead(pt, 1day).last()` need not equal the tail of `hisRead(pt, 10day)`. Two things make that visible: (a) a time constant longer than the window — check that the damping and lag coefficients still sum to `1.0` and that `1/lagFactor` is shorter than the span; (b) corrupt source history. In one real case the observed spread across `1day`/`2day`/`5day`/`10day` was 6.6°F; restoring a mis-scaled `lagFactor` cut it to 0.45°F, and repairing a block of source samples stored in the wrong unit cut it to **0.06°F**. Diagnose by reading the same point at several spans in one call before blaming the rule. |
| 12 | You change a rule, a comp `src`, or a target point's tags, re-read `curVal`, and conclude the change did nothing | **The rule engine does not re-arm on a Folio commit.** It keeps running its previously compiled roster, so every test you run measures the *old* configuration. `ruleDebugRule()` will show `callNum` frozen and `lastCall` minutes old. Always `ruleRosterRefresh()` then `ruleReobserve()` after any edit, and confirm `callNum` is advancing before drawing any conclusion. Bindings are read from Folio **only** at roster-refresh time — this is stated in `lib-rule/doc.html`, and it invalidates any A/B test done without it. |
| 13 | You use `mod` to check whether a cur rule is running | `curVal`, `curStatus` and `hisStatus` are **transient** tags. Writing them does not bump `mod`, and `commit(diff(p,{hisStatus:"x"}))` fails with `folio::DiffErr: Cannot set tag persistently: "hisStatus"`. A working cur point can sit at a `mod` from a year ago. Use `ruleDebugRule()`'s `callNum`, or `hisEnd`/`hisSize` if `hisCollectCov` is set. To probe by hand, write transiently: `commit(diff(p, {curVal:false, curStatus:"ok"}, {transient}))`. |
| 14 | The source point's own `curVal` is null/`unknown` because its connector never polls it, so a `watch` in-bind gives you nothing | Derive the value from **history** instead of cur. `hisRead` the source and take the last sample — this works even when the connector is dead, because history was collected earlier. See "Pattern: last history value" below. Trade-off: a dead feed then republishes its last known value indefinitely with `curStatus:"ok"`. Add an explicit staleness guard if a stale value is unsafe. |
| 15 | A cur rule fires every second and burns CPU | `ruleFreq` defaults to `10sec`. A comp that only calls `read` is ~0.06 ms and `1s` is fine; one that calls `hisRead` is ~2–12 ms per target. Match `ruleFreq` to how fast the source actually changes — `1min` is usually plenty, and there is no point polling faster than the source's `hisCollectInterval`. |
| 16 | Axon syntax papercuts that cost debugging time | Negation is `not`, not `!` (`Unexpected token !`). A ternary inside a dict literal fails to parse (`Expecting colon and value after "x" dict literal`) — assign it to a variable first. `dis()` throws `sys::ArgErr ... ClassCastException` when handed a `Ref` — use `.toStr`, or `readById(r->ref)["navName"]`. `Str.split` takes **one char**, not a string. `Grid.map` needs `.toRecList` first when the lambda returns a non-Dict. |

## Pattern: last history value (when the source's own cur is dead)

A `watch` in-bind reads the source point's **`curVal`**. If that point's connector has stopped
polling it, `curVal` is `null` and `curStatus` is `unknown`, so the rule has nothing to work with —
even though the point may hold months of collected history.

Derive the output from the last history sample instead. Seek straight to the point's `hisEnd`
rather than scanning a multi-day window, so the cost stays flat as history grows:

```
defcomp
  target: {}
  out: {bindOut:"point and doorBool and equipRef=={{target->id}}", toCurVal}
  do
    pt: read(point and door and bassgMilesightCur and equipRef==target->id, false)
    if (pt == null) do
      out = null
    end
    else do
      te: pt["hisEnd"]
      if (te == null) do
        out = null
      end
      else do
        his: hisRead(pt, (te - 1min)..(te + 1min)).table
        if (his.isEmpty) do
          out = null
        end
        else do
          out = (his.last()["v0"] == "open")
        end
      end
    end
  end
end
```

Notes:

- `hisEnd` is already a tag on the point, so no scan is needed to find it. Bracket it by ±1min
  because a `hisRead` span's end is exclusive — a zero-width range returns nothing.
- Compare to a literal (`== "open"`) so `out` is always a clean Bool, never null. `hisCollectCov`
  then trends it cleanly.
- **Staleness is not detected.** A dead feed republishes its last known value forever with
  `curStatus:"ok"`. If that is unsafe, guard on `te`:
  ```
  if (now() - te > 2hr) do out = null end
  else do ... end
  ```
- Cost is ~2 ms per target at this shape, versus ~0.06 ms for a plain `read`. Set `ruleFreq`
  accordingly — `1min` is usually right; there is no benefit to polling faster than the source's
  `hisCollectInterval`.

## Pattern: projecting a computed (`hisFunc`) history into `curVal`

A `hisFunc` point computes its series on read and stores nothing, so it has **no `hisStart` /
`hisEnd` / `hisSize` tags** and the `hisEnd`-seek trick above does not apply. Read a span and take
the last row.

One rule can cover every such point, selected by a dedicated marker rather than by `point and
hisFunc` — that keeps points already driven by another cur rule out of it, and stops a
newly-added `hisFunc` point being swept in before anyone has checked it:

```
defcomp
  target: {}
  out: {bindOut:"id=={{target->id}}", toCurVal}
  do
    his: hisRead(target, today()).table.findAll(r => r["v0"] != null)
    if (his.isEmpty) do
      his = hisRead(target, (today() - 1day)..today()).table.findAll(r => r["v0"] != null)
    end
    if (his.isEmpty) do
      out = null
    end
    else do
      out = his.last()["v0"]
    end
  end
end
```

Here the target **is** the output point, hence `bindOut:"id=={{target->id}}"`.

### Choose the span by measurement, not by cost

Run every candidate point across four spans **before** picking one. Three classes turn up, and
only the first tolerates a short window:

| Class | 30min | 2hr | `today()` |
|---|---|---|---|
| Span-stable intraday | same | same | same |
| Daily rollup (min/avg/max per day) | **empty** | **empty** | value |
| **Stateful** (lag/rate models) | wrong | wrong | correct |

The stateful class is the trap. In one real case a rate-from-delta hisFunc returned an identical
value for *two different zones* over a 2-hour window — the collapse to one number being the only
visible symptom — while `today()` gave the two correct, distinct values. No error is raised.

`today()` is correct for all three classes, so make it the default and shorten only with
measurements in hand. Cost is 1–8 ms per target, which is nothing at a sane `ruleFreq`.

### Not every series has a meaningful last value

This pattern suits series whose last sample *is* the current value. It does **not** suit
per-interval accumulations. A "total energy" hisFunc emitting kWh consumed between consecutive
meter readings produced an irregular COV series swinging between 0 and 29 kWh, so its last row was
the energy of a 20-second gap — a number that looks live and means nothing. Check the tail of the
series before enrolling a point; if the last row is a fragment, the point needs a rollup, not a
last-value projection.

## Diagnosing a cur rule: the order that actually works

Run these in order. Each one eliminates a whole class of cause, and the first three are read-only.

| Step | Call | What it proves |
|------|------|----------------|
| 1 | `ruleDebugRules()` | rule exists, `ruleStatus`, `type`, `freq`, `targets`, `targetsInErr`, `callNum` |
| 2 | `ruleDebugRule(ruleId)` | per-target `callNum`, `lastCall`, `numErrs`, `errTrace` — **is it firing at all?** |
| 3 | `ruleTest(ruleRec, targetRec)` | dumps every cell: `cell.in` (what the bind resolved to), `run.out` (the computed value), `cell.out` (the bound output rec), `rule.fault`. If this is right and `curVal` is still null, the fault is the **commit**, not the comp — go to Gotcha #10. |
| 4 | `commit(diff(p, {curVal:false, curStatus:"ok"}, {transient}))` | proves the Folio transient write path and your read-back both work on that specific point |
| 5 | write a deliberately *wrong* value transiently, then `ruleRosterRefresh()` | if the rule overwrites it, the rule is committing; if the wrong value survives, `processOutput` is not running |

`ruleErrs()` lists rules currently in error. `ruleBlobs(recs)` is history-blob storage, **not**
binding state — it will not help here.

Do not read `callAvgDur` as a health signal on its own: a `read`-only comp runs at ~0.06 ms and a
`hisRead` comp at ~2–14 ms, and both are healthy.

## Verification Checklist

1. `ruleRosterRefresh()` runs without error (lib-rule present).
2. `read(rule and curRule and ruleOn=="<marker>")` returns your rule with the `ruleFunc` source intact.
3. Each computed point: `point` + `computed` present and **`cur` absent**; linked source ref set; `his` + `hisCollectCov` if history wanted. Check with `readAll(<ruleOn filter>).findAll(p => p.has("cur"))` — it must return nothing.
4. **Change test passes**: force the input, output `curVal` follows within ~`ruleFreq`, `curStatus == "ok"`, both directions.
5. `hisRead(target, today())` shows the transitions.

## See Also

- `axon-func-update` — committing/upserting func records without folio duplicates (the curRule's defcomp lives in `ruleFunc`, but helper funcs follow that workflow).
- `axon-lang-information` — broader Axon syntax gotchas (no `?:`, no `while`, string/unit traps).
- `task-subscriber-permissions` — the `task` alternative for event-driven (not continuous) point reactions, and the host-user/permission model.

## Reference: SkySpark docs

- `lib-rule/doc.html` → **Cur Rules** and **Comps** / **Comp Examples** sections
- `lib-skyarc/curRule.html` (the `curRule` ruleType def)
- `lib-phIoT/computed-point.html` (the `computed` point def)
- `lib-point/curTracksWrite.html` (why same-point write-tracking fails under a connector binding)
