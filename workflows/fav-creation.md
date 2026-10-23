---
title: SkySpark Favorites (fav + viewLink)
description: How SkySpark favorites work — the fav record, viewLink view/state, hisChart state keys, nav refs and their base64 payload — with read-only Axon recipes to list, decode, audit and encode favorites, plus create/copy code that needs approval
category: ui
tags: [fav, favorites, viewLink, hisChart, hisTable, shell, kpiSwivel, sparkSwivel, nav, navRef, navResolve, base64, ioToBase64, ioFromBase64, span, rollup, presentation]
version: 1.0
---

# SkySpark Favorites Workflow

## Overview

A **favorite** is a saved view. It stores which view to open and the view state (points, time span, chart setup). It is one folio record with the `fav` marker and a `viewLink` Dict.

```
id:       @p:<project>:r:<uuid>  "Site X Energy Report"
dis:      "Site X Energy Report"
fav:      Marker
group:    "Energy Reports"
viewLink: {
  view:  "hisChart",
  state: {
    span: thisWeek,
    opts: {limit:10000, timeout:10s, rollup:{fold:auto, interval:5min}},
    presentation: <Grid>,
    points: [nav:point.point.<base64>, nav:weatherPoint.point.<base64>, ...]
  }
}
mod:      <DateTime>
```

The UI opens a favorite at `https://<host>/ui/<project>#<hash>`. The hash is UI-internal. Do not build it by hand.

## When to Use This Workflow

Run it when the user says things like:

- "list the favorites" / "what saved reports do we have"
- "which points are in this favorite"
- "is any favorite broken" / "a favorite shows empty lines"
- "which favorites use this equip / point"
- "make a favorite for these points"
- "copy favorites to another project"

## Prerequisites

1. Pick the project. Pass `project: "<instance>/<project>"` on every `executeAxonCode` call, or set it with `switchSkySparkProject` and check with `getPrimaryProject`.
2. The base64 funcs `ioToBase64` / `ioFromBase64` are in `lib:io` and need **admin** (or su). Without admin, use `navRef()` / `navResolve()` only.
3. Everything in Steps 1–6 is **read-only**. Step 7 writes data. Run Step 7 only after the user says yes.

## Step 1 — Where Favorites Live

| Item | Fact |
| --- | --- |
| Record | Any folio rec with the `fav` marker (def `fav` in `lib:skyarc`: "Favorite saved view link") |
| Query | `readAll(fav)` |
| Browse/manage UI | App `favs` ("Favorites", star icon), view `favs` in `lib:ui` |
| Menu | The view's Fav menu (star). Saves the current view, lists favorites by `group` |
| Grouping | `group` Str. No `group` → favorite shows with no group heading |
| Order | Sorted by `dis` inside a group as seen in the UI. `TODO: verify` if any order tag applies |
| Default view | `setAsDefault` marker makes the favorite the default for its view. Since 3.1.x, "Set as Default" needs **su** (change log) |
| Who sees it | Favorites are project records, not user records. Any user who can read the project sees them. `TODO: verify` per-user favorites |

## Step 2 — Tag Reference

| Tag | Kind | Required | Meaning |
| --- | --- | --- | --- |
| `id` | Ref | yes | Record id, `@p:<project>:r:<uuid>` |
| `dis` | Str | yes | Name in the Fav menu |
| `fav` | Marker | yes | Marks the rec as a favorite |
| `viewLink` | Dict | yes | `{view: Str, state: Dict}` — the saved view (def tagOn `arc`, `fav`) |
| `group` | Str | no | Menu group heading |
| `setAsDefault` | Marker | no | Use as the view's default state |
| `mod` | DateTime | auto | Last change time |

`viewLink` is also used on `arc` recs and on Fresco cards (Step 8).

## Step 3 — `viewLink` and View Names

`viewLink->view` is the view name (a Str). `viewLink->state` holds the view's inputs.

| `view` | Lib | Shows | State keys seen |
| --- | --- | --- | --- |
| `hisChart` | `lib:his` | History chart | `points`, `span`, `opts`, `presentation` |
| `hisTable` | `lib:his` | History table | `points`, `span`, `opts` |
| `shell` | `lib:ui` | Axon shell with a saved expr | `expr` (Str), `tab` (`"table"`) |
| `kpiSwivel` | `lib:rule` | KPI pivot table | `targets`, `opts` |
| `sparkSwivel` | `lib:rule` | Spark pivot table | `targets`, `span` |
| `arcSummary` | `lib:skyarc` | Arc summary | `filter` |

Not every key is always there. `points` only, `points + span`, `opts + points` all occur. A missing `span` means the view uses its own default span.

## Step 4 — hisChart / hisTable State Keys

### 4.1 `points` — List of nav Refs

A **list of Ref values** (not Str) with the `nav:` scheme. See Step 5.

### 4.2 `span` — a Span value

The value is a real `Span`, not a Str. `isSpan(state->span)` is true. It prints as its mode or its dates.

| Value | Meaning |
| --- | --- |
| `today` | Today |
| `yesterday` | Yesterday |
| `thisWeek` | This week |
| `lastWeek` | Last week |
| `thisMonth` | This month |
| `lastMonth` | Last month |
| `thisYear` / `lastYear` | Year |
| `2026-01-01,2026-01-08` | Fixed dates (end is exclusive) |

Build one with `toSpan`: `toSpan("thisWeek")`, `toSpan(2026-01-01..2026-01-07)`, `toSpan(pastWeek())`. `toSpan("thisWeek") == state->span` is true for a relative span.

Note: when the user saves "default" or "current" span, the UI turns it into fixed dates (change log: "save fav to convert default/current span to absolute").

### 4.3 `opts` — Read Options

```
{limit:10000, timeout:10s, rollup:{fold:auto, interval:5min}}
```

| Key | Meaning |
| --- | --- |
| `limit` | Max rows read per point |
| `timeout` | Max time for the read |
| `rollup.fold` | `auto`, `avg`, `min`, `max`, `sum`, `count`, `first`, `last` |
| `rollup.interval` | Bucket size as a **Str**: `"5min"`, `"15min"`, `"1hr"`, `"1day"` … |

`limit` and `timeout` are Numbers. `rollup.fold` and `rollup.interval` are Strs.

`fold:auto` picks the fold from the point kind (Bool → duration, Number → avg / sum for totals).

### 4.4 `presentation` — a Grid

`presentation` is a **Grid** (`isGrid` is true). In zinc/trio dumps it shows as `haystack::GbGrid@<hash>`. The `@<hash>` is only the Java object id. It is not data. Read the grid itself.

One row per chart series:

| Col | Meaning | Values seen |
| --- | --- | --- |
| `x` | X axis col | `ts` |
| `y` | Point **plain Ref** (`@p:<project>:r:<uuid>`), not a nav ref | Ref |
| `chartType` | Series type | `line`, `bar`, `stackedBar`, `runtime`, `icon` (weather icons), `sunrise` |
| `chartGroup` | Pane id; same id = same pane | `g0`, `g1` … |
| `dis` | Series label | Str |
| `color` | CSS color | `#3498db` |
| `yAxisPosition` | Axis side | `left`, null |
| `strokeWidth` | Line width | Number |
| `xAxisVisible` | Show x axis | Bool |
| `title` | Pane title | Str |
| `opacity` | Series opacity | Number |
| `chartAreaMode` | Fill to series | `prevSeries`, `nextSeries`, null |

`presentation.y` does not always match `points`. A grid can keep rows for points removed later, or miss rows for points added later. Recipe 6.5 finds these.

### 4.5 kpiSwivel / sparkSwivel State

```
{targets: [nav:equip.all],
 opts: {vizByUnit,
        cells:{fold:auto, select:kpi, viz:gaugeCell, dis:"KPI"},
        rows:{select:targetRef.site, dis:"Site"},
        cols:{select:ruleRef.dis, dis:"Rule"}}}
```

`targets` is a list of nav refs. `nav:equip.all` means "all equips" (root of the equip tree). Build it with `navRef("equip", "all")`.

## Step 5 — nav Ref Format

```
nav:<target>.<level>.<base64uri("id:@p:<project>:r:<uuid>")>
```

| Part | Meaning |
| --- | --- |
| `nav:` | Scheme for navigation refs |
| `<target>` | The nav tree the view input uses: `point`, `weatherPoint`, `equip`, `site` |
| `<level>` | Tree level of the picked node: `point`, `equip`, `site`, `weatherPoint` |
| payload | Base64 (RFC 4648 URI-safe, **no padding**) of the text `id:@<ref>` |
| `all` | Instead of a payload: the tree root, e.g. `nav:equip.all` |

Prefixes seen:

| Prefix | Means |
| --- | --- |
| `nav:point.point.<b64>` | One point picked in the point tree |
| `nav:weatherPoint.point.<b64>` | One weather point, picked from the weather tree but stored as level `point` |
| `nav:point.equip.<b64>` | All points of an equip (from `navRef("point", equip)`) |
| `nav:equip.site.<b64>` | All equips of a site (from `navRef("equip", site)`) |
| `nav:equip.all` | All equips |

Decode example (made-up id):

```
aWQ6QHA6ZGVtbzpyOjEyMzQ1Njc4LTlhYmNkZWYw
  → "id:@p:demo:r:12345678-9abcdef0"
```

**Official rule:** the SkySpark Nav doc says the nav ref format is opaque and may change. Use `navRef()` to build and `navResolve()` to read when you can. The base64 method is a tested work-around for cases the official funcs do not cover (weather points, finding which favorite uses a rec, other projects).

### 5.1 Official funcs (no admin needed)

| Func | Use |
| --- | --- |
| `navRef(target, rec)` | Build: `navRef("point", pt)`, `navRef("point", equip)`, `navRef("equip", site)`, `navRef("equip", "all")` |
| `navResolve(refs, opts)` | Read: list of nav refs → list of recs. Opts: `{navCluster}`, `{nestExpand}` |

Tested facts:

- `navRef("point", pt).toStr` equals the base64-built string for normal points.
- `navResolve` drops `nav:weatherPoint.point.*` refs (returns 0 recs for them).
- `navRef("weatherPoint", wp)` gives `nav:weatherPoint.weatherPoint.<b64>`, which is **not** the `nav:weatherPoint.point.<b64>` the UI saves. `navRef("point", wp)` gives `nav:point.point.<b64>`. Neither matches. For weather points, build the string yourself (Recipe 6.6).

### 5.2 Base64 funcs (admin)

| Func | Use |
| --- | --- |
| `ioFromBase64(s).ioReadStr` | Decode. Takes URI-safe or standard, with or without `=` padding |
| `ioToBase64(str, {uri})` | Encode URI-safe, no padding. **Use this for nav refs** |
| `ioToBase64(str)` | Standard RFC 2045 with `+ /` and `=` padding. Wrong for nav refs |
| `parseRef(str, false)` | Str → Ref |
| `refProjName(ref, false)` | Project name inside a `p:<proj>:r:` ref |

There is no `toBase64`, `fromBase64`, `base64Encode` or `strToBase64` in Axon. Use the `io` funcs.

## Step 6 — Read-only Recipes

All recipes were run on a live project. Run each as one `do … end` block, or commit them as funcs.

### 6.1 Helper lambdas

```axon
navToRef: (n) => parseRef(ioFromBase64(n.toStr.split(".").last).ioReadStr.replace("id:@", ""), false)
refToNav: (ref, prefix) => prefix + ioToBase64("id:@" + ref.toStr, {uri})
```

- Strip `id:@` before `parseRef(…, false)`. `parseRef("@p:x:r:y", false)` returns **null**. `parseRef("p:x:r:y", false)` works.
- `ref.toStr` has no `@`. Add `@` back when you encode.
- `.split(".").last` takes the payload. Base64 URI chars have no `.`.

### 6.2 List all favorites

```axon
readAll(fav).sort("dis").map(r => {
  dis: r->dis,
  group: r["group"],
  view: r->viewLink->view,
  keys: r->viewLink->state.names.sort.concat(","),
  nPts: if (r->viewLink->state.has("points")) r->viewLink->state->points.size else null,
  setAsDefault: r["setAsDefault"],
  mod: r->mod.date
})
```

Summary of a project:

```axon
do
  favs: readAll(fav).toRecList
  {n: favs.size,
   views: favs.map(r => r->viewLink->view).unique,
   groups: favs.map(r => r["group"]).unique,
   tags: favs.map(r => r.names).flatten.unique.sort.concat(","),
   stateKeys: favs.map(r => r->viewLink->state.names.sort.concat(",")).unique}
end
```

Note: `readAll(fav).map(r => r->x)` returns a Grid and fails if the lambda returns a Str. Use `.toRecList` first when you map to plain values.

### 6.3 Decode one favorite's points

```axon
do
  navToRef: (n) => parseRef(ioFromBase64(n.toStr.split(".").last).ioReadStr.replace("id:@", ""), false)
  f: readById(@p:<project>:r:<uuid>)
  f->viewLink->state->points.map(n => do
    ref: navToRef(n)
    rec: if (ref == null) null else readById(ref, false)
    {nav: n.toStr, ref: ref, ok: rec != null,
     dis: if (rec == null) null else dis(rec),
     unit: if (rec == null) null else rec["unit"],
     equipRef: if (rec == null) null else rec["equipRef"]}
  end).toGrid
end
```

Official way (normal points only, no weather): `navResolve(f->viewLink->state->points, {})`.

### 6.4 Find broken favorites

A nav ref is broken when it does not decode or its rec no longer exists.

```axon
do
  navToRef: (n) => parseRef(ioFromBase64(n.toStr.split(".").last).ioReadStr.replace("id:@", ""), false)
  readAll(fav).toRecList
    .findAll(f => f->viewLink->state.has("points"))
    .map(f => f->viewLink->state->points
      .findAll(n => do r: navToRef(n); r == null or readById(r, false) == null end)
      .map(n => {fav: f->id, favDis: f->dis, nav: n.toStr}))
    .flatten.toGrid
end
```

Also check that the project in each ref is this project: `refProjName(navToRef(n), false) == projName()`.

### 6.5 Find presentation grids out of sync with points

```axon
do
  navToRef: (n) => parseRef(ioFromBase64(n.toStr.split(".").last).ioReadStr.replace("id:@", ""), false)
  readAll(fav).toRecList.findAll(f => f->viewLink->state.has("presentation")).map(f => do
    pts: f->viewLink->state->points.map(n => navToRef(n))
    ys: f->viewLink->state->presentation.colToList("y")
    {dis: f->dis,
     extraInPres: ys.findAll(y => not pts.contains(y)).size,
     missingInPres: pts.findAll(p => not ys.contains(p)).size}
  end).findAll(c => c->extraInPres > 0 or c->missingInPres > 0)
end
```

Extra rows are normally harmless. The chart draws `points`. Re-save the favorite in the UI to clean it.

### 6.6 Build the nav string for a rec (encode)

```axon
do
  refToNav: (ref, prefix) => prefix + ioToBase64("id:@" + ref.toStr, {uri})
  p: read(point and his)
  {viaNavRef: navRef("point", p),
   viaBase64: refToNav(p->id, "nav:point.point."),
   weather:   refToNav(read(weatherPoint)->id, "nav:weatherPoint.point.")}
end
```

`navRef("point", p).toStr == refToNav(p->id, "nav:point.point.")` is true.

The favorite stores **Ref** values. Turn the Str into a Ref before you save: `parseRef(navStr)`. `navRef()` already returns a Ref.

### 6.7 Find favorites that use a point or equip

By point:

```axon
do
  b: ioToBase64("id:@" + @p:<project>:r:<uuid>.toStr, {uri})
  readAll(fav).toRecList
    .findAll(f => f->viewLink->state.has("points") and
                  f->viewLink->state->points.any(n => n.toStr.split(".").last == b))
    .map(f => {id: f->id, dis: f->dis}).toGrid
end
```

By equip (any point of the equip):

```axon
do
  navToRef: (n) => parseRef(ioFromBase64(n.toStr.split(".").last).ioReadStr.replace("id:@", ""), false)
  eq: @p:<project>:r:<uuid>
  readAll(fav).toRecList.findAll(f => f->viewLink->state.has("points") and
    f->viewLink->state->points.any(n => do
      r: navToRef(n)
      rec: if (r == null) null else readById(r, false)
      rec != null and rec["equipRef"] == eq
    end)).map(f => {id: f->id, dis: f->dis}).toGrid
end
```

## Step 7 — Create / Copy / Update (WRITES DATA — needs user approval)

> **Do not run any code in this step without a clear "yes" from the user.** Show the code and the target project first. Check the project with `getPrimaryProject`. See `axon-func-update.md` for safe commit habits.

Dict literals: in `evalAll`, a Dict literal after the first statement can be read as a Xeto spec. Build the Dict inside a committed func, or start the block with the Dict-building code and test with a read-only dry run (return the Dict, do not commit) first.

### 7.1 Create a hisChart favorite

```axon
// WRITES DATA — needs user approval
(pointRefs, name, groupName) => do
  vl: {
    view: "hisChart",
    state: {
      points: pointRefs.map(r => navRef("point", r)),
      span: toSpan("thisWeek"),
      opts: {limit: 10000, timeout: 10sec, rollup: {fold: "auto", interval: "1hr"}}
    }
  }
  rec: {dis: name, fav: marker(), group: groupName, viewLink: vl}
  // dry run: return rec
  commit(diff(null, rec, {add}))
end
```

Notes:

- No `presentation` needed. The UI builds a default chart. Save again in the UI to keep colors/panes.
- For weather points use `parseRef(refToNav(wp->id, "nav:weatherPoint.point."))`.
- In `rollup`, `fold` and `interval` are **Str** values (`"auto"`, `"1hr"`). `timeout` is a Number with a unit (`10sec`). This is what the UI saves.

### 7.2 Update a favorite (rename, regroup, change span)

```axon
// WRITES DATA — needs user approval
do
  f: readById(@p:<project>:r:<uuid>)
  newState: f->viewLink->state.set("span", toSpan("lastWeek"))
  commit(diff(f, {dis: "Site X Energy Report", group: "Energy Reports",
                  viewLink: f->viewLink.set("state", newState)}))
end
```

Always diff against the fresh rec (`readById`). The `mod` check stops writes over newer changes.

### 7.3 Copy a favorite inside the project

```axon
// WRITES DATA — needs user approval
do
  f: readById(@p:<project>:r:<uuid>)
  commit(diff(null, {dis: f->dis + " (copy)", fav: marker(), group: f["group"],
                     viewLink: f->viewLink}, {add}))
end
```

### 7.4 Copy favorites to another project

The project name sits inside every ref, and so inside every base64 payload. Copy is not a plain clone.

1. In the **source** project, export each favorite: `dis`, `group`, `view`, `state`, and for each point a key that also exists in the target (`navName`, `dis`, or a custom id tag), not the id.
2. In the **target** project, find each point by that key. Get its new id.
3. Re-encode: `navRef("point", newRec)` or `refToNav(newId, "nav:weatherPoint.point.")`.
4. Rewrite `presentation.y` with the new plain Refs (or drop `presentation`).
5. Fixed spans stay as they are. Relative spans (`thisWeek`) are fine.
6. Commit in the target (approval needed). Then run Recipe 6.4 in the target.

If the two projects share ids (cloned project), check `refProjName` — the ref still holds the old project name. Rebuild it with the target project name.

## Step 8 — Other Places `viewLink` Appears

Fresco cards and arcs use the same Dict shape to jump to a view:

```axon
viewLink: {view: "sparkSwivel", state: {span: span.toSpan, targets: [navRef("equip", site)]}}
viewLink: {view: "arcSummary", state: {filter: arcFilter}}
```

A favorite is the saved form of the same link.

## Gotchas

| # | Gotcha | Fix |
| --- | --- | --- |
| 1 | `points` items are **Ref**, not Str | Call `.toStr` before `split`; save as Ref (`parseRef` / `navRef`) |
| 2 | `parseRef("@p:…", false)` returns null | Strip `id:@`, not only `id:` |
| 3 | `ioToBase64(str)` adds `=` and uses `+ /` | Use `ioToBase64(str, {uri})` for nav refs |
| 4 | Decode is lenient | `ioFromBase64` reads both alphabets and padded/unpadded input |
| 5 | Project name is in the payload | Re-encode when you copy across projects |
| 6 | Weather points use `nav:weatherPoint.point.` | `navRef` cannot build it; `navResolve` skips it. Use base64 |
| 7 | `presentation` prints as `haystack::GbGrid@<hash>` | It is a Grid; the hash is not data |
| 8 | `presentation.y` is a plain Ref; `points` are nav refs | Compare after decode |
| 9 | `presentation` can drift from `points` | Recipe 6.5; re-save in UI |
| 10 | `span` is a Span, not a Str | Use `toSpan(...)` to build; `isSpan` to test |
| 11 | ioToBase64 / ioFromBase64 need admin | Use `navRef` / `navResolve` as non-admin |
| 12 | nav format is documented as opaque | Prefer official funcs; re-test the base64 trick after upgrades |
| 13 | Dict literal after 1st statement in `evalAll` can parse as a Xeto spec | Build Dicts in a committed func, or test with a dry run |
| 14 | `readAll(fav).map(r => "str")` fails (Grid.map wants Dict) | Use `.toRecList.map(...)` |
| 15 | No `?.`, no `typeof`, no `toJson` in Axon | Use `if (x == null) …`, `isStr`/`isRef`/`isGrid`, `toStr` |
| 16 | `dis(ref)` fails on a Ref | `dis(readById(ref))` or `refDis` (gives the Ref text for nav refs) |

## Troubleshooting

| Symptom | Likely cause | Check / fix |
| --- | --- | --- |
| Favorite opens with empty lines | Point removed or id changed | Recipe 6.4 |
| Favorite opens empty after copy | Refs still point to the old project | Recipe 6.4 + `refProjName`; redo Step 7.4 |
| `UnknownNameErr` in a recipe | Key missing in a Dict (e.g. `state->span`) | Use `state["span"]` or `state.has("span")` |
| `Unknown func ioToBase64` / permission error | Not admin | Use `navRef` / `navResolve` |
| `navResolve` returns fewer recs than `points` | Weather points skipped | Decode with base64 |
| Encoded string differs from saved one | Used standard base64, or forgot `@` | `ioToBase64("id:@" + ref.toStr, {uri})` |
| New favorite not in the menu | Missing `fav` marker or bad `viewLink` | `readAll(fav and dis=="…")` |
| "Set as Default" missing in UI | User is not su | Ask an su user |
| Chart colors lost on a created favorite | No `presentation` grid | Open, style, re-save in UI |

## Related Workflows

- `app-creation.md` — views and `viewLink`-style navigation in apps
- `axon-func-update.md` — safe commits of funcs and records
- `axon-lang-information.md` — Axon syntax quirks (`?.`, Dict literals)
- `curRule-computed-points.md` — computed points you may add to favorites
- `visualytik-mcp-authoring.md` — dashboards when a favorite is not enough
