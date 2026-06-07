---
title: Create SkySpark App
description: Step-by-step guide for creating a SkySpark application — app record, view records, variables (defVal / defExpr), bindings, subviews, and modal patterns
category: ui-development
tags: [app, view, ui, dashboard, visualization, defVal, defExpr, modal, binding, action, template, fandoc, auto-refresh, viewRefresher, commit-pattern, diff-semantics]
version: 2.3
---

# Create SkySpark App Workflow

## Overview

A SkySpark **app** is a single record (`app` tag) that groups one or more **view** records into a navigable workspace. Views are declared in Trio with a typed `src` block — the view tree, the data expression(s), and the input/binding **variables** that thread state between subviews.

This workflow walks the full creation path: app record → view records → variable wiring (`defVal`, `defExpr`, `binding`, `bindSelect`) → composition with subviews and (when needed) modals → commit.

## When to Use This Workflow

Run this workflow automatically when the user asks anything like:

- *"Build a dashboard for X"*
- *"Create a SkySpark app for…"* / *"Add a custom UI"*
- *"Visualize site/equip/point data in a workspace"*
- *"Make a tab in the SkySpark menu for…"*
- *"Create a view that shows…"* (single-view apps)
- *"Wire a chart and a table together"* (subview binding)
- *"Open a form modal from a view"* (modal pattern)

## Prerequisites

1. **Set the primary project** — every commit/exec call routes through it:
   ```
   mcp__axon__setPrimaryProject({ instance: "<instance>", project: "<project>" })
   ```
   Verify with `mcp__axon__getPrimaryProject()`. **Instance names are case-sensitive** — the URL path is often lowercase (`/api/ecosmart`) but the configured instance name may be capitalised (`Ecosmart`). Always confirm with `mcp__axon__listSkySparkProjects()` first if you get `Instance not found` (recent builds suggest the closest match).

2. **Look at a real app first** — concrete patterns trump documentation. Good reference:
   `/Users/<user>/Code/2026/skyspark/bassgPointHealth/lib/views/` (1 app + 4 wired views).

3. **Search docs as needed:**
   - `mcp__axon__searchAxonDocs({ query: "view framework" })`
   - `mcp__axon__searchAxonDocs({ query: "defVal defExpr var" })`
   - Canonical sources at `/Users/<user>/Code/axon_library_2025/docs/3.1.11/docFresco/{Apps,Views,ValDef,Actions}.html` and `…/docDomkit/Modals.html`.
   - **`searchAxonRegex` can return huge result sets.** Common patterns (`=>\s*do`) match thousands of lines. Always pass `limit` and tighten the pattern before broadening — the default cap is 100 matches; the response reports `truncated` and `totalMatches` so you can paginate via `offset`.

4. **Find prior art** in the same project:
   `mcp__axon__searchAxonExamples({ query: "view: " })` and `mcp__axon__findFunctionUsage({ functionName: "view_..." })`.

## Step 1 — Create the App Record

Apps are minimal — they're just a label + icon that appears in the SkySpark menu. The interesting work happens in views.

```axon
appDict: {
  app: "myReportsApp",        // unique id, camelCase, no spaces
  dis: "My Reports",          // human-readable label shown in nav
  icon: "chartBar"            // see icon catalog below
}

diff(null, appDict, {add}).commit()
```

Commit via:
```
mcp__axon__executeAxonCode({ code: "diff(null, {app:\"myReportsApp\", dis:\"My Reports\", icon:\"chartBar\"}, {add}).commit()" })
```

### App tag reference

| Tag | Required | Purpose |
| --- | --- | --- |
| `app` | yes | Unique app id (camelCase). |
| `dis` | yes | Display label in the menu. |
| `icon` | yes | Icon name (see below). |
| `nav` | no  | Custom navigation order/group. |
| `appUri` | no | Override URI for deep-linking. |

### Common icon names

`workbook` · `chartBar` · `chartLine` · `gauge` · `dashboard` · `table` · `report` · `alarm` · `equip` · `site` · `point` · `tag` · `cog` · `wrench` · `network` · `connector` · `folder`

(Run `mcp__axon__searchAxonDocs({ query: "icon catalog" })` for the full list.)

## Step 2 — Build View-Data Functions

Views call helper functions to pull data. Keep them **pure** (no `commit`, no side effects — this is enforced by the framework).

Naming convention from real apps:
- `view_<name>` — data providers returning a Grid for a view
- `bassg_<name>` / `<projectPrefix>_<name>` — app-specific helpers
- `job_<name>` — long-running tasks (separate workflow: `job-status-check`)

Example data function:

```axon
view_historianHealthBars: (dateSpan) => do
  readAll(his and historian)
    .findAll(rec => rec->hisEnd > (now() - 2day))
    .toGrid()
    .addMeta({presentation: "bar"})
    .addColMeta("hisEnd", {dis: "Last seen"})
end
```

Commit each function via:
```
mcp__axon__commitAxonFunction({
  name: "view_historianHealthBars",
  source: "(dateSpan) => do … end",
  meta: { dis: "Health bars for span" }
})
```

⚠️ **Always** use `commitAxonFunction` (not raw `diff`) — it handles the `{add}` flag correctly and never leaves stale duplicates. See the `axon-func-update` workflow for details.

### 2.1 Triple-quoted string indent rule (Axon parser quirk)

Multi-line triple-quoted strings inside Axon source require leading whitespace on continuation lines to be **exactly 8 spaces** — anything else fails with `Leading space in multi-line string must be 8`. This is an Axon language rule, not an MCP issue.

```axon
src: """(connId) => do
  ...                  // ❌ 2-space indent → ParseErr
end"""

src: """(connId) => do
        ...            // ✅ 8-space indent
end"""
```

Run `mcp__axon__validateAxonCode({ code })` before commit to catch this and similar parser quirks — recent `commitAxonFunction` builds also auto-validate before sending to folio.

### 2.2 Setting extra tags on a func record

`commitAxonFunction` accepts optional `appName`, `view`, `dis`, `icon`, `order`, and an `extraTags` map alongside `src`. Use these to wire a helper function to its parent app in one call:

```
mcp__axon__commitAxonFunction({
  name: "view_historianHealthBars",
  src: "(dateSpan) => do … end",
  appName: "myReportsApp",
  dis: "Historian health bars",
  icon: "chartBar",
  order: 10
})
```

> **Note (2026-05-19, pre-fix):** if `commitAxonFunction` is still failing with `Expected ), not end [eval:10]` on your axon-mcp build, fall back to `executeAxonCode`:
>
> ```
> mcp__axon__executeAxonCode({ code: "commit(diff(null, {func, name:\"xyz\", src:\"...\"}, {add}))" })
> ```
>
> The bug was a malformed `if ... end` wrapper inside the tool; the fix landed in this repo on 2026-05-20.

## Step 3 — Create the View Record

A view binds an inheritable view-type (`table`, `chart`, `tile`, `card`, `text`, `fandoc`, `form`) to a data expression and declares its **variables**.

### 3.0 Record-type schemas — funcs vs views (read this once, save 30 min)

Funcs and views are **separate records** with **incompatible `src:` schemas**. Mixing them causes silent failures and bad parser errors.

| Aspect | Func record | View record |
| --- | --- | --- |
| Identity tag | `func` (marker) + `name:` (String) | `view:` (String) — the view id |
| `src:` content | **Axon source** (`(x) => do … end`) | **Trio tree** (`view: {inherit:"table"}` + `data: {expr:"…"}`) |
| Created via | `commitAxonFunction` | `executeAxonCode` running `readTrio(...).each(d => diff(null, d, {add}).commit())` |
| `appName:` allowed? | Yes (links helper to app) | Yes (links view to app) |

**Hard invariants:**

- `view:` is a **String** (the view name), **NOT a Marker**. Setting `view: marker()` produces `sys::ParseErr: Marker cannot be cast to Str`.
- Never put `view: "…"` + trio-shaped `src:` on a func record. Folio tries to decode the axon `src` as trio and explodes: `sys::ParseErr: Invalid name: () => do [Line 1]`.
- The same `src:` tag means **completely different things** depending on the record's identity tag. Read the identity tag before reading `src`.

If you need a func that's also surfaced as a view, build two records: one func (axon `src`) + one view (trio `src` that calls the func).

### 3.1 Minimal single view

```
dis: My Site Health
appName: myReportsApp
view: mySiteHealth
src:
  view: {inherit:"table"}
  data: {expr:"readAll(site)"}
```

Commit with:
```
mcp__axon__executeAxonCode({
  code: "readTrio(\"<paste trio above>\").each(d => diff(null, d, {add}).commit())"
})
```

(Or import the `.trio` file directly via the Folio import UI.)

### 3.2 View tag reference

| Tag | Purpose |
| --- | --- |
| `view` | Unique view id, camelCase. |
| `dis`  | Label shown in tabs/headers. |
| `appName` | Links the view to its parent app's `app` value. |
| `src` | The Trio tree describing view-type + variables + subviews. |
| `order` | Numeric sort order within the app (lower = earlier tab). Optional. |
| `<category>` | Project-scoped marker tag for filtering (e.g. `resets`, `health`, `override`). Pure metadata — query with `mcp__axon__queryHaystack({ filter: "view and resets" })`. |

### 3.3 Action wiring (buttons that invoke functions or open templates)

Inside `src:`, declare an action node next to your data/vars. Buttons appear in the view's toolbar (or row context menu, with `select`).

```
create:  {dis:"Create Reset Rec"  input action:"bassgResets_createRec"}
delete:  {dis:"Delete Reset Recs" multi action:"bassgResets_DeleteRecs" select}
define:  {dis:"Define Reset"      multi action:"bassgResets_defineReset" select templateName:"defineResetTemplate"}
job:     {dis:"Initialize Job"    action:"bassgResets_InitializeJob"}
```

| Attribute | Effect |
| --- | --- |
| `action:"funcName"` | Axon function to invoke when clicked. The function receives the view context (and selected rows if `select`). |
| `dis:"…"` | Button label. |
| `input` | Standalone toolbar button (no row required). |
| `select` | Button is enabled only when ≥1 row is selected; the selected row is passed to the action. |
| `multi` | Allow multi-row selection; the action receives an array. Combine with `select`. |
| `templateName:"<id>"` | Open the named template record as a form dialog seeded with the selected row(s). The action runs after the user confirms. |

Templates referenced by `templateName` live alongside views (e.g. `lib/templates/templates.trio`) and look like:

```
def: defineResetTemplate
template
fields:
  id:    {type:"Ref"  ro hidden}
  resetType: {type:"Str" enum:"setpoint,heating,cooling,emergency"}
  effectiveDate: {type:"Date" defExpr:"today()"}
```

This is the production-grade modal pattern — declarative, no Fantom Dialog code required.

> **Ref-field pickers must be scoped.** A bare `Ref` field is *not* a reliable "pick any rec" control — in practice it surfaces only refs already used by that tag, not the folio-wide set (e.g. a "Target Point" picker that should list all writable points instead lists only points already referenced). Scope it: single-word `kind:"Ref<writable>"` / `Ref<point>` for a flat folio list, or `kind:"Ref<point>" navAuxFilter:"point and writable"` for a site/equip/point tree. **Never** use a multi-word `Ref<sensor and point>` (parse error — the words become a `nav:` Ref id). Full rules, the `navAuxFilter` mechanism, and the flat-vs-tree trade-off (tree pickers drop orphan recs) are in `recform-template-design.md` Step 9.

### 3.4 Auto-refresh with `afViewRefresherExt`

We standardise on the **afViewRefresherExt** pod (https://stackhub.org/package/afViewRefresherExt) for live-updating views. It only works on custom views — built-in views can't host the action buttons.

**Add the pod to your project deps** (in `build.fan`):

```fantom
this.depends.add("afViewRefresherExt ${someVersion}")
```

**Wire the buttons into your view's `src:`** (any subset; `Settings` alone is enough for users who only want manual control over interval):

```
afRefreshInterval: {var kind:"Number" defVal:5s}                     // optional; defaults to 5s if omitted
btnStart:    {action:"afViewRefresherExt::AutoRefresh.start"        dis:"Start"}
btnStop:     {action:"afViewRefresherExt::AutoRefresh.stop"         dis:"Stop"}
btnRefresh:  {action:"afViewRefresherExt::AutoRefresh.refresh"      dis:"Refresh"}
btnSettings: {action:"afViewRefresherExt::AutoRefresh.openSettings" dis:"Settings"}
```

| Var / action | Effect |
| --- | --- |
| `afRefreshInterval` | Default refresh interval as a `Number` with time unit (`3s`, `1min`, `30s`). Falls back to **5s** when absent. |
| `AutoRefresh.start` | Begin polling: re-evaluates `data:` exprs and re-renders all subviews on the interval. |
| `AutoRefresh.stop` | Pause polling. View state preserved. |
| `AutoRefresh.refresh` | One-shot manual refresh. |
| `AutoRefresh.openSettings` | Opens a dialog letting the user pick the interval (1s / 10s / 30s / 1min / etc.). |

**When to use it:**
- Live-status dashboards (job progress, current overrides, point values).
- Health monitors that should reflect changes without a page reload.
- Any tile-layout app where users want hands-off updates.

**When *not* to use it:**
- Heavy data exprs — refreshing every 5s on a `readAll(point)` over millions of records will tank the server. Use `1min` or longer, or skip it.
- Forms / modals — refreshing while the user is mid-edit is hostile UX.

**Gotchas:**
- Cannot be added to **default** SkySpark views — only Custom Views you author.
- The polling re-evaluates the entire `src` data tree on each tick — including expensive helper functions. Profile before shipping.
- `afRefreshInterval` is a `Number` with time unit, not a `Duration` literal: `defVal:5s` ✅, `defVal:"5s"` ❌.

**Reference app status:** none of `bassgPointHealth` / `bassgresets` / `bassgMassPointOverride` currently wire it in. New apps should default to including at least `btnRefresh` + `btnSettings`.

## Step 4 — Variables: `defVal`, `defExpr`, `input`, `binding`, `bindSelect`

This is where most apps go wrong. Get this right and the rest is mechanical.

### 4.1 Anatomy of a `var` node

```
mySpan: {var kind:"Span" input defExpr:"thisMonth().toSpan()"}
                  └── type    │            └── default expression (Axon)
                              └── exposed as a user input control
```

| Property | Meaning |
| --- | --- |
| `kind` | Type hint: `"Str"`, `"Number"`, `"Bool"`, `"Date"`, `"Span"`, `"Ref"`, `"List"`, `"Dict"`. |
| `input` | If present → render an input control bound to this var. |
| `defVal` | Literal default (use for plain values: strings, numbers). |
| `defExpr` | Axon expression evaluated to seed the var (use for `today()`, `thisMonth()`, lookups). |
| `binding` | Subscribe to another var by relative path (`../parent`, `../sibling/inner`). One-way. |
| `bindSelect` | Bind to the **selected row's column value** in a sibling table view (e.g. `bindSelect:"id"`). |
| `enum` / `enumExpr` | Constrain to a list — renders as dropdown. Scales to many values: `enum:"setDef,override,auto,emergencyOverride,emergencyAuto"`. |
| `ro` | Read-only: shown but not editable (common on `id:` fields in templates). |
| `hidden` | Stored on the record but not shown in the form (use for internal state like `writeArray:{type:"Grid" hidden}`). |
| `placeholder` / `multiLine` / `optional` / `validation` | Form-control hints. |

**`defVal` vs `defExpr`** — pick one:
- `defVal:"today"` ❌ — the literal string `"today"`.
- `defExpr:"today()"` ✅ — the date for today, re-evaluated when the view first opens.

`defVal` accepts **typed Trio literals**, including function-call literals that are evaluated **once at parse time** (not per render):

```
csv:           {var kind:"Str"  bindSelect:"csv" defVal:""}        // empty string
siteRef:       {var kind:"Ref"  defVal:@null}                       // null ref
mySpan:        {var kind:"Span" defVal:Span("today")}               // literal Span value
status:        {var kind:"Str"  enum:"on,off" defVal:"off"}         // enum default
```

Use `defVal` when the default never needs to change between view opens; use `defExpr` when you need fresh evaluation each time the view mounts (e.g. `today()`, `now()`, `readById(@x)`).

### 4.2 Variable-passing rules (gotchas)

- Var ids cannot start with `view` or `export`, and **cannot contain underscores**.
- Bindings are **one-way** — modifying a child does not push back to the source.
- A var change re-runs every `expr` that templates it via `{{varName}}`.
- View `data` expressions **must be side-effect free** — no `commit`, no I/O. The framework enforces this for security.

### 4.3 Templating vars into data expressions

Inside `expr:"…"`, reference a var with `{{varName}}` — it's substituted as an Axon literal at evaluation time:

```
data: {expr:"view_historianHealthBars({{dateSpan}})"}
```

## Step 5 — Compose with Subviews (the real-world pattern)

Modal-free composition is the dominant pattern in production apps. Subviews live nested inside `src` and bind upward to the parent's vars.

### 5.1 Parent-child binding

```
dis: Historian Health Status
appName: myReportsApp
view: historianHealthStatus
src:
  view: {inherit:"tile"}
  dateSpan: {var kind:"Span" input defExpr:"thisMonth().toSpan()"}
  layout:   {var kind:"Str"  defVal:"grid 9x13; 0 0 9 5; 0 5 2 4"}

  subView1: Trio:
    view: {inherit:"chart"}
    dateSpan: {var input binding:"../dateSpan"}
    data: {expr:"view_historianHealthBars({{dateSpan}}).addMeta({presentation:\"bar\"})"}

  subView2: Trio:
    view: {inherit:"table"}
    dateSpan: {var binding:"../dateSpan"}
    selection: {var kind:"Str" bindSelect:"flawPeriod"}
    data: {expr:"view_historyReportTable({{dateSpan}})"}

  subView3: Trio:
    view: {inherit:"table"}
    selection: {var input binding:"../subView2/selection"}
    data: {expr:"bassg_AmountOfDays({{selection}}).keepCols([\"date\",\"hours\"])"}
```

What's happening:
- The parent owns `dateSpan` — every subview reads it via `binding:"../dateSpan"`.
- `subView2` exposes a `selection` var that tracks the user's selected row (`bindSelect:"flawPeriod"`).
- `subView3` binds **sibling-to-sibling** via `binding:"../subView2/selection"`. Click a row in subView2 → subView3 updates.

### 5.2 Tile layout grid

When the parent inherits `tile`, the `layout` var is a CSS-grid-like string:

```
"grid 9x13; 0 0 9 5; 0 5 2 4; 2 5 7 8"
 │   │ │   │
 │   │ │   └── subView1: x=0 y=0 w=9 h=5  (full width hero)
 │   │ │       subView2: x=0 y=5 w=2 h=4  (sidebar)
 │   │ │       subView3: x=2 y=5 w=7 h=8  (main area)
 │   └─┴── overall grid is 9 columns × 13 rows
 └── tile layout directive
```

Subviews are placed in declaration order onto the listed cells.

### 5.3 Info / footer panels with `fandoc`

A common production pattern: put a `fandoc` subview in the last grid cell to render help text, branding, or links. The `data` expression is just a string of fandoc markup (Markdeep-flavored markdown).

```
subViewInfo: Trio:
  view: {inherit:"fandoc"}
  data: {expr:"\"![BASSG](/proj/{{projName}}/file/logo.png)\\n\\nNeed help? <https://bassg.dev/docs>\""}
```

You can embed images, links, headings, lists, tables — anything fandoc supports. Templating (`{{projName}}`) works the same as in data exprs. Useful for: footer credits, doc links, status legends, last-updated timestamps.

## Step 6 — Modals & Dialogs (when subviews aren't enough)

You have **two paths**, in order of preference:

1. **Declarative templates (recommended)** — point an action at a template via `templateName:"<id>"` (see Step 3.3). The framework renders the template as a form dialog with the selected row pre-filled. No JS/Fantom code. Production apps (`bassgresets`, `bassgMassPointOverride`) use this exclusively.
2. **Custom Fantom `Dialog`** — only when you need bespoke layout, async work, multi-step flows, or rendering outside the form paradigm.

### 6.0 Path A — declarative template dialog

```
// in your view's src:
edit: {dis:"Edit Override" select action:"bassg_overridePoint" templateName:"pointOverrideTempNumber"}

// in lib/templates/templates.trio:
def: pointOverrideTempNumber
template
fields:
  id:        {type:"Ref"    ro hidden}
  state:     {type:"Str"    enum:"setDef,override,auto,emergencyOverride,emergencyAuto" defVal:"override"}
  value:     {type:"Number" defVal:0}
  expires:   {type:"Date"   defExpr:"today() + 1day" optional}
  writeArray:{type:"Grid"   hidden}
```

When the user clicks **Edit Override** with rows selected:
1. Framework opens a modal pre-filling fields from the selected row(s).
2. User edits and confirms.
3. The action function (`bassg_overridePoint`) runs with the populated dict(s).

This handles 95%+ of edit/create use cases without writing a line of Fantom.

### 6.1 Path B — custom Fantom `Dialog`

Modal/dialog UIs are powered by **domkit::Dialog** (not pure Axon — JS/Fantom layer). Open them from view actions, not data expressions.

### 6.2 Open a modal

```fantom
dialog := Dialog { it.title = "Edit point limits" }
dialog.add(SashBox { ... })
dialog.onClose { reloadParent() }   // dialogs cannot return values
dialog.open
```

### 6.3 Pass values into a modal

Use **closures** (or shared session state) — `Dialog` has no return channel:

```fantom
selected := view.selection
dialog := Dialog { it.title = "Edit $selected->dis" }
form := PointLimitsForm(selected)
dialog.add(form)
dialog.onClose {
  if (form.saved) view.refresh()
}
dialog.open
```

### 6.4 Receive values from a modal

Pattern: the form writes results into a closure-captured ref or commits the change itself, then the parent's `onClose` callback re-reads state.

### 6.5 When **not** to use a Fantom `Dialog`

Real apps in production (`bassgPointHealth`, `bassgresets`, `bassgMassPointOverride`) use **zero Fantom Dialogs**. They route interaction through:

- `bindSelect` + sibling subviews for in-place navigation/filtering
- `templateName:"…"` actions for create/edit forms

Only reach for `Dialog` when you need bespoke layout, async progress, multi-step wizards, or rendering outside the form paradigm.

Docs: `/Users/<user>/Code/axon_library_2025/docs/3.1.11/docDomkit/Modals.html` and `…/domkit/Dialog.html`.

## Step 7 — Commit and Verify

1. **Re-read the records you just created:**
   ```
   mcp__axon__queryHaystack({ filter: "app == \"myReportsApp\"" })
   mcp__axon__queryHaystack({ filter: "appName == \"myReportsApp\" and view" })
   ```
2. **Open SkySpark UI** → the app should appear in the menu under its `dis`.
3. **Click each subview** — confirm the `dateSpan` change in the parent re-renders all children.
4. **Validate the data functions:**
   ```
   mcp__axon__executeAxonCode({ code: "view_historianHealthBars(thisMonth().toSpan())" })
   ```
5. **If a record is wrong**, edit and re-commit (folio overwrites by id):
   ```
   mcp__axon__executeAxonCode({ code: "diff(read(view==\"mySiteHealth\"), {dis:\"New Title\"}).commit()" })
   ```

### 7.1 `diff` tag removal is non-atomic — split into two commits

Combining a remove (`-tag`) and a set (`tag:"newVal"`) in the same `diff` dict **silently keeps the removal and drops the new value**:

```axon
// ❌ -view wins; the new value is discarded, the tag ends up unset
commit(diff(rec, {view:"foo", -view}))

// ✅ two separate commits — remove first, then set
do
  commit(diff(rec, {-view}))
  commit(diff(read(... fresh lookup ...), {view:"foo"}))
end
```

Re-read the record between the two commits — the post-remove record has a new `mod` timestamp and `diff` will reject a stale handle.

### 7.2 Preview-first when materialising many records

For batch operations (e.g. creating 12 points), **separate the preview from the commit**:

1. First call: assemble the dicts in memory and return them to the user / surface in a dry-run grid. No `commit`.
2. Show the user. Wait for confirmation.
3. Second call: run the actual `diff(...).commit()` loop.

This pattern keeps agentic flows from tripping permission classifiers on the "create" leg, and gives the user a real diff before anything hits folio. Once `executeAxonCode` exposes a `dryRun` flag, prefer that.

## Common Trio Gotchas (reference table)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Expected '}' in Trio` | Unescaped `"` inside `expr:"…"` | Escape: `\"` |
| `Var name invalid` | Var id starts with `view`/`export` or has `_` | Rename (`mySpan`, not `view_span` or `my_span`) |
| Subview shows blank, no error | `binding:"../foo"` references a var that doesn't exist on the parent | Add the var on the parent or fix the path |
| `defVal` ignored | You used `defVal:"today()"` instead of `defExpr:"today()"` | Use `defExpr` for any expression |
| Selection doesn't propagate | Sibling uses `binding:"../sib/sel"` but `sib`'s `sel` lacks `bindSelect` | Add `bindSelect:"<colName>"` on the source var |
| Data expression "unsafe operation" | Called `commit`/`diff` inside a view `expr` | Move side effects to a Fantom action or job |
| App invisible in menu | Missing `dis` or `icon` on the app record | Add both |
| View invisible in app | `appName` doesn't match the app's `app` value | They must be string-equal |
| Layout cells overlap or wrap | `grid NxM; …` cell sums exceed `N`/`M` | Recompute cells; columns × rows must contain every subview |
| Action button greyed out forever | Has `select` but no rows are selectable (parent is a `tile`, not a `table`) | Move the action onto the table subview, not the tile parent |
| `templateName` action does nothing | Template record id doesn't exist or lacks `template` tag | `mcp__axon__queryHaystack({ filter: "def == \"<templateName>\" and template" })` |
| Template field never accepted | Field marked `ro` or `hidden` blocks user input | Drop `ro`/`hidden`, or seed via `defVal`/`defExpr` instead |
| Tabs in unexpected order | No `order:` set on views — alphabetical by `dis` | Add `order: <n>` on each view (lower = earlier) |
| Auto-refresh button does nothing on a built-in view | `afViewRefresherExt` actions only attach to custom views | Wrap the built-in in a Custom View, then add the buttons (see §3.4) |
| `afRefreshInterval` ignored | Used a string literal: `defVal:"5s"` | Use a Number-with-unit literal: `defVal:5s` |
| `sys::ParseErr: Marker cannot be cast to Str` | Set `view: marker()` on a view record | `view:` is the String view-name, not a Marker. Use `view:"mySiteHealth"`. See §3.0. |
| `sys::ParseErr: Invalid name: () => do [Line 1]` | Put trio-shaped `src:` (`view:` + `data:`) on a **func** record, or put axon `src` on a **view** record | Funcs and views are separate records with different `src:` schemas. See §3.0. |
| `Leading space in multi-line string must be 8` | Triple-quoted `"""…"""` continuation line indented with 2/4/6 spaces | Use exactly 8 spaces, or pre-validate with `validateAxonCode`. See §2.1. |
| `diff(rec, {tag:"x", -tag})` quietly drops `tag` | Remove + set in the same diff is non-atomic — `-tag` wins | Two commits: `{-tag}` then `{tag:"x"}` against a freshly-read rec. See §7.1. |
| `Instance not found: <name>` from `setPrimaryProject` | Case mismatch with configured instance name (URL is lowercase, config may be capitalised) | Confirm via `listSkySparkProjects`; recent builds match case-insensitively and suggest. |
| `searchAxonRegex` spilled 1M+ chars to a file | Broad regex (`=>\s*do`) hit thousands of matches with default `contextLines` | Pass `limit` (defaults to 100); tighten the pattern; paginate with `offset`. |
| `commitAxonFunction` fails `Expected ), not end [eval:10]` on any input | Pre-2026-05-20 build with malformed `if ... end` wrapper | Update the server; until then fall back to `executeAxonCode` with `commit(diff(null, {func, name, src}, {add}))`. See §2.2. |

## Best Practices

- **One app, many views, many helper funcs** — keep the app record minimal (`app`/`dis`/`icon`).
- **Helper functions return pre-meta'd grids** (`addMeta`, `addColMeta`) — keep view `expr` short.
- **Wrap every `expr` in `try(...)`** when calling helpers that may fail on partial data:
  ```
  data: {expr:"try(view_historianHealthBars({{dateSpan}})) catch(e => [].toGrid().addMeta({err:e}))"}
  ```
- **Prefer subviews over modals** — composition over interruption.
- **Bind once at the top** — declare shared state (`dateSpan`, `siteRef`) on the parent and let children read down.
- **Name with a project prefix** (`bassg_`, `acme_`) for app-specific helpers — easy to grep, easy to delete.
- **Commit with `commitAxonFunction`** for functions; `diff(null, dict, {add}).commit()` for app/view records.
- **Never store credentials or PII in `defVal`** — those are visible to anyone with read access to the view record.

## Advanced Patterns

- **Conditional subviews** — wrap a subview's `data` expr in a guard: `if (someVar) view_x() else [].toGrid()`.
- **Multi-level binding** — bind two levels deep with `binding:"../../grandparent/foo"`.
- **Cross-view selection** with `bindSelect:"id"` to publish the selected ref, then drive a detail panel.
- **Custom view types** — set `uiType:"acme::MyCustomUiView"` to delegate rendering to a Fantom `UiView` class (advanced; requires pod build).

## References

- `Apps.html`, `Views.html`, `ValDef.html`, `Actions.html` under `/Users/<user>/Code/axon_library_2025/docs/3.1.11/docFresco/`
- `Modals.html`, `Dialog.html` under `…/docDomkit/` and `…/domkit/`
- Third-party pods we standardise on:
  - `afViewRefresherExt` — auto-refresh action buttons for custom views (https://stackhub.org/package/afViewRefresherExt). See §3.4.
- Working apps to copy:
  - `/Users/<user>/Code/2026/skyspark/bassgPointHealth/lib/views/` — pure subview composition, no actions
  - `/Users/<user>/Code/2026/poppy/bassgresets/lib/{views,templates,funcs}/` — action buttons + `templateName` modals + nested layouts
  - `bassgMassPointOverride.pod` (Google Drive: F4Projects/PointOverride/build/) — production form/template patterns; ships as a Fantom pod
- Sibling workflows: `axon-func-update.md` (commit pattern), `spark-rule-creation.md` (rule pattern), `job-status-check.md` (job monitoring)
