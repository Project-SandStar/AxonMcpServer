---
title: Author Visualytik Dashboards (MCP)
description: Step-by-step guide for authoring Visualytik dashboards with an AI agent — read the catalog, generate a free page, bind live Haystack data, create SVGs, define animation state machines, wire block-programming logic graphs, build super-widgets, and validate/publish the .viz artifacts
category: ui-development
tags: [visualytik, viz, mcp, dashboard, free-page, abswidget, slot-binding, svg, data-anim, state-machine, xstate, gsap, anim-profile, logic-graph, block-catalog, typed-ports, canAssign, super-widget, xeto, slotsource, ai-panel, generatePage]
version: 1.0
---

# Author Visualytik Dashboards (MCP) Workflow

## Overview

**Visualytik** is a SkySpark-hosted dashboard authoring app (the rewrite, `visualytik2026`). Its core
thesis is **artifact-centric**: every dashboard is **typed JSON** persisted as a `.viz` (or `.anim`)
document under the project's `io/visualytik/` folder, served by the `bassgViz` weblet. An AI agent
"does the work" by **emitting valid artifacts**, never by driving a GUI. The schema the model targets
is the XETO `WidgetSpec` set (`src/xeto/`); a validator rejects malformed output; a versioned
renderer guarantees the result displays.

The **Visualytik MCP** turns that artifact contract into typed **tools + resources** an external Claude
(Desktop / Code) can call to operate the app the way a user would — build pages, bind points, generate
SVGs, define state machines, wire logic graphs, compose super-widgets.

> ## ⚠️ Two MCP servers — don't conflate them
>
> This doc lives in the **axon-mcp** `workflows/` folder for discoverability, but it documents a
> **separate, dedicated server**. There are two distinct MCP surfaces in play:
>
> | Server | What it operates | Tools (examples) | Status |
> |---|---|---|---|
> | **Visualytik MCP** *(the subject of this doc)* | The Visualytik dashboard app — authors `.viz`/`.anim` artifacts | `get_catalog`, `create_free_page`, `add_widget`, `bind_slot`, `create_logic_graph`, `add_block`, `connect`, `create_super_widget`, `create_svg`, `validate`, `apply` | ❌ **not built yet** (DESIGN) |
> | **axon-mcp** *(this folder's server)* | The SkySpark/Haystack runtime — Axon funcs, records, points | `searchAxonDocs`, `queryHaystack`, `executeAxonCode`, `commitAxonFunction`, `listSkySparkProjects`, `pointWrite` | ✅ live |
>
> **The authoring verbs (`create_free_page`, `add_block`, …) belong to the Visualytik MCP and will NOT
> appear under the axon-mcp toolset.** In this workflow, the axon-mcp tools are used **only** in the
> data-binding step (Step 3) to ground the Haystack point model — discovering point ids, reading
> cur/his, understanding writable points. Everything else is Visualytik-MCP territory. If you're looking
> for `create_free_page` in the axon-mcp tool list, it isn't there by design — that server talks to
> SkySpark, not to Visualytik.

> ## ⚠️ Read this first — SHIPPED vs DESIGN (status as of June 2026)
>
> The Visualytik **MCP server is NOT built yet** — there is no `@modelcontextprotocol/sdk` and no
> tools/resources. This doc mirrors **doc 18 §0**: each step carries a **[SHIPPED]** or **[DESIGN]**
> badge. What ships **today** is the **in-app AI panel loop** that generates a validated `FreePage` and
> the pod bridge routes it rides on. The **artifact JSON shapes in this doc are real and validated
> today** — so the DESIGN tools are presented as the *target contract* that compiles to those exact
> artifacts once the MCP lands.
>
> | Capability | Status | Where |
> |---|---|---|
> | In-app page generation (prompt → Claude → validated `FreePage` → preview/accept) | ✅ **SHIPPED** | `src/ai/aiService.ts` `generatePage()` |
> | Pod `ai/generate` (relays to `api.anthropic.com/v1/messages`) | ✅ SHIPPED | `pod/vizExt/fan/VizExt.fan` |
> | Pod `ai/schema` (project points as JSON for binding context) | ✅ SHIPPED | `VizExt.fan` |
> | Pod `ai/savekey` (encrypted Anthropic key) + `ai/test` | ✅ SHIPPED | `VizExt.fan` |
> | Generation catalog (widgets + XETO slots) | ✅ SHIPPED — **in-app TS only**, inlined into the system prompt | `src/ai/aiCatalog.ts`, `src/xeto/catalog.ts` |
> | Client-side validation (`validateProps` + page checks) | ✅ SHIPPED | `src/xeto/validate.ts`, `aiService.validatePage()` |
> | SVG widget (`widgets/Svg` + `sanitizeSvg`, `data-anim` preserved) | ✅ SHIPPED | `src/svg/sanitizeSvg.ts`, `src/xeto/catalog.ts` |
> | Typed-port `canAssign` rule + `TYPE_COLORS` | ✅ SHIPPED (primitive) | `src/logic/portTypes.ts` |
> | Pod `GET ai/catalog` JSON route (external/MCP consumers) | 🟡 **DESIGN** — catalog is in-app TS, not served as JSON | doc 18 §3, §5.3 |
> | Pod `ai/validate` / `ai/apply` | ❌ DESIGN | doc 18 §3 |
> | **MCP server** (tools + `viz://` resources) | ❌ **DESIGN — not built** | doc 18 §4 |
> | Super-widget persistence to `io/` | ❌ **IndexedDB-only** (known gap) | doc 18 §5.2 |
> | State-machine / `.anim` authoring | ❌ DESIGN | doc 19 |
> | Typed colored sockets, typed inPort/exPort, **mass-link** | ❌ DESIGN (increments B–D) | doc 17 §4 |

## When to Use This Workflow

Run this workflow automatically when the user asks anything like:

- *"Build me an AHU dashboard"* / *"Make a page that shows this site's zone temps"*
- *"Add a gauge that reads this point and turns red over 80"*
- *"Add a pump SVG that turns red on alarm"* / *"Draw a fan that spins when running, shakes on fault"*
- *"Wire these blocks"* / *"Compute a rolling average and bind it to a label"*
- *"Make a reusable equipment widget"* (super-widget)
- *"Group these into a popup that appears when the alarm fires"* (pane / ghost pane)
- *"Bind this widget to the discharge-air-temp point"*

## Prerequisites

1. **Connect + authenticate.** The app already reads all SkySpark data via `POST /api/<proj>/evalAll`
   and persists artifacts via `PUT …/ext/bassgViz/viz/<path>`. An external MCP agent authenticates as a
   **service account** — a dedicated SkySpark user with minimal rights (read + `ai/eval` allowlist + io
   write under `io/visualytik/`), SCRAM-authenticated with the 30-min token refresh modeled in
   `SkySparkHaystackClient`. **Never ship the Anthropic key or broad creds to a browser.** *(doc 18 §3
   auth — [DESIGN] for external agents; the in-app panel rides the user's session.)*

2. **Set the project.** All tool calls route through one project (the `<proj>` in the weblet path).

3. **Read the catalog FIRST — do not invent widget types or slots.** The widget catalog + XETO slots
   are the schema you must satisfy. See **Step 1**.

4. **Read the project schema** (sites / equip / points) before binding live data. See **Step 3**.

---

## Step 1 — Read the Catalog `[SHIPPED in-app · DESIGN as a tool/resource]`

**Always read the catalog before generating anything.** It tells you the legal widget `type`s, their
default sizes, and per-slot `name / type / dir / required / default / format / doc`. Generating against
the catalog is the single biggest driver of first-pass validity.

**Target MCP call** *(DESIGN)*:

```json
// tool call
{ "tool": "get_catalog", "arguments": {} }
// or read the resource:  viz://catalog
```

**What ships today** *(SHIPPED)*: there is **no HTTP `ai/catalog` route** — the catalog lives only as
in-app TypeScript. `buildAiCatalog()` (`src/ai/aiCatalog.ts`) assembles it from `WIDGET_CATALOG` +
the highest-version `WIDGET_SPECS` (+ `PANE_CATALOG`), and `aiCatalogPromptText()` renders it into the
system prompt. `buildAiCatalog()` returns a plain JSON-serializable object, so the future
`GET ai/catalog` route is "serve this." The returned shape (the `get_catalog` payload an MCP would
emit) is exactly:

```json
{
  "version": 1,
  "widgets": [
    {
      "type": "widgets/Gauge",
      "name": "Gauge",
      "doc": "Analog gauge",
      "defaultSize": { "w": 200, "h": 200 },
      "slots": [
        { "name": "value", "type": "Number", "dir": "in",   "required": true },
        { "name": "min",   "type": "Number", "dir": "in",   "required": false, "default": 0 },
        { "name": "max",   "type": "Number", "dir": "in",   "required": false, "default": 100 },
        { "name": "unit",  "type": "Str",    "dir": "in",   "required": false },
        { "name": "showValue", "type": "Bool", "dir": "prop", "required": false, "default": true }
      ]
    }
    // …Label, Button, Charts, Image, Grid (Table), Svg…
  ],
  "panes": [
    { "type": "panes/Pane",      "name": "Pane",       "doc": "Background region with optional chrome; group widgets inside it." },
    { "type": "panes/GhostPane", "name": "Ghost Pane", "doc": "Invisible grouping region (renders nothing in Live); group widgets to toggle them together." }
  ]
}
```

### 1.1 The 7 widgets and their semantic (bindable) slots

`buildAiCatalog()` keeps only fillable slots: `dir:'in'` (live-bindable inputs) and `dir:'prop'`
(static config), and **drops geometry** (`x/y/width/height/zIndex`) and `dir:'out'` slots. Every
widget also inherits the shared mixins (`LayoutProps` / `StyleProps` / `LinkProps`): `fontSize`,
`fontColor`, `background`, `borderColor`, `opacity`, `padding`, etc.

| `type` | Default `w×h` | Required slot(s) | Key optional slots | Notes |
|---|---|---|---|---|
| `widgets/Label` | 200×48 | `text` (Str, in) | `fontSize`, `fontColor`, `textAlign`, `iconName` (1.1) | Styled text. |
| `widgets/Button` | 140×44 | `caption` (Str, in) | `raised` (Bool, in), `click` (Marker, out) | Clickable. |
| `widgets/Gauge` | 200×200 | `value` (Number, in) | `min` 0, `max` 100, `unit`, `showValue`, `ticksCount`, `minColor`/`maxColor` | Analog gauge. |
| `widgets/Charts` | 420×240 | `in` (Grid, in) | `title`, `kind`, `unit`, `groupBySite`, `layout` (Dict) | Time-series/data chart; `in` is a history grid. |
| `widgets/Image` | 200×160 | `src` (Str, in) | `fit` `contain` | Static image. |
| `widgets/Grid` | 360×220 | `in` (Grid, in) | `title`, `showHeader` | Table (id `widgets/Grid`, label "Table"). |
| `widgets/Svg` | 280×200 | `svgMarkup` (Str, prop) | `svgUrl` (in), `animValue` (Number, in), `animNode` (prop), `animProfile` (prop) | See Step 4 / Step 5. |

> **Geometry is top-level, not a slot.** Even though the XETO mixin declares `x/y/width/height/zIndex`,
> the persisted `AbsWidget` keeps geometry on **top-level numeric fields** (`x/y/w/h/zIndex`) as the
> single source of truth — `buildAiCatalog()` removes them from the slot list on purpose. Never write
> geometry into `props`.

---

## Step 2 — Generate a Free Page `[SHIPPED via the in-app loop · DESIGN as create_free_page/add_widget]`

A dashboard page is a **`FreePage`** artifact: a fixed-size canvas of absolutely-positioned widgets.

### 2.1 The artifact contract (verified against `src/stores/pages.ts`)

```ts
interface FreePage {
  id: string
  name: string
  kind: 'free'
  widgets: AbsWidget[]
  panes?: CanvasPane[]          // doc 16 — background/ghost panes, below all widgets
  canvasWidth?: number          // world px; missing == DEFAULT_CANVAS
  canvasHeight?: number
}

interface AbsWidget {
  id: string
  type: string                  // ∈ widget catalog (e.g. 'widgets/Gauge')
  label: string
  x: number; y: number; w: number; h: number   // GEOMETRY — top-level, SSOT
  zIndex?: number               // GEOMETRY — stacking order
  props?: Record<string, unknown>   // NON-geometry slot values (text, fontColor, min, max, unit…)
  slotBindings?: SlotBinding[]  // live-data bindings (Step 3) — preferred
  bindings?: PointBinding[]     // LEGACY point bindings; prefer slotBindings
  locked?: boolean
  hidden?: boolean
  parentPaneId?: string         // assignment to a CanvasPane (doc 16)
}
```

**The three placement rules the model must obey** (these are the system-prompt rules in
`aiService.buildSystemPrompt()`):

1. **Geometry top-level, numeric** — `x/y/w/h/zIndex` are bare numbers on the widget, never strings,
   never inside `props`.
2. **Everything else in `props`** — semantic + style slots (`text`, `value`, `min`, `unit`,
   `fontColor`, …) go in `props`. Use `defaultPropsForType(type)` as the "blank valid widget."
3. **Live data via `slotBindings`** — see Step 3. A bound slot's `props` value is the static fallback.

### 2.2 The two paths

**[SHIPPED] In-app generate loop** (`src/ai/aiService.ts` `generatePage()`):

```
prompt ─▶ buildSystemPrompt() (inlines aiCatalogPromptText() + ai/schema points)
       ─▶ POST …/ext/bassgViz/ai/generate  (pod relays to api.anthropic.com/v1/messages)
       ─▶ parse FreePage JSON
       ─▶ aiService.validatePage()  (validateProps + page checks, client-side)
       ─▶ preview / diff  ─▶  user Accepts  ─▶  PUT …/viz/<pageId>.viz
```

**[DESIGN] MCP tools** — the same artifact, built incrementally:

```json
{ "tool": "create_free_page", "arguments": { "spec": { "id": "ahu1", "name": "AHU-1", "kind": "free", "widgets": [], "canvasWidth": 1200, "canvasHeight": 800 } } }
{ "tool": "add_widget",       "arguments": { "pageId": "ahu1", "widget": { /* AbsWidget */ } } }
```

### 2.3 A full, valid `FreePage` (3 widgets + one live binding)

```json
{
  "id": "ahu1",
  "name": "AHU-1 Overview",
  "kind": "free",
  "canvasWidth": 1200,
  "canvasHeight": 800,
  "widgets": [
    {
      "id": "w-title",
      "type": "widgets/Label",
      "label": "Title",
      "x": 40, "y": 32, "w": 360, "h": 48, "zIndex": 50,
      "props": { "text": "AHU-1 — Discharge Air", "fontSize": "18pt", "textAlign": "left" }
    },
    {
      "id": "w-dat",
      "type": "widgets/Gauge",
      "label": "Discharge Air Temp",
      "x": 40, "y": 110, "w": 220, "h": 220, "zIndex": 50,
      "props": { "value": 0, "min": 40, "max": 90, "unit": "°F", "showValue": true },
      "slotBindings": [
        { "slot": "value",
          "source": { "kind": "point", "connId": "c-demo", "project": "demo",
                      "pointId": "p:demo:r:2bf3-ahuDat", "mode": "cur", "unit": "°F",
                      "dis": "AHU-1 Discharge Air Temp" } }
      ]
    },
    {
      "id": "w-trend",
      "type": "widgets/Charts",
      "label": "DAT Trend",
      "x": 300, "y": 110, "w": 520, "h": 240, "zIndex": 50,
      "props": { "title": "Discharge Air Temp (24h)", "kind": "line" },
      "slotBindings": [
        { "slot": "in",
          "source": { "kind": "point", "connId": "c-demo", "project": "demo",
                      "pointId": "p:demo:r:2bf3-ahuDat", "mode": "his" } }
      ]
    }
  ]
}
```

> The `value` slot carries a static `0` in `props` (the fallback) **and** a `slotBindings` entry that
> overrides it with the live `cur` value. The chart binds the **same point with `mode:'his'`** to pull
> a history grid into its `in` slot.

---

## Step 3 — Bind to Live Data `[SHIPPED artifact + ai/schema · DESIGN as bind_slot]`

A binding attaches a **`SlotSource`** to a widget's input slot. The persisted shape is
`slotBindings: SlotBinding[]`.

### 3.1 The binding shapes (verified against `src/data/pointBinding.ts`)

```ts
interface SlotBinding { slot: string; source: SlotSource }

type SlotSource =
  | { kind: 'point';  connId: string; project: string; pointId: string;
      unit?: string; dis?: string; mode?: 'cur' | 'his'; tagField?: string; map?: MappingRule[] }
  | { kind: 'axon';   axon: string; map?: MappingRule[] }
  | { kind: 'io';     uri: string;  map?: MappingRule[] }
  | { kind: 'logic';  graphId: string; port: string; map?: MappingRule[] }   // a logic-graph exPort (Step 6)
  | { kind: 'anim';   widgetId: string; port: string; map?: MappingRule[] }  // an .anim profile exPort (Step 5)
  | { kind: 'static'; value: unknown; map?: MappingRule[] }
```

| `kind` | Use for | Required fields |
|---|---|---|
| `point` | A live Haystack point | `connId`, `project`, `pointId` (+ `mode:'cur'\|'his'`) |
| `axon` | An ad-hoc Axon expression (sandboxed) | `axon` |
| `io` | A file/`io://` resource | `uri` |
| `logic` | An exposed output port of a logic graph (Step 6) | `graphId`, `port` |
| `anim` | An exposed output of an `.anim` profile (Step 5) | `widgetId`, `port` |
| `static` | A constant | `value` |

`map?: MappingRule[]` post-processes the resolved value (first match wins) — e.g. map a numeric alarm
to a color, or a boolean to two branches. This is the **discrete** mapping the bind picker produces;
**continuous** value→color is a `ColorScale` on the animation side (Step 5), a distinct type.

### 3.2 The `bind_slot` tool sugar `[DESIGN]`

The MCP `bind_slot` takes an ergonomic `{ <slot>: <source> }` and **compiles to a `slotBindings`
entry** — it does not introduce a new stored shape:

```json
{ "tool": "bind_slot",
  "arguments": { "pageId": "ahu1", "widgetId": "w-dat", "slot": "value",
                 "source": { "kind": "point", "connId": "c-demo", "project": "demo",
                             "pointId": "p:demo:r:2bf3-ahuDat", "mode": "cur" } } }
```

→ appends `{ "slot": "value", "source": { …point… } }` to `w-dat.slotBindings`.

### 3.3 Discovering points `[SHIPPED]`

The pod **`ai/schema`** route returns the project's points as JSON (the binding context inlined into
the system prompt). For an MCP agent the designed surface is `get_project_schema` /
`viz://project-schema` (+ `list_points(filter)`, `read_point(id)`, `his_read(id, range)`).

**Grounding the point model (Haystack):**

- **`cur` vs `his`** — `mode:'cur'` resolves the point's **current value** (`curVal` / live
  `pointWrite`); `mode:'his'` pulls **history** (`hisRead`) and yields a grid (feed a `widgets/Charts`
  or `widgets/Grid` `in` slot). Pick `his` for trends/tables, `cur` for gauges/labels.
- **Writable points** — a point with `writable` is driven by the **`pointWrite` priority array** (16
  levels; `pointOverride(point, val, level)` sets a manual override). Visualytik bindings are
  **read-side**; writes go through a `widgets/Button` action wired to a logic block, not a `SlotBinding`.
- **`pointId`** is the live Haystack record id; **it must exist** — the validator/`ai/validate` rejects
  a `point` source with an id the project doesn't have. Discover real ids via `list_points` /
  `ai/schema` before binding.

---

## Step 4 — Create SVGs `[SHIPPED widget + sanitize · DESIGN as create_svg]`

The `widgets/Svg` widget renders raw SVG markup on the live SVG DOM. Its slots (from
`src/xeto/catalog.ts`):

| Slot | Type | Dir | Purpose |
|---|---|---|---|
| `svgMarkup` | Str | prop | The raw SVG source (required). Ships with a starter graphic containing a `data-anim="status"` node. |
| `svgUrl` | Str | in | Alternative: load from an `io://`/http url (renderer stub; prefer `svgMarkup`). |
| `animValue` | Number | in | A bound numeric/any value the animation seam reacts to. |
| `animNode` | Str | prop | The `data-anim` id whose fill/opacity reacts to `animValue`. |
| `animProfile` | Str | prop | Reference to an authoritative `.anim` `AnimProfile` by `name@major` (Step 5). **When set it SUPERSEDES `svgMarkup`** and drives the XState machine + GSAP timelines. |

### 4.1 The `data-anim` id contract (the load-bearing rule)

Animation hooks target SVG elements by a **`data-anim` id**. The sanitize/optimize pipeline is built to
**preserve `id` and `data-anim`** so those hooks survive:

```
markup ──► SVGO (author/build-time; cleanupIds + prefixIds DISABLED) ──► DOMPurify (runtime, SVG profile) ──► svg.js import ──► id index
```

`sanitizeSvg` (`src/svg/sanitizeSvg.ts`, **SHIPPED**) drops `<script>`, strips all `on*` handlers and
`javascript:` hrefs, blocks `foreignObject`/external refs — **but keeps `id`, `data-anim`, and
presentation attributes**, returning `''` if the markup is not a well-formed `<svg>` root (so callers
fall back to a placeholder). **AI-supplied SVG is untrusted input** — sanitize always runs on the hot
path; never skip it. The generation prompt must require the `data-anim` convention; a validator flags
missing hooks rather than letting them be silently un-animatable.

### 4.2 The two paths

- **[SHIPPED]** Put inline SVG (with `data-anim` ids) directly in `props.svgMarkup` of a `widgets/Svg`.
- **[DESIGN]** `create_svg(id, markup)` — validates `data-anim` ids and stores `svg/<id>.svg`, then
  `bind_svg_node(...)` ties a node to a value.

### 4.3 An SVG widget (status circle that reacts to a bound value)

```json
{
  "id": "w-pump",
  "type": "widgets/Svg",
  "label": "Pump status",
  "x": 860, "y": 110, "w": 280, "h": 200, "zIndex": 50,
  "props": {
    "svgMarkup": "<svg viewBox=\"0 0 200 120\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"10\" y=\"10\" width=\"180\" height=\"100\" rx=\"10\" fill=\"#1e293b\"/><circle data-anim=\"status\" cx=\"100\" cy=\"55\" r=\"28\" fill=\"#64748b\"/><text x=\"100\" y=\"100\" text-anchor=\"middle\" fill=\"#cbd5e1\" font-size=\"13\">PUMP-1</text></svg>",
    "animNode": "status"
  },
  "slotBindings": [
    { "slot": "animValue",
      "source": { "kind": "point", "connId": "c-demo", "project": "demo",
                  "pointId": "p:demo:r:7a1-pumpAlarm", "mode": "cur",
                  "map": [ { "eq": true, "out": "#ef4444" }, { "else": true, "out": "#22c55e" } ] } }
  ]
}
```

> `animNode:"status"` points the simple value-driven seam at the `data-anim="status"` circle; the bound
> `animValue` (the pump alarm) flows through a `MappingRule` set to red-on-alarm / green-otherwise. For
> multi-state motion (spin/shake), graduate to an `.anim` profile (Step 5) and set `animProfile`.

---

## Step 5 — Define State Machines `[DESIGN — doc 19]`

For real motion ("a fan that **spins** when running, **shakes** on fault"), Visualytik uses an
**XState master machine + one GSAP timeline per state**, edited on a **Rete.js** canvas (the 4th tab:
*View · Logic · Animation · Template*). The whole bundle is a versioned **`.anim` JSON** stored in
`io/visualytik` (extension-agnostic — no `VizExt.fan` change), referenced by a widget/super-widget via
`animProfile: "name@major"`.

### 5.1 The runtime spine

```
DATA                STATE                MOTION                   SVG
Haystack value ─▶ machine event ─▶ transition entry ─▶ GSAP timeline on data-anim nodes
(binding layer)   (XState)          (one per state)      (svg.js .node by data-anim id)
                └─ value-driven tween ───────────────────▶ continuous (ColorScale / prop)
```

Three modes over **one** artifact: **Editor** / **Live** (`machine.send()` fires entry timelines) /
**DVR** (deterministic scrub — state-at-t & value-at-t are a pure function of the cursor, so machine
`after:` delays must be DVR-clock-driven, not wall-clock `setTimeout`).

### 5.2 The three SVG links

Each `data-anim` element declares which links it uses (`AnimElement.links`):

| Link | What | Driven by |
|---|---|---|
| **state-driven** | a machine state plays a named timeline on the element | XState entry action → GSAP timeline |
| **value-driven** | a bound value tweens a prop or drives a `ColorScale` (fill ∝ value) | binding → continuous GSAP `set`/tween |
| **live text** | a bound value formatted into a text node | binding → text content (`aria-live` for alerts) |

### 5.3 The `.anim` format (verified against doc 19 §19.8)

```ts
interface AnimProfile {
  name: string                       // "fan"
  version: { major: number; minor: number }   // additive-minor, like .viz
  interpreterVersion: number
  svg: string                        // sanitized markup with data-anim ids
  elements: AnimElement[]            // per data-anim element: which links it uses
  machine: MachineDef                // declarative XState
  timelines: Record<string, Timeline> // name → declarative GSAP timeline
}
interface MachineDef {
  initial: string
  context?: Record<string, unknown>
  states: Record<string, {
    entry?: string                                              // timeline name to play
    on?: Record<string, { target: string; guard?: string }>    // event → state
    after?: Record<string, { target: string; guard?: string }> // DVR-clock delay
  }>
  guards?: Record<string, GuardDef>  // declarative threshold on a bound value
}
interface Timeline { duration: number; tracks: Track[] }
interface Track {
  target: string                     // data-anim id
  prop: 'x'|'y'|'rotation'|'scale'|'opacity'|'fill'|'stroke'|'path'
  keys: { at: number; from?: unknown; to: unknown; ease?: string }[]
  stagger?: number
}
```

### 5.4 How an agent emits one (sketch `.anim`)

The AI generation pipeline (doc 19 §19.11) constrains output to a JSON Schema **derived from the
`.anim` interfaces**, then runs a **referential-integrity validator**: *every*
`timeline.track.target` ∈ the SVG's `data-anim` ids, and *every* `state.entry` ∈ `timelines`. The diff
is human-in-the-loop; accept applies SVG + machine + timelines atomically.

```json
{
  "name": "fan",
  "version": { "major": 1, "minor": 0 },
  "interpreterVersion": 1,
  "svg": "<svg viewBox=\"0 0 100 100\"><g data-anim=\"blades\">…</g><rect data-anim=\"housing\" …/></svg>",
  "elements": [
    { "anim": "blades",  "links": ["state"] },
    { "anim": "housing", "links": ["state", "value"] }
  ],
  "machine": {
    "initial": "off",
    "states": {
      "off":     { "on": { "RUN": { "target": "running" } } },
      "running": { "entry": "spin",  "on": { "STOP": { "target": "off" }, "FAULT": { "target": "fault" } } },
      "fault":   { "entry": "shake", "on": { "CLEAR": { "target": "running" } } }
    },
    "guards": { "isFault": { "truthy": true, "input": "alarm" } }
  },
  "timelines": {
    "spin":  { "duration": 1.0, "tracks": [ { "target": "blades", "prop": "rotation", "keys": [ { "at": 0, "to": 0 }, { "at": 1, "to": 360, "ease": "none" } ] } ] },
    "shake": { "duration": 0.4, "tracks": [ { "target": "housing", "prop": "x", "keys": [ { "at": 0, "to": -2 }, { "at": 0.2, "to": 2 }, { "at": 0.4, "to": 0 } ] } ] }
  }
}
```

Reference it from the widget: `props.animProfile = "fan@1"`. The machine's events are sent from bound
values; an `.anim` exPort can feed other widgets via a `SlotSource { kind: 'anim', widgetId, port }`.

---

## Step 6 — Scripting & Block Programming `[SHIPPED canAssign + artifact · DESIGN as tools]`

Logic is a **dataflow graph** of typed blocks (flow-based, akpizza-style). The vocabulary is the
**`BLOCK_CATALOG`** (`src/logic/blocks.ts`) — 73 blocks across **6 categories**:

| Category | Count | Examples |
|---|---|---|
| `core` | 21 | `core/Boolean`, `core/Compare`, `core/If`, `core/Timer`, `core/Notification` |
| `math` | 10 | `math/Add`, `math/Clamp`, `math/Min`, `math/Max`, `math/MinMax` |
| `data` | 21 | data/IO + Haystack read blocks |
| `grid` | 14 | grid transforms |
| `dvr` | 1 | DVR cursor block |
| `axon` | 6 | `axon/*` (eval an Axon expr via the runtime ctx) |

### 6.1 The graph artifact (verified against `src/logic/types.ts`)

```ts
interface LogicGraph {
  id: string
  name: string
  scope: LogicScope                              // 'page' | 'superwidget' | …
  processes: Record<string, ProcNode>            // processId → node
  connections: Connection[]                      // edges + IIPs (flat list)
  inPorts: PortDecl[]                            // graph-level EXPOSED inputs
  exPorts: Array<{ name: string; type: string; from: { process: string; port: string } }>
}
interface ProcNode { component: string; x: number; y: number; label?: string; params?: Record<string, unknown> }
interface EdgeConnection { src: { process: string; port: string }; tgt: { process: string; port: string } }
interface DataConnection { /* IIP: a static literal delivered to a target port */ }
interface BlockDef { id: string; label: string; category: string; inPorts: PortDecl[]; outPorts: PortDecl[]; params?: PortDecl[]; eval?: (…) }
interface PortDecl { name: string; type: string }
```

The whole logic doc persists as `logic.viz`: `{ graphs: Record<id, LogicGraph>, pageGraphIds }`.

### 6.2 Typed ports + `canAssign` link validation `[canAssign SHIPPED]`

Port types come from `src/logic/blocks.ts`: `number`, `boolean`, `string`, `color`, `datetime`,
`span`, `grid`, `dict`, `hdict`, `hval`, `array`, `event`, `heatMapPoint`, plus wildcards `any`/`all`.
`connect` **rejects type-incompatible links** per the **shipped** rule (`src/logic/portTypes.ts`):

```ts
export function canAssign(srcType, tgtType): boolean {
  return isWildcard(srcType) || isWildcard(tgtType) || srcType === tgtType
}
```

`TYPE_COLORS` paints the socket circles (`number`=blue, `boolean`=green, `string`=purple, `color`=pink,
…). **Boundary nodes (`inPort`/`exPort`) default to `'ref'` today; typed/colored sockets and
ergonomic typed boundary ports are DESIGN increments B–C (doc 17). An exPort's type is what a widget
binding sees** (a `color` exPort offers itself to color slots).

### 6.3 The MCP tools `[DESIGN]`

```json
{ "tool": "create_logic_graph", "arguments": { "scope": "page" } }
{ "tool": "add_block",          "arguments": { "graphId": "g1", "component": "math/Add", "pos": { "x": 120, "y": 80 } } }
{ "tool": "connect",            "arguments": { "graphId": "g1", "src": { "process": "n-rdg", "port": "out" }, "tgt": { "process": "n-add", "port": "a" } } }   // rejects if !canAssign(srcType, tgtType)
{ "tool": "add_inport",         "arguments": { "graphId": "g1", "name": "setpoint", "type": "number" } }
{ "tool": "add_export",         "arguments": { "graphId": "g1", "name": "demand", "type": "number", "from": { "process": "n-add", "port": "out" } } }
{ "tool": "attach_graph_to_page","arguments": { "pageId": "ahu1", "graphId": "g1" } }
```

> **Mass-link** (right-click "Mass Link…", two-column type-filtered multi-select) is DESIGN increment D
> (doc 17) — do not imply it ships.

### 6.4 A small graph (read a point, clamp it, expose it)

```json
{
  "id": "g1",
  "name": "DAT demand",
  "scope": "page",
  "processes": {
    "n-clamp": { "component": "math/Clamp", "x": 200, "y": 80, "params": { "min": 0, "max": 100 } }
  },
  "connections": [
    { "src": { "process": "$inport:dat", "port": "out" }, "tgt": { "process": "n-clamp", "port": "in" } }
  ],
  "inPorts": [ { "name": "dat", "type": "number" } ],
  "exPorts": [ { "name": "demand", "type": "number", "from": { "process": "n-clamp", "port": "out" } } ]
}
```

A widget consumes the exposed output via `slotBindings: [{ slot: 'value', source: { kind: 'logic', graphId: 'g1', port: 'demand' } }]`.

---

## Step 7 — Super-Widgets `[DESIGN tools · IndexedDB-only persistence gap]`

A **super-widget** is a reusable composite: an internal free-canvas of widgets + a backing logic graph
+ exposed ports. Verified shape (`src/superwidget/types.ts`):

```ts
interface SuperWidgetDef {
  id: string
  name: string
  icon?: string
  box: { w: number; h: number }       // default placement size (world px)
  widgets: AbsWidget[]                 // internal free-canvas content
  logicGraphId: string                 // backing LogicGraph (scope:'superwidget')
  inPorts: SuperWidgetPort[]           // exposed parameters (inputs)
  exPorts: SuperWidgetPort[]           // exposed outputs
}
```

> **Known gap (doc 18 §5.2):** super-widgets are **IndexedDB-only** today
> (`src/superwidget/useSuperWidgetStore.ts` debounces a snapshot to `src/data/idb.ts`). They are **not
> yet synced to `io/`**, so the designed `superwidgets/<id>.viz` path and a cross-session/MCP-visible
> library do not exist yet. Treat `create_super_widget` as authoring a def that, today, only persists
> locally.

**The MCP tools `[DESIGN]`:**

```json
{ "tool": "create_super_widget", "arguments": { "spec": { "id": "ahuTile", "name": "AHU Tile", "box": { "w": 300, "h": 220 }, "widgets": [ /* AbsWidget[] */ ], "logicGraphId": "g-ahuTile", "inPorts": [ { "name": "equipRef", "type": "ref" } ], "exPorts": [ { "name": "alarm", "type": "boolean" } ] } } }
{ "tool": "place_super_widget",  "arguments": { "pageId": "ahu1", "defId": "ahuTile", "pos": { "x": 40, "y": 360 } } }
```

A `create_super_widget` must also create its companion `scope:'superwidget'` graph (Step 6).

---

## Step 8 — Validate & Publish `[validation SHIPPED · ai/validate + apply DESIGN]`

### 8.1 Validate

- **[SHIPPED]** Client-side: `validateProps` (`src/xeto/validate.ts`) + `aiService.validatePage()`
  check each widget's `type` ∈ catalog, required slots present, geometry top-level, and
  `slotBindings[].source` is a valid `SlotSource`. The in-app loop validates **before** showing the
  diff.
- **[DESIGN]** `POST …/ai/validate { kind, doc } → { ok, errors[] }`, or the MCP `validate(kind, doc)` —
  validate any artifact against the XETO specs + graph rules **before** persisting. Pairs with Claude
  **Structured Outputs** (constrain-during) for near-zero rejected generations.

### 8.2 Publish

Everything persists as JSON in `io/visualytik/`, served by the `bassgViz` weblet. **Path conventions**
(doc 18 §1, §3):

| Artifact | Path |
|---|---|
| Free / grid page | `<pageId>.viz` |
| Templates (library) | `templates.viz` |
| Logic graphs | `logic.viz` |
| SVG asset *(once §5 lands)* | `svg/<id>.svg` |
| Super-widget *(gap — IndexedDB today)* | `superwidgets/<id>.viz` |
| Animation profile | `<name>.anim` (in `io/visualytik`) |

- **[SHIPPED]** `PUT …/ext/bassgViz/viz/<path>` writes a single artifact (the accept step of the in-app
  loop).
- **[DESIGN]** `POST …/ai/apply` / the MCP `apply(changeset)` — **transactional multi-file write** (page
  + its logic graph + bindings) so "build this dashboard" lands atomically with one validation pass.

---

## Appendix A — Author `.viz` via Axon `io` (the shipped, no-MCP path) `[SHIPPED]`

The Visualytik MCP isn't built, but you can author/patch pages **today** server-side through
**axon-mcp `executeAxonCode`** using SkySpark's `io` funcs against `io/visualytik/<pageId>.viz`. This
is how the live "Poppy Demo" was built (see sibling memory/workflow notes).

**Read / list / write:**
```axon
ioDir(`io/visualytik/`)                          // list pages (+ anim.viz, logic.viz, templates.viz)
page: ioReadJson(`io/visualytik/<id>.viz`)        // -> Dict; page["widgets"] is a List of Dicts
ioWriteJson(page, `io/visualytik/<id>.viz`)       // round-trips faithfully (pretty JSON)
ioReadStr(uri) / ioWriteStr(str, uri)             // raw text (use for the one-time backup)
```
A page's `name`/`kind`/`widgets`/`canvasWidth`/`canvasHeight` match the `FreePage` contract in Step 2.

**Patch non-destructively — read-modify-write, touch ONLY your field:**
```axon
page: ioReadJson(uri)
page2: page.set("widgets", page["widgets"].map(w =>
  if (w["id"] == "pd-svg") w.set("props", w["props"].set("svgMarkup", svg)) else w))
ioWriteJson(page2, uri)
```
Map over `widgets` and `.set` only the slot you own; every other widget, plus geometry/style, is
preserved. **Do NOT** strip-and-re-add widgets at hardcoded coordinates — that clobbers user layout.

**⚠️ Concurrent-writer hazard (the #1 way to lose work).** The running Visualytik app holds the page in
the browser and **saves it back to the same `.viz`** on edit/accept. Your `ioWriteJson` and the app's
save race — last writer wins. Rules:
- Establish ownership: **user owns LAYOUT** (`x/y/w/h/zIndex`, fonts, colors) in the app; **the agent
  owns CONTENT** (`slotBindings`, `svgMarkup`, computed text). Only ever `.set` content fields; never
  overwrite geometry you didn't author.
- Prefer a patch func over a rebuild func. Re-running a patch must be idempotent and geometry-safe.
- Back up once before the first write: `ioWriteStr(ioReadStr(uri), <id>.bak.viz)`.
- After any write the user must **reload the page** (the app reads `.viz` on load); an open editor won't
  hot-pick-up the file and may save over you.

**Live data without the MCP and without axon bindings.** The shipped renderer's `useWatch` poll
(`pollMs = 5000`) refreshes **only `kind:'point'` `mode:'cur'`** bindings every 5 s. `kind:'axon'`
bindings ARE evaluated (`useWidgetData` → `client.evalAll`) but `refreshLiveExpr` only re-runs on
source/mode change — **they do not poll**, so an axon-bound label goes stale. For live aggregates,
compute server-side into **curRule computed points** (`point+cur+computed`, `ruleFunc` defcomp calling
an Axon func, `ruleFreq 5sec`, `his+hisCollectCov`) and bind labels `kind:'point'`. A `kind:"Str"`
curVal renders as the label text; bind `slot:"fontColor"` to a point whose curVal is a hex string for
dynamic color. (See sibling `curRule-computed-points.md`.)

**SVG animation that survives sanitize.** `sanitizeSvg` (Step 4) strips only `<script>`, `on*`, and
`javascript:` — it **keeps SMIL** (`<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`) and
`<style>`. So inline SMIL animates an `widgets/Svg` with **zero JS and no `.anim`/DVR machinery**; it
plays automatically on load. Use **single-quoted SVG attributes** so the markup needs no escaping inside
an Axon double-quoted string. Graduate to an `.anim` profile (Step 5) only for state-machine motion.

**Axon `evalAll` dict→spec parser gotcha.** In ad-hoc `executeAxonCode`, a dict literal that is **not
the first statement** (`name: {…}`, or `… => do {…}`) is misparsed as a Xeto spec —
`axon::SyntaxErr: Expecting spec typename or '{' for slots`. Workaround: put dict-building logic in a
**committed func** (via `commitAxonFunction`) and call it. Inside the func, inline dicts in **list
literals** work and **dict-as-function-argument** works, but **avoid nested `=> do { … }` lambdas** —
build via `.set` or precompute the lists at the func-body top level.

## Common Gotchas (reference table)

| Symptom | Cause | Fix |
|---|---|---|
| Generated widget renders blank / validator rejects `type` | Invented a widget `type` not in the catalog | Read `get_catalog` first; `type` ∈ `widgets/{Label,Button,Gauge,Charts,Image,Grid,Svg}` |
| Geometry ignored / widget at 0,0 | Put `x/y/w/h` inside `props` (or as strings) | Geometry is **top-level numeric** on `AbsWidget` — never in `props`, never quoted |
| Binding silently does nothing | Used a non-existent `bind` field | The stored field is **`slotBindings: [{slot, source}]`** — there is no `bind` field |
| `point` binding fails validation | `pointId` is not a live record id | Discover real ids via `ai/schema` / `list_points`; a `point` source needs `connId`+`project`+`pointId` |
| Chart/Table shows nothing | Bound a `cur` point to a `Grid` `in` slot | Charts/Tables need a **history grid** → `mode:'his'` |
| Required slot missing error | Omitted a `dir:'in'` required slot (`Gauge.value`, `Charts.in`, `Svg.svgMarkup`, `Label.text`, `Button.caption`, `Image.src`) | Seed it via `defaultPropsForType(type)` then bind/override |
| SVG animation never fires | `data-anim` id was stripped, or `animNode`/`track.target` references a missing id | Keep SVGO `cleanupIds`/`prefixIds` disabled; ensure ids match; sanitize preserves `id`+`data-anim` |
| SVG injected but blank | Markup not a well-formed `<svg>` root | `sanitizeSvg` returns `''` for non-svg roots → fix the markup |
| `.anim` accept rejected | `track.target` ∉ SVG `data-anim` ids, or `state.entry` ∉ `timelines` | Referential-integrity validator (doc 19 §19.11) — every target/entry must resolve |
| `connect` rejected | Port types incompatible | `canAssign(src,tgt)` requires equal types or a wildcard (`any`/`all`); check `PortDecl.type` on both blocks |
| exPort won't offer itself to a color slot | Boundary node defaulted to `'ref'` | Typed inPort/exPort is DESIGN (doc 17 §4 incr C); today set/derive the boundary type |
| Super-widget not visible in another session | Persistence is **IndexedDB-only** | Known gap (doc 18 §5.2) — not synced to `io/` yet |
| "Tool not found" for `create_free_page`/`add_block`/etc. | The MCP server is **not built** | Use the in-app generate loop (`generatePage()`) today; MCP tools are DESIGN |
| Anthropic key exposed | Key shipped to browser/agent | Key is stored **encrypted** pod-side (`ai/savekey`); external agents use a **service account**, never the key |
| User's in-app layout edits vanish | Agent rebuilt the page and re-added widgets at hardcoded coords, racing the app's own save | Patch non-destructively (`ioReadJson` → `.set` only your field → `ioWriteJson`); user owns geometry, agent owns content. See Appendix A |
| Label bound to an `axon` source never updates | `kind:'axon'` bindings don't poll (only `kind:'point'` cur does, every 5 s) | Drive the value into a `curRule` computed point and bind `kind:'point'`. See Appendix A |
| Generated SVG has no motion | Static shapes only | Inline SMIL (`<animate>`/`<animateTransform>`) survives `sanitizeSvg` and plays automatically — no `.anim`/DVR needed. See Appendix A |
| `Expecting spec typename or '{' for slots` building a widget Dict | `executeAxonCode` misparses a non-first dict literal as a Xeto spec | Build dicts inside a committed func; avoid nested `=> do { … }`. See Appendix A |

## Best Practices

- **Read the catalog before every generation.** Generate against `aiCatalogPromptText()` / `get_catalog`
  — defaults + required markers + format hints are what raise first-pass validity.
- **Geometry top-level, everything else in `props`, live data in `slotBindings`.** Three rules; get them
  right and the rest is mechanical.
- **Seed with `defaultPropsForType(type)`** — the "blank valid widget" — then override/bind.
- **`cur` for gauges/labels, `his` for charts/tables.** Match the binding `mode` to the slot's shape
  (scalar vs grid).
- **Always sanitize AI/user SVG.** Treat it as untrusted input (enterprise/schools deployment);
  `sanitizeSvg` runs on the hot path. Keep `data-anim` ids intact.
- **One point, many surfaces.** Bind the same `pointId` (`cur` to a gauge, `his` to a chart) instead of
  re-discovering it.
- **Validate before diff, accept atomically.** The human-in-the-loop diff/accept is mandatory; prefer
  `ai/apply` (DESIGN) for multi-artifact dashboards so they land in one transaction.
- **Reuse the binding model everywhere.** Panes (`visible`), animation value-links, and logic exPorts
  all resolve through the same `SlotSource` — one mental model.

## Advanced Patterns

- **State-bound groups (ghost panes, doc 16).** A `CanvasPane` with `ghostPane:true` renders nothing in
  Live; bind its `visible` slot (`slotBindings`) to a boolean and it becomes an **appear/close group** —
  the resolved boolean shows/hides the pane *and* every widget assigned to it (`parentPaneId`). Use for
  alarm popups.
- **Logic → widget → animation chain.** Compute in a `LogicGraph`, expose an `exPort`, bind it to a
  widget slot (`kind:'logic'`), and let that value drive an `.anim` machine event (`kind:'anim'`).
- **Mapping rules vs ColorScale.** `MappingRule` (discrete, first-match) lives on any `SlotSource.map`;
  `ColorScale` (continuous value→color interpolation) is an animation value-link type — pick discrete
  for status, continuous for gradients.
- **Versioned profiles.** `.anim` and `.viz` both evolve **additive-minor within a major**; reference
  profiles as `name@major` so older docs keep rendering under newer renderers.

## References

**Design docs** (`/Users/<user>/Code/2026/visualytik/docs/visualytik2026/`):
- `18-ai-rest-api-and-mcp.md` — MCP tool list + artifact contract + **§0 SHIPPED/DESIGN status** (primary source)
- `19-animation-workspace.md` — XState + GSAP + the `.anim` format + the three SVG links
- `17-typed-ports-link-validation-mass-link.md` — typed ports, `canAssign`, inPort/exPort, mass-link
- `16-panes-and-ghost-panes.md` — panes / ghost panes (state-bound visibility groups)
- `13-svg-library-and-editor.md` — SVG pipeline (SVGO/DOMPurify, `data-anim` id contract)
- `05-ai-panel.md`, `02-viz-and-xeto-widget-specs.md` — the `.viz`/XETO artifact model + backward-compat

**Real source files** (`/Users/<user>/Code/2026/visualytik/visualytik2026/`):
- `src/stores/pages.ts` — `FreePage`, `AbsWidget`, `CanvasPane`
- `src/ai/aiCatalog.ts` — `buildAiCatalog()` / `aiCatalogPromptText()` (the `get_catalog` payload)
- `src/xeto/catalog.ts`, `src/xeto/types.ts` — `WIDGET_SPECS`, `SlotDef`, the 7 widgets' slots
- `src/data/pointBinding.ts` — `SlotBinding`, `SlotSource` (6 kinds), `MappingRule`
- `src/logic/blocks.ts`, `src/logic/types.ts`, `src/logic/portTypes.ts` — `BLOCK_CATALOG`, `LogicGraph`/`ProcNode`/`BlockDef`, `canAssign`/`TYPE_COLORS`
- `src/superwidget/useSuperWidgetStore.ts`, `src/superwidget/types.ts` — `SuperWidgetDef` (IndexedDB-only)
- `src/svg/sanitizeSvg.ts` — the SVG sanitize contract (preserves `id` + `data-anim`)
- `src/ai/aiService.ts` — `generatePage()` (the SHIPPED in-app loop); `src/xeto/validate.ts` — `validateProps`
- `pod/vizExt/fan/VizExt.fan` — `ai/generate`, `ai/schema`, `ai/savekey`, `ai/test` routes

**Sibling workflows:** `app-creation.md` (SkySpark apps/views), `spark-rule-creation.md` (FDD rules).
