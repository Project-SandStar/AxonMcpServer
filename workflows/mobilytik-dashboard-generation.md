---
title: Generate Mobilytik Dashboards (Axon)
description: Step-by-step guide for generating Mobilytik mobile/web dashboards with Axon only — the mDashboard / mWidget folio records, widget types and their slots, expression bindings (free Axon and point-by-id), live data through Haystack watches, and the planned group templates (mGroupTemplate) with tag-based equip binding
category: ui-development
tags: [mobilytik, bassgMobilytik, dashboard, mDashboard, mWidget, mGroupTemplate, widget, slot-binding, readById, curVal, watch, thermostat, gauge, historyChart, template, vav, rtu, equip]
version: 1.0
---

# Generate Mobilytik Dashboards (Axon) Workflow

## Overview

A **Mobilytik dashboard** is what the Mobilytik app (iOS/Android) and the
bassgMobilytik web builder (`/api/<proj>/ext/bassgMobilytik/index.html`, the
"Mobilytik Builder" view) render for a project. It is stored **entirely as
folio records tagged with `m*` (mobilytik) tags**, so an agent can generate,
inspect and repair dashboards with plain Axon: no files, no GUI.

- One **`mDashboard`** record per project: the ordered list of top-level
  widget uids and the spec version.
- One **`mWidget`** record per widget: `uid`, `type`, and one tag per slot
  (property) the widget overrides. Slots it does not carry use the app's
  built-in defaults.
- Groups are widgets too (`type:"group"`) whose `children` list other widget
  uids.

Source of truth for the model: `mobilytik_dashboard/` in the mobilytik repo
(`lib/src/entities/specs_basic/*.dart` for slots,
`lib/src/data/providers/axon_dashboard_provider.dart` and
`parsing/axon_parsing.dart` for the record encoding).

**Use this workflow when:** asked to build, extend, clone or fix a Mobilytik
dashboard for a site; to bind widgets to points; or to generate one dashboard
group per equip (VAV, RTU, AHU ...).

**Do not:** write to michaelsenergy or any production project to "try" a
dashboard. Build and check on the local SkySpark 3.1.12 (`demo`, `poppy`)
first; production writes need explicit approval.

---

## Step 1: Read what exists

```axon
read(mDashboard, false)                               // null = no dashboard yet
readAll(mWidget).toRecList.map(r => {uid: r->uid, type: r->type, n: r.names.size})
```

Real example (local demo):

```
mDashboard, specVersion:"2.0",
children:["902373cb-cf5b2869","5a8676bc-cf3b0c6b","57368700-cf5b1c2e", ...]

{uid:"2cd107da-cf3b1afe", mWidget, type:"group",
 children:["7f0fc863-cf3b22e7","4969ca6c-cf3b4305", ...]}
{uid:"2db17f-cf5b00f2", mWidget, type:"thermostat"}   // all slots default
```

- `children` on `mDashboard` = top-level order. On a group = its children.
- A widget uid listed nowhere is an orphan (not rendered). Clean up orphans
  only when asked.
- `specVersion` is `"<major>.<minor>"`. Keep it as found unless you use a
  feature that requires a newer one (see Step 7).

---

## Step 2: Pick widget types and slots

`type` values and their slots (name, field type). Every slot is optional.

| type | slots |
|---|---|
| `labelWithTextValues` | `label` str, `curValue` num, `minVal` num, `maxVal` num, `minColor` / `maxColor` / `curColor` / `backgroundColor` color |
| `gauge` | `label` str, `curValue` num, `minVal`, `maxVal`, `baselineValue`, `limitValue` num, `ranges` ranges, styling nums/colors (`tickCount`, `rangeWidth`, `arrowColor`, ...) |
| `historyChart` | `data` histories |
| `stackedHistory` | `data` history, `ranges` ranges |
| `thermostat` | `header` str, `curValue` num, `setPoint` num, `minVal`/`maxVal`, `warningThreshold`/`issueThreshold`, `scheduleRef` str, `heatSetPoint` / `coolSetPoint` / `fanSetPoint` / `autoSetPoint` / `occupiedSetPoint` bool, `*SetLevel` num, `*SetDuration` num, `tempSetLevel`, `tempSetDuration` |
| `group` | `title` str, `children` widgets, `opened` bool |

Rules:
- Use exactly these `type` strings; an unknown type makes released apps fail
  to load the dashboard.
- Colors are native strings `"0xff4caf50"` (ARGB hex). Numbers are Number.

---

## Step 3: Bind slots

Each slot tag holds either a **native value** (Str, Number, Bool, color
string) or an **Axon expression**. Expressions are stored as an XStr of type
`String` with `"` escaped as `\"`:

```axon
xstr("String", "read(point and zone and air and temp and sensor)[\"curVal\"].repeat(1sec)")
```

### 3a. Point by id (preferred for generated dashboards)

Pick the point, bind the tag:

```axon
readById(@p:demo:r:3142c7a6-ff989076)->curVal        // value slots
readById(@p:demo:r:3142c7a6-ff989076)                // thermostat point slots (needs the record for writes)
readById(@p:demo:r:3142c7a6-ff989076).hisRead(today) // history slots
```

- Always a project-qualified id (`@p:<proj>:r:...`), so it resolves in a
  cluster.
- Append `.repeat(1sec)` to value and point slots that must stay live. The
  app resolves the point once and then reads it from **one shared Haystack
  watch** per connection (`PointWatch`), so `repeat` sets how often the
  widget reads the cache, not a server eval per second.
- Released apps evaluate these expressions as-is: point-by-id needs no new
  app or spec version.

### 3b. Tag query (existing dashboards)

```axon
read(point and zone and air and temp and sp).repeat(1sec)
read(point and zone and air and temp and sensor)["curVal"].repeat(1sec)
```

Fine for single-equip sites; ambiguous with many equips. When generating for
several equips, resolve the id first and use 3a.

### 3c. Optional points

Thermostat `autoSetPoint` / `occupiedSetPoint` often have no point. Leave
the slot out, or bind a query that may not match: the app treats
`UnknownRecErr` as "not available" and logs it once.

---

## Step 4: Resolve equips and their points

```axon
// equips by kind, all projects in reach (cluster)
xq().xqProjs(navProjNames()).xqReadAll(equip and vav).xqExecute

// every point of one equip, in one read
readAll(point and equipRef==@p:demo:r:<equip>)
  .map(p => {id: p->id, navName: p["navName"], kind: p["kind"], unit: p["unit"],
             tags: p.names.findAll(n => p[n] == marker())})
```

Match slots to points by marker tags (Haystack roles), for example:

| Slot role | VAV query | RTU query |
|---|---|---|
| zone temp | `zone and air and temp and sensor` | `zone and air and temp and sensor` |
| zone setpoint | `zone and air and temp and sp` | `zone and air and temp and sp` |
| damper | `damper and cmd` | `outside and damper and cmd` |
| airflow | `discharge and air and flow and sensor` | - |
| supply / discharge temp | `discharge and air and temp and sensor` | `discharge and air and temp and sensor` |
| fan | - | `fan and run and cmd` |
| cool / heat stage | - | `cool and cmd` / `heat and cmd` |

A query that matches 0 points = slot missing (skip or mark "not available").
Matching 2+ = ambiguous: prefer the one with `cur`, else report it.

---

## Step 5: Create the records

Generate uids like the app (`<hex>-<hex>`); any unique string works.
Snippets in this workflow were checked on local SkySpark 3.1.12 (`demo`).

```axon
do
  uid: () => random(0..0x7fffffff).toHex + "-" + random(0..0x7fffffff).toHex

  zoneTemp: read(point and equipRef==@p:demo:r:<vav> and zone and air and temp and sensor)
  tempUid: uid()
  groupUid: uid()

  temp: {mWidget, uid: tempUid, type: "labelWithTextValues",
         label: "Zone temp",
         curValue: xstr("String", "readById(@" + zoneTemp->id.toStr + ")->curVal.repeat(1sec)")}
  group: {mWidget, uid: groupUid, type: "group", title: "VAV-1", opened: true,
          children: [tempUid]}

  commit(diff(null, temp, {add}))
  commit(diff(null, group, {add}))

  db: read(mDashboard)
  commit(diff(db, {children: db->children.add(groupUid)}))
end
```

- Create children before the group, and the group before adding it to
  `mDashboard->children`.
- No `mDashboard` yet: `commit(diff(null, {mDashboard, specVersion:"2.0",
  children:[...]}, {add}))`.
- Edit a widget with `commit(diff(rec, {slot: newVal}))`; remove a slot with
  `{slot: removeMarker()}`; delete a widget by removing its record **and**
  its uid from every `children` list.

---

## Step 6: Verify

```axon
// every child uid resolves to a widget
do
  all: readAll(mWidget).toRecList.map(r => r->uid)
  lists: [read(mDashboard)->children].addAll(readAll(mWidget and type=="group").toRecList
           .map(g => if (g.has("children")) g->children else []))
  lists.flatten.findAll(u => not all.contains(u))       // must be empty
end

// every bound id exists (expression slots)
readAll(mWidget).toRecList.map(r => r.names.findAll(n => r[n].toStr.contains("readById(")))
```

Then open the web builder (`/ui/<proj>` > Mobilytik Builder) and a phone:
- values show and change (network: `watchSub` once, `watchPoll` every
  second; few or no `eval` calls);
- no "Update Mobilytik" banner unless you meant to use Step 7 features.

---

## Step 7: Group templates and tag-based equip binding (planned)

Planned in the mobilytik repo (`docs/tasks/2026-09-23-barcode-and-arcnotes.md`
section 6, pod API level 5, dashboard spec minor bump). **Do not generate
these records until the app supports them**; released apps would not render
them.

- **`mGroupTemplate`** folio record (cluster aware):

```
mGroupTemplate, dis:"VAV", mTemplateId:"vav", mEquipFilter:"equip and vav",
mTemplateSlots:[
  {name:"Zone temp", mWidgetType:"gauge", query:"zone and air and temp and sensor", tag:"curVal"},
  {name:"Zone sp",   mWidgetType:"labelWithTextValues", query:"zone and air and temp and sp", tag:"curVal", writable},
  {name:"Occupied",  mWidgetType:"labelWithTextValues", query:"occupied", tag:"curVal", optional}
]
```

- A group bound to an equip carries `mEquipRef:@...` (one equip) or
  `mEquipFilter:"vav and siteRef==@s"` (candidates the user adds; never
  added automatically), plus `mTemplateSnapshot` (copy of the template it
  was built from).
- Slots keep a plain Axon expression that released apps can evaluate (the
  resolved point, e.g. `readById(@...)->curVal.repeat(1sec)`). The binding
  itself goes in one `mBind` dict on the widget record, keyed by slot name:
  `mBind:{curValue:{kind:"tags", query:"zone and air and temp and sensor", tag:"curVal"}}`
  (or `{kind:"point", ref:@..., tag:"curVal"}`). Never put a dict in a slot
  tag: released apps fail to load the whole dashboard on it. New apps
  re-resolve tag bindings with one `readAll(point and equipRef==@e)` per equip.

Until then, generate the same result with Steps 4–5: one `group` per equip,
children bound by point id.

---

## Checklist

- [ ] Read `mDashboard` / `mWidget` first; never duplicate a dashboard.
- [ ] Only the `type` strings and slot names from Step 2.
- [ ] Expressions as `xstr("String", ...)`, quotes escaped.
- [ ] Point-by-id with project-qualified ids for generated dashboards.
- [ ] `.repeat(1sec)` on live slots.
- [ ] Children before groups; groups before `mDashboard->children`.
- [ ] Verify uids and ids (Step 6); test on local 3.1.12 before production.
