---
title: Cur Rules — Computed curVal Points from Another Point's Write
description: How to build a SkySpark curRule (rule + defcomp) that drives a computed curVal point in real-time, with history, including the gotchas that bite when committing rules/comps via Folio instead of the UI
category: automation
tags: [curRule, rule, ruleExt, defcomp, comp, computed-point, curVal, bindOut, toCurVal, hisCollectCov, folio, mcp]
version: 1.0
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

A computed cur point needs `point` + `cur` + `computed`, a `kind`, the equip/site refs, plus whatever tag links it to its source and a marker for `ruleOn` to match. Add `his` + `hisCollectCov` if you want history.

```axon
diff(null, {
  point, cur, computed,           // computed point
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

## Verification Checklist

1. `ruleRosterRefresh()` runs without error (lib-rule present).
2. `read(rule and curRule and ruleOn=="<marker>")` returns your rule with the `ruleFunc` source intact.
3. Each computed point: `point` + `cur` + `computed` present; linked source ref set; `his` + `hisCollectCov` if history wanted.
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
