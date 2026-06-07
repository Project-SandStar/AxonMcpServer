---
title: Axon Language Information (Gotchas Reference)
description: A reference of Axon syntax quirks and missing operators that repeatedly bite Fantom/SkySpark devs writing Axon for the first time
category: language-reference
tags: [axon, syntax, language, gotchas, reference, debugging, parser, while, lambda, elvis, units]
version: 1.0
---

# Axon Language Information

## Overview

Axon **is not Fantom** and **is not JavaScript**. Devs coming from either repeatedly trip on the same handful of missing operators, keyword absences, and unit-arithmetic surprises. Each one produces a vague `axon::SyntaxErr` whose line number points at the *next* token after the real problem, so the actual cause takes 2–3 bisect rounds to find.

This workflow is the cheat sheet — read it once, and skim the **Gotchas Table** before pushing any non-trivial Axon function.

## When to Use This Workflow

Trigger words from the user that should make you skim this reference first:

- "Expecting newline or semicolon, not …"
- "Unknown symbol '…'"
- "while loop doesn't work in axon"
- "how do I do a ternary in axon"
- "lambda parse error"
- "Not duration unit: …_day_day" / "Unit unification failed"
- "the elvis operator isn't working"
- *Any* `axon::SyntaxErr` on code that looks syntactically fine to a Fantom/Java/JS reader

Consult it before writing any new `func` source longer than ~10 lines.

## Prerequisites

1. **Active project context** for the `executeAxonCode` parse-test recipe (Step 6):
   ```
   mcp__axon-mcp__setPrimaryProject(instanceName="<inst>", projectName="<proj>")
   ```
2. **A populated project** — most of the gotchas below need a real Folio to expose. An empty proj will mask schema-driven errors.

## Step 1: The Gotchas Table

| # | Mistake | Symptom (the actual error you'll see) | Correct form |
|---|---------|---------------------------------------|--------------|
| 1 | `?:` elvis operator | `Expecting newline or semicolon, not ?` | `if (x == null) defaultVal else x` — assign result to a var first if used as a function argument |
| 2 | C-style ternary `cond ? a : b` | `Expected ), not ?` | `if (cond) a else b` (Axon's if/else **is** an expression) |
| 3 | `while (cond) do … end` | `Expecting newline or semicolon, not identifier '…'` on the line *after* `while` | No `while` keyword. Use `eachWhile`, `.each` with early-return, recursion, or a finite-range `.each` walker |
| 4 | `for (i := 0; i < n; i++) …` C-style for | `Expecting newline or semicolon, not for` | No `for` keyword. Use `[0..n-1].each i => …` or `0..n-1.each(i => …)` |
| 5 | Multi-arg lambda inside `.each` without enclosing parens — `dict.each (v, k) => do …` | `Expecting newline or semicolon, not =>` | `dict.each((v, k) => do … end)` — the lambda must be wrapped because `(v, k)` looks like two positional args to `.each` |
| 6 | `(day(date) - 1) * 1day` — multiplying a unit'd Number by a Duration literal | `haystack::UnitErr: Not duration unit: 14_day_day` | `day(date)` returns a Number tagged with the `day` unit; multiplying by `1day` squares the unit. Use built-ins: `date.firstOfMonth`, `date.lastOfMonth`. For other day-offset arithmetic, work with plain Ints: `date - n * 1day` where `n` is *unitless* |
| 7 | `dict.keys.each k => …` | `Unknown symbol 'keys'` | Dicts have no `.keys`. Use `dict.each((v, k) => …)` directly |
| 8 | `if` expression embedded inside a function call — `jobProgress(if (cond) x else y, msg)` | `Expecting newline or semicolon, not if` | Compute into a local first: `p: 0; if (cond) p = x else p = y; jobProgress(p, msg)`. Inline `if`/`else` **is** an expression but only on the RHS of a `:` assignment or as a standalone statement, **not** as a function-call argument in most parsers |
| 9 | `return` from inside an outer-function `.each` lambda expecting to abort the outer function | Surprising — returns only from the lambda, the outer loop continues with the *next* iteration | Use a flag variable + check at the top of each iteration: `aborted: false; xs.each x => do if (aborted) return null; …; if (badCond) aborted = true end` |
| 10 | Variable name shadows built-in (`day`, `month`, `year`, `name`, `value`) | `Local variable "day" is hiding function` or wrong values returned | Rename loop var. Common idiom: `dt` for the iterator, then `day(dt)` / `month(dt)` for extraction |
| 11 | `string1 ++ string2` JS-style concat | `Expected expression, not ++` | Use `+`: `"a" + "b"`. There is no `++` operator |
| 12 | `Number.toFloat` | `Unknown symbol 'toFloat'` | Divide by the unit to coerce: `(t2 - t1) / 1ms` for ms; `(d2 - d1) / 1day` for days; etc. |
| 13 | `.toStr` on a Number with unit silently keeps the unit — `(15day).toStr` is `"15day"`, not `"15"` | Logs and concatenated strings have weird `day`/`ms` suffixes | Strip with `n.as(1).toStr` (`as(1)` removes the unit) or interpolate with explicit format: `"$n.format(\"#\")"` |
| 14 | `=== ` strict equality | `Expected expression, not ==` | Axon uses `==` for both reference and value equality. No `===`. |
| 15 | `null?.foo` safe-nav from JS/Swift | `Expected expression, not ?.` | No safe-nav. Use `if (x != null) x.foo else null` |
| 16 | `try { … } catch (e) { … }` C-style braces | `Expecting newline or semicolon, not {` | Axon's try/catch uses `do`/`end` blocks: `try do … end catch (ex) do … end` |
| 17 | `do; do; do` nested without `end` for each | Cascading "Expected end" errors | Every `do` block must close with its own `end`. Also `try do … end catch (ex) do … end` requires `end` *both* after the try body and after the catch body |
| 18 | Forgetting that `return null` inside a top-level `.each` lambda is the lambda's return value, not the outer function's | Outer function continues; bug only manifests on certain inputs | See gotcha 9. The "early-out" pattern in Axon needs an explicit flag at the top of each iteration |
| 19 | `import X` or `using X` at top of a func | `Expected expression, not import` | Axon funcs have no imports. All symbols are either built-ins, lib-defined funcs, or in scope via the runtime's symbol resolver |
| 20 | `pt["dis"] ?? "default"` (Kotlin/Swift coalesce) | `Expected expression, not ??` | No `??` either. Same fix as `?:` — explicit `if (X == null) … else X` |
| 21 | `row.toDict` to "convert a Row to a Dict" | `axon::EvalErr: Unknown symbol 'toDict'` | A `Row` **already is a `sys::Dict`** (`row.typeof` returns `"sys::Dict"`). There is no `.toDict` method. Use the `row` directly. For column-stripping use the Dict method `row.remove("col")` — that **does** work on Rows and returns a new Dict minus that key |
| 22 | Reading nested JSON via `->` chains — `kit["devices"][0]->device->unique_device_id` | `axon::EvalErr: Invalid arg 'sys::Map' to 'core::trap'` | The connector helper `attuneAwsApiGet` returns a top-level `sys::Dict`, but nested JSON objects come through as Fantom `sys::Map`s (no `->` operator on Map). Use bracket access only for nested traversal: `kit["devices"][0]["device"]["unique_device_id"]`. The arrow `->` only works on the outer Dict |
| 23 | Editing a func in `lib/funcs/funcs.trio` and expecting the running project to pick it up | The OLD source's error keeps firing — stack trace points at line numbers from the pre-edit version | `.trio` files in `lib/funcs/` are SEED data. SkySpark reads them once at lib install/startup into the def graph; subsequent file edits do NOT auto-reload. To deploy a change without a SkySpark restart, use `mcp__axon-mcp__commitAxonFunction` to upsert a folio rec — folio funcs shadow lib-defined ones on resolve. Restart also works but is slower |

## Step 2: Block Syntax — `do … end` Cheat Sheet

| Construct | Axon syntax |
|-----------|-------------|
| Multi-statement function body | `() => do … end` |
| Single-expression function body | `() => expr` |
| Lambda with multi-statement body inside `.each` | `xs.each x => do … end` (single arg) |
| Lambda with multi-arg multi-statement body inside `.each` | `xs.each((v, k) => do … end)` |
| Multi-statement `if` branch | `if (cond) do … end` |
| `if/else` as an expression on RHS of `:` | `x: if (cond) val1 else val2` |
| Multi-statement try/catch | `try do … end catch (ex) do … end` |

## Step 3: Loop / Iteration Replacements for the Missing `while`

| You'd reach for `while` to … | In Axon, do this instead |
|------------------------------|-----------------------|
| Increment an index until a condition | `[0..max].eachWhile(i => if (cond(i)) null else "stop")` (returns when lambda returns a non-null value) |
| Drain a queue / advance a pointer | Recursion: `f: (state) => if (done(state)) state else f(step(state))` |
| Walk a date range | `eachDay(startDate..endDate) dt => do … end` |
| Walk a numeric range | `(0..n-1).each i => do … end` |
| Wait for an external condition (polling) | Don't — Axon funcs run synchronously inside a single eval frame. Use a `job` rec with a schedule instead |

## Step 4: Date / Duration Arithmetic — Mental Model

Numbers in Axon carry **units**, and unit-aware arithmetic is **strict**:

| Operation | Result | Notes |
|-----------|--------|-------|
| `date1 - date2` | `Number` with unit `day` | A duration in days, not a Date |
| `date - 1day` | `Date` | Days literal `1day` is a Number with `day` unit |
| `date - n * 1day` | `Date` (if `n` is unitless Int) | OK |
| `date - day(date) * 1day` | `Number` with `day_day` unit ❌ | Because `day(date)` is *itself* unitful (`15day`), the multiplication squares the unit |
| `(date1 - date2) / 1day` | Plain `Number` (unitless) | The standard idiom to extract a day-count as an Int-like value |
| `1day + 1hr` | `Duration`-style number with mixed units ❌ | Avoid mixed-unit arithmetic |

**Built-ins that save you from doing the math manually:**

- `date.firstOfMonth` → first day of `date`'s month
- `date.lastOfMonth` → last day of `date`'s month
- `date.firstOfWeek` / `date.lastOfWeek`
- `date.year`, `date.month`, `date.day` (also as functions: `year(date)`, etc.)
- `today()` → today's Date in the project's tz
- `now()` → DateTime in project tz
- `eachDay(span) dt => …` → iterate dates in a span without manual math

## Step 5: Null / Default Patterns

Axon has no `?:`, no `??`, no `?.`. The canonical idiom for each:

```axon
// Default a value:
v: if (x == null) "default" else x

// Default *into a variable used in a function call* — assign first:
sidRaw: pt["attuneAwsSensorId"]
sensorId: if (sidRaw == null) "?" else sidRaw
log(sensorId)    // ✅ works
log(if (sidRaw == null) "?" else sidRaw)  // ❌ parse error in most contexts

// Safe navigation:
x: if (rec != null) rec->dis else null

// Filter a list down to non-null entries:
xs.findAll(x => x != null)
```

## Step 6: Parse-Test a Function Before Committing

Use `executeAxonCode` with the function bound to a local variable so it's parsed but not executed:

```
mcp__axon-mcp__executeAxonCode(
  code:
    """
    f: () => do
      <function body>
    end
    "parsed"
    """,
  project: "instance/project"
)
```

Outcomes:

| Result | Meaning |
|--------|---------|
| `success: true, result: "parsed"` | Syntax + symbol resolution both clean. Safe to `commitAxonFunction`. |
| `success: false, error: "axon::SyntaxErr: …"` | Pure syntax. Find the line in the error, then bisect using the table above. |
| `success: false, error: "axon::EvalErr: Unknown symbol '<name>'"` | Symbol resolution failed at parse-but-execute boundary. The function references a symbol that doesn't exist. Either misspelled, a missing import, or a builtin from a newer SkySpark. |
| `success: false, error: "haystack::UnitErr: …"` | Unit arithmetic (Gotcha 6). The lambda *parsed* but evaluating a default-value path produced a unit conflict. |

**Bisect strategy** when the line number is misleading (most often Gotcha 3 — the `while` keyword): copy the function into the eval scratch and progressively delete sections until the error disappears. The last-deleted section contains the cause.

## Step 7: Error Message Decoder

| Axon error | Most likely cause |
|------------|-------------------|
| `Expecting newline or semicolon, not ?` | Gotcha 1 or 2 — `?:` or ternary `?` |
| `Expecting newline or semicolon, not =>` | Gotcha 5 — multi-arg lambda missing outer parens |
| `Expecting newline or semicolon, not do` | Gotcha 3 — `while` keyword absent (parser reached `do` after consuming what it thought was a complete statement) |
| `Expecting newline or semicolon, not if` | Gotcha 8 — `if` expression used as a function-call argument |
| `Expected ), not ?` | C-style ternary inside a function call |
| `Unknown symbol 'keys'` | Gotcha 7 — `dict.keys` doesn't exist |
| `Unknown symbol 'while'` | Gotcha 3 |
| `Unknown symbol '<funcName>'` | Function not defined, lib not loaded, or the func record was committed without the `attuneAws` (or relevant) marker that scopes it |
| `Local variable "<x>" is hiding function` | Gotcha 10 — variable shadowing a built-in like `day`, `name`, `value` |
| `haystack::UnitErr: Not duration unit: <n>_day_day` | Gotcha 6 — squared unit from `day()`-returns-Number-with-`day`-unit |
| `axon::EvalErr: Func failed: typeof(Obj val,Bool checked); args: (Fn)` | Tried to call `.typeof` on a function literal. Functions aren't first-class types in the DataType registry. Drop the `.typeof` check. |
| `axon::EvalErr: Unknown symbol 'toDict'` | Gotcha 21 — called `.toDict` on a Row. Rows are already Dicts; drop the call (or use `row.remove("col")` if you wanted to strip a column) |
| `axon::EvalErr: Invalid arg 'sys::Map' to 'core::trap'` | Gotcha 22 — used `->` to traverse a nested JSON `Map`. The outer envelope from a Fantom-returned response is a Dict, but nested objects are Maps. Use `[ ]` brackets all the way down |
| `sys::IOErr: Not in axon eval context` | Function depends on Axon `Context.cur` from Fantom but is being called from a non-Axon path (e.g. directly from a Conn's `receive`) |

## Quick Recipe (Copy-Paste Template)

```text
1. Set primary project:
   mcp__axon-mcp__setPrimaryProject(instanceName="…", projectName="…")

2. Skim the Gotchas Table above for any of these patterns in your source:
   - `?:` / `??` / `?.`        → see #1, #15, #20
   - `while (…)` / `for (…)`   → see #3, #4
   - `dict.each (v, k) =>`     → see #5  (needs outer parens)
   - `(day(d) - n) * 1day`     → see #6  (use firstOfMonth / lastOfMonth)
   - inline `if` as arg        → see #8  (assign to var first)
   - `dict.keys`               → see #7

3. Parse-test:
   mcp__axon-mcp__executeAxonCode(code: "f: <your-source> ; \"parsed\"")

4. If syntax error, read line number → consult Error Message Decoder (Step 7).

5. When `"parsed"` is returned, commit via the axon-func-update workflow.
```

## Why This Reference Exists

Axon is **not a general-purpose language** — it's a domain-specific dialect over the Haystack data model, optimised for record-walking, span iteration, and folio queries. Many "obvious" patterns from Fantom, Java, JavaScript, or Python don't translate. The error messages, while precise, only point at the parser's *recovery* position (the next token after the failure), so debugging cold can take 10x as long as debugging with a checklist.

Keep this file open in a side panel while writing Axon. It's faster than restart-test-bisect.

## Reference: Axon Symbols Worth Memorising

| Built-in | Purpose |
|----------|---------|
| `readAll(filter)` | Run a Haystack filter, return Grid |
| `read(filter)` | Same but expects exactly one row; throws otherwise |
| `readById(@ref)` | Read by Ref id |
| `commit(diff)` | Apply a Folio Diff |
| `diff(orig, changes, flags?)` | Build a Folio Diff; `null` for `orig` to create new with `{add}` |
| `eachDay(span) dt => …` | Iterate days in a Span/DateRange |
| `today()` / `now()` | Project-tz Date / DateTime |
| `jobProgress(pct, msg)` | Report progress (only meaningful inside `jobRun(...)`) |
| `jobLog(handle)` | Read a job run's log grid |
| `logInfo(name, msg)` | Write to a named log |
| `try do … end catch (ex) do … end` | Exception handling (no `{}`) |
| `if (cond) a else b` | Expression-style conditional |
| `xs.each x => …` | Iterate (single-arg lambda, no outer parens) |
| `dict.each((v, k) => …)` | Iterate Dict (multi-arg needs outer parens) |
| `(0..n).each i => …` | Range iteration |
| `firstOfMonth(d)` / `d.firstOfMonth` | Month start |
| `lastOfMonth(d)` / `d.lastOfMonth` | Month end |
| `day(d)` / `month(d)` / `year(d)` | Date components (return Number with `day` unit for `day(d)`) |
