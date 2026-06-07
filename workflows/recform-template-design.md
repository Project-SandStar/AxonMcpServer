---
title: Define Trio Templates for recForm Create/Edit
description: How to write defineXxxTemplate trio recs so the SkySpark Create/Edit form renders labels, descriptions, dropdowns, optional fields, and hidden tags correctly. Includes the help-vs-doc footgun.
category: ui-development
tags: [template, recForm, trio, form, dropdown, enum, dis, doc, optional]
version: 1.0
---

# Define Trio Templates for recForm Create/Edit

## Overview

A `defineXxxTemplate` trio rec is the schema that drives SkySpark's **Create** and **Edit** dialogs (`recForm` / `poppy_RecEdit` / the standard rec-form Action button). It tells the form:

- which tags to render as fields,
- what label to show next to each input,
- what description to display under each input,
- which fields are required vs optional,
- which fields should be dropdowns (and with what choices),
- which markers belong on the rec but should not be shown to the user.

Getting any of these wrong produces forms that look broken: missing labels, missing help text, required fields that can never be filled, dropdowns that won't accept null, hidden fields appearing in the UI, etc.

## When to Use This Workflow

Use this workflow when:

- You're building a new SkySpark **app** with custom rec types and Create/Edit dialogs.
- Your form fields show no help text even though you set `help:"..."`.
- Your dropdown won't allow an empty / null selection.
- Required fields are forcing values for action variants that don't use them (e.g. a `target` field that's only meaningful for one of three actionTypes).
- The form shows raw tag names like `stage1Start` instead of `Stage 1 Start`.

## Prerequisites

1. Active project context — templates are loaded with the lib on pod install / restart, NOT hot-reloaded from disk.
2. A view that references the template via `templateName:"defineXxxTemplate"` on a Create or Edit Action button.
3. The pod's `lib/templates/` directory in `resDirs` of the `BuildPod` script.

## Step 1: Template File Layout

A `.trio` file in `lib/templates/` typically holds multiple template recs separated by `---`. Each rec has:

```trio
dis:defineMyThingTemplate
poppy                              // namespace / lib marker
tags:                              // <-- this is the schema block
  id:        {kind:"Ref" hidden}
  dis:       {kind:"Str" dis:"Display Name" doc:"…"}
  someField: {kind:"Str" dis:"Some Field"   doc:"…"}
  ...
template:defineMyThingTemplate
---
```

The outer rec carries the template's own `dis` and a `template` self-reference. The `tags:` block is a Dict-of-Dicts; each entry describes one tag.

## Step 2: Per-Field Schema Tags (the important ones)

| Tag        | Purpose                                                                                                  | Notes                                                                                                              |
|------------|----------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `kind`     | Haystack value kind — `"Str"`, `"Number"`, `"Bool"`, `"Ref"`, `"Ref<filter>"`, `"Uri"`, `"Marker"`, etc. | Use a **single-word** `Ref<marker>` to scope a picker, e.g. `"Ref<writable>"`, `"Ref<point>"`. Multi-word constraints (`Ref<sensor and point>`) break — see Step 9; put the extra tags in `navAuxFilter` instead.                       |
| **`dis`**  | **Human-readable label** rendered to the left of the input.                                              | Without this the form shows the raw tag name (`stage1Start` instead of `Stage 1 Start`). **Always set this.**       |
| **`doc`**  | **Inline description** shown under / beside the input as helper text.                                    | recForm renders `doc`, **not `help`** — that's the #1 footgun, see Step 5.                                         |
| `defVal`   | Default value if user doesn't enter one.                                                                  | Combine with `optional` so a blank submit still uses the default.                                                  |
| `optional` | Marker — the field is not required to commit.                                                            | Without `optional`, the form refuses to submit when the field is empty.                                            |
| `hidden`   | Marker — the field is committed but never shown in the UI.                                                | Use for `id`, the marker that brands the rec type, and other system tags.                                          |
| `enum`     | Comma-separated list of allowed Str values — renders as a **dropdown**.                                  | See Step 3 for the empty-option trick.                                                                              |
| `multi`    | Marker — accept a list of values.                                                                         | Used for tag-lists like `dns: {kind:"Str" multi dis:"DNS"}`.                                                        |
| `validate` | Name of an axon function that returns null on success or throws on failure.                                | Used for non-trivial validation like password rules.                                                                |

## Step 3: Dropdowns via `enum`

Static dropdown of a fixed value set:

```trio
actionType: {kind:"Str" dis:"Action Type"
             enum:"pointWrite,email,sms,emailSkySpark"
             defVal:"pointWrite"
             doc:"Setpoint vs notification path."}
```

**To allow a blank / null option**, put a leading comma in the enum:

```trio
recipientRole: {kind:"Str" dis:"Recipient Role"
                enum:",op,custodian,nurse,admin,principal,facilities"
                optional
                doc:"Leave blank to broadcast."}
```

The leading comma renders an empty first option that the user can select to mean "none".

For a **dynamically-computed** dropdown that calls server-side axon, use `enumExpr` instead of `enum`:

```trio
siteName: {var input kind:"Str" enumExpr:"getSiteEnum()"}
```

Where `getSiteEnum() => readAll(site).toRecList.map(s => s.dis)` returns a List of Str.

## Step 4: Optional vs Required Fields for Multi-Variant Recs

When one template represents multiple subtypes (e.g. an Action that can be `pointWrite`, `email`, or `sms`), some fields only apply to certain subtypes. Mark the variant-specific fields `optional` so the form doesn't force values for them when irrelevant:

```trio
target:        {kind:"Ref<writable>" dis:"Target Point"  optional doc:"pointWrite only: writable point to drive."}
action:        {kind:"Str"           dis:"Write Value"   optional doc:"pointWrite only: value to write (number, X-relative, or bool literal)."}
priorityLevel: {kind:"Number"        dis:"Priority"      optional doc:"pointWrite only: 1-17."}
recipientRole: {kind:"Str"           dis:"Recipient Role" enum:",custodian,admin" optional doc:"email/sms only."}
```

Then the dispatch / arbitration code branches on whichever tag is present (`if (action.has("target"))` etc).

## Step 5: The `help` vs `doc` Footgun

There are two superficially-similar tags:

| Tag    | Purpose                                                                                          | Rendered in recForm?       |
|--------|--------------------------------------------------------------------------------------------------|----------------------------|
| `doc`  | Reference documentation for developers; **also what recForm shows** as inline field description. | **Yes — use this.**        |
| `help` | End-user help formatted as fandoc; used on def records, rule UIs, etc.                            | **No — silently ignored.** |

If you set `help:"…"` on a template field, the form will appear to have no description for that field even though you wrote one. **Always use `doc:`** for inline form descriptions.

Confirmation: `haxall/hxMqtt/lib/conn.trio`, `haxall/hxObix/lib/conn.trio`, `bassgeacconfig/lib/templates.trio` — every shipping pod uses `doc:` on template fields, never `help:`.

## Step 6: Hidden System Tags

Two kinds of fields should be `hidden`:

1. **`id`** — Folio assigns this automatically; the form should never accept user input.
2. **The "type marker"** that brands the rec (`poppyAction`, `poppyBinding`, `myThing`, etc) — the create handler sets it, the user shouldn't toggle it.

Example:

```trio
id:        {kind:"Ref"    hidden}
poppyAction: {kind:"Marker" hidden}
```

Without `hidden`, a phantom field appears in the form labeled "id" (Ref picker) or "poppyAction" (checkbox), and confused users tick / untick it.

## Step 7: Reload Behavior — Templates Don't Hot-Reload

When you edit `lib/templates/*.trio` and rebuild the pod, the new template **does not take effect until SkySpark restarts**. Templates are loaded at lib install / startup into the def graph. There is **no folio-shadow trick** for templates (unlike funcs, which folio shadows on resolve — see workflow `axon-func-update`).

Always rebuild → restart → reopen the form to test template changes.

## Full Reference Example

```trio
dis:defineActionTemplate
poppy
tags:
  id:        {kind:"Ref" hidden}
  dis:       {kind:"Str" dis:"Display Name"
              doc:"Shown in tables and logs (e.g. 'OA Damper 30%')."}
  actionType: {kind:"Str" dis:"Action Type"
               enum:",pointWrite,email,sms,emailSkySpark"
               defVal:"pointWrite" optional
               doc:"Setpoint vs notification path."}
  target:    {kind:"Ref<writable>" dis:"Target Point" optional
              doc:"pointWrite only: the writable point this action drives."}
  action:    {kind:"Str" dis:"Write Value" optional
              doc:"pointWrite only: absolute number, X-relative expression, or bool literal (1/true/on, 0/false/off)."}
  priorityLevel: {kind:"Number" dis:"Priority Level" optional
                  doc:"pointWrite only: SkySpark priority 1-17 (lower = higher priority)."}
  recipientRole: {kind:"Str" dis:"Recipient Role"
                  enum:",op,custodian,nurse,admin,principal,facilities"
                  optional
                  doc:"email/sms/emailSkySpark only: who to notify."}
  disabled:  {kind:"Marker" dis:"Disabled" optional
              doc:"When checked this action is skipped."}
  poppyAction: {kind:"Marker" hidden}
template:defineActionTemplate
```

## Step 8: Wire the Edit/Create Buttons — Use Built-In `recEdit`, Not a Custom Wrapper

The view button that opens the form for editing should route through the framework's **built-in `recEdit`**, not a hand-rolled function:

```trio
// ✅ correct — framework handles form save end-to-end
editAction: {dis:"Edit Action" action:"recEdit" select templateName:"defineActionTemplate"}

// ❌ wrong — custom func re-implements commit, drops template-aware filtering
editAction: {dis:"Edit Action" action:"poppy_RecEdit" select templateName:"defineActionTemplate"}
```

### Why the built-in matters

When a view action runs with `select`, the framework passes a **Row from the displayed grid**, not the raw folio rec. The Row carries the original tags **plus every synthetic column** the view added — display strings (`targetDis`), arbitration flags (`active`), derived numbers (`reading`, `alertStage`), etc.

The built-in `recEdit(row)`:

1. Re-reads the rec by id (so it ignores whatever stale shape the Row had).
2. Filters the form's submitted dict against the named template — only tags the template declares survive.
3. Coerces each field's value to the template's `kind:` (Ref stays Ref, Number stays Number, etc).
4. Commits the diff against the freshly-read rec.

A custom wrapper that just does `diff(existing, dict).commit` skips steps 2 and 3 — and the synthetic columns from step 1 get persisted as folio tags. The rec then has phantom fields (`targetDis:"OA Damper Cmd %"`, `active:true`, …). On the next refresh, the view framework's row-cache compares the new shape against the cached one, the bracket accessor walks into a half-coerced value, and you get a server-side `sys::ArgErr: argument type mismatch` whose stack trace lands at `axon::Eq.eq → axon::CoreLib.get → FanObj.trap → reflection`:

```
sys::ArgErr: java.lang.IllegalArgumentException: argument type mismatch
  java.lang.reflect.Method.invoke
  fan.sys.FanObj.doTrap
  fan.sys.FanObj.trap
  axon::CoreLib.get (CoreLib.fan:65)
  …
  axon::Eq.eq (Operators.fan:367)
  21 More…
```

The `21 More…` truncation hides the user-frame, which is why this looks unsolvable from the trace alone. **The reproducer is "save the form once, then try to save again" — the second save re-reads a polluted rec.**

### When you genuinely need custom save logic

If you must run something on save (logging, side-effect, rules), the safe pattern is:

```axon
// Wrapper that calls the built-in then layers your logic
(input) => do
  result: recEdit(input)              // framework does the heavy lifting
  logInfo("myProj", "edited " + input.dis())
  return result
end
```

…and accept that the rec is committed by `recEdit` before your code runs. If you can't accept that, replicate the built-in's filtering:

```axon
(input) => do
  if (input["id"] == null) throw "missing id"
  existing: readById(input->id)
  // Only keep keys that exist on the rec OR are in the template — never
  // commit columns the view synthesised (targetDis, active, reading, …).
  templateTags: read(template == "defineActionTemplate")->tags
  allowed: templateTags.colNames    // or however your template surfaces its field list
  changes: input.findAll((v, n) =>
    n != "id" and n != "mod" and allowed.contains(n))
  diff(existing, changes, null).commit
end
```

But: **prefer the built-in.** Every custom wrapper that "just adds a log line" eventually grows into this bug.

## Step 9: Don't Use Multi-Word `Ref<filter>` Kinds

The picker that materialises behind a `kind:"Ref<...>"` field uses the filter expression to seed a **nav tree** — and the nav tree builder turns the filter into a `Ref` id like `nav:<filter>.all`. Ref ids can't contain spaces.

```trio
sensorRef: {kind:"Ref<sensor and point>" …}    // ❌ "nav:sensor and point.all" → ParseErr
sensorRef: {kind:"Ref<writable>" …}            // ✅ "nav:writable.all" is a legal Ref id
sensorRef: {kind:"Ref" …}                       // ⚠ unscoped — NOT a reliable "all recs" picker; see Observed note
```

The failure happens client-side in `PimNavNode.makeHead` → `Ref.fromStr`:

```
sys::ParseErr: Invalid Ref id (invalid char ' '): nav:sensor and point.all
  fan.haystack.Ref.fromStr
  fan.pim.PimNavNode.makeHead
  fan.pim.PimNavTree.make
```

It can also surface server-side as the same Eq.eq trap-mismatch chain from Step 8 — the picker round-trips through axon and the malformed handle eventually lands as an operand of a `==` over a non-Dict.

### Rules

- **Single-word marker filter is fine:** `Ref<writable>`, `Ref<site>`, `Ref<equip>`, `Ref<point>` — all work.
- **Single-word custom-marker filter is fine:** `Ref<poppyReset>`, `Ref<myCustomMarker>` — also work.
- **Multi-word filters break:** `Ref<sensor and point>`, `Ref<his and writable>`, `Ref<equip and not virtual>` — all produce the parse error.
- **Workaround for multi-word constraints:** drop the constraint from the template and filter in the action func:
  ```trio
  sensorRef: {kind:"Ref" dis:"Sensor" doc:"Pick a sensor + point rec."}
  ```
  Then in your handler:
  ```axon
  rec: readById(input->sensorRef)
  if (rec.missing("sensor") or rec.missing("point"))
    throw "sensorRef must be a sensor and point"
  ```

It's slightly worse UX (the picker lists more refs) but it actually works.

### Better workaround for multi-tag constraints: `navAuxFilter`

The multi-word `Ref<...>` parse bug exists because the words become part of a `nav:` Ref id. The clean fix is to keep the kind to a **single navigable entity type** and move the rest of the constraint into a separate `navAuxFilter` meta — a plain Haystack **filter string** (spaces allowed, it is never turned into a Ref id). Per `docFresco/Nav` → *Nav Aux Filter*, the picker navigates the tree for the entity type and runs each **leaf** node through the filter:

```trio
// navigate the equip tree, but only ahu+rooftop leaves are selectable
equipRef: {kind:"Ref<equip>" navAuxFilter:"ahu and rooftop" dis:"RTU"}

// navigate the site/equip/point tree, only writable points selectable
target:   {kind:"Ref<point>" navAuxFilter:"point and writable" dis:"Target Point"}
```

Related ValDef meta for Ref pickers (all from `docFresco/ValDef` + `Nav`): `navAuxFilter` (filter leaf recs), `navCluster` (navigate cluster-wide, not just local proj), `navSelAnyRec` (allow selecting grouping nodes that map to recs), `navSelAny` (Ref[] only — select a parent to imply everything under it; resolve with `navResolve()`).

**`Ref<writable>` vs `Ref<point> navAuxFilter:"point and writable"` — pick deliberately:**

| Approach | Picker behavior | Use when |
|----------|-----------------|----------|
| `Ref<writable>` | **Flat** `readAll(writable)` — every writable point in folio, ungrouped. | You want the complete folio set (the literal "all writable points"); small/medium point counts. |
| `Ref<point>` + `navAuxFilter:"point and writable"` | site → equip → point **tree**, writable leaves only. | Large sites where tree grouping helps. **Caveat:** nav pickers only surface recs that are *in the nav tree* — orphan writable points (no `equipRef`/`siteRef`) won't appear. |

### Observed (poppyResets, this project)

The deployed `defineActionTemplate` shipped its `target` field as a **bare** `{kind:"Ref"}` (matching the old Full Reference Example above). In practice that picker did **not** offer all writable points — it surfaced only the points already referenced by existing `poppyAction` recs (i.e. targets already in use), not the folio-wide writable set. Treat a bare unscoped `kind:"Ref"` as **unreliable for discovery**: always give a Ref input a scope, either via `Ref<marker>` or `Ref<entity> + navAuxFilter`.

### Scope each Ref to its CODE-VERIFIED target type, not its label

The bare-`Ref` blank-picker bug usually affects **every** Ref field in a template, not just one — `defineVirusTemplate.sensorRef`, `defineBindingTemplate.virusRef`, and `defineBindingTemplate.actionRef` were all bare `{kind:"Ref"}` alongside the `target` field. When you fix them, scope each to the type the **consuming code** actually reads, which is not always what the field name or a user request implies.

**Worked footgun (poppyResets bindings):** the `virusRef` field's blank picker looked like it should list the analyte sensor points (`readAll(analyte)`). But `funcs.trio` reads `virusRef` as a **poppyReset** rec — `readAll(poppyBinding and virusRef==virus->id)` and `readById(b->virusRef)->currentStage`. Scoping it to the analyte points would let users pick a sensor point that has no `currentStage` and never matches the binding filter → **stage dispatch silently dies**. The field that genuinely wants the analyte points is `sensorRef` (`read(poppyReset and sensorRef==sensorId)`).

**Rule: before scoping a Ref field, grep the handler for how the ref is dereferenced** (`readById(x->thatRef)`, `readAll(... and thatRef==...)`) and scope to *that* entity's marker. The code is ground truth; the field label and even the original request can mislead.

Code-verified mapping for this project:

| Template field | Consumed as | Correct kind |
|----------------|-------------|--------------|
| `defineActionTemplate.target`   | writable point (`pointWrite`) | `Ref<writable>` |
| `defineVirusTemplate.sensorRef` | analyte biosensor point (`read(poppyReset and sensorRef==id)`) | `Ref<poppySensorPoint>` |
| `defineBindingTemplate.virusRef`  | poppyReset virus rec (`readById(virusRef)->currentStage`) | `Ref<poppyReset>` |
| `defineBindingTemplate.actionRef` | poppyAction rec | `Ref<poppyAction>` |

All four are single-word marker filters, so they're safe per Step 9 (no `nav:` parse error). A custom marker works as a `Ref<...>` filter even with no formal `def` for it — the picker filters on tag presence.

**Related symptom — the generic record editor (not the recForm) shows a blank Ref picker too.** That one is driven by the tag's `def` `of:` (in the pod's `lib/*.trio` def block), a *different* layer than the recForm template's `kind:"Ref<...>"`. If a custom Ref tag has no `def` at all (e.g. `virusRef` was undeclared), the standard editor's picker is also blank. Fixing the recForm template does **not** fix the generic editor and vice-versa — they're independent. Scope the recForm field for the Create/Edit dialog; add a `def ... is:^ref of:^<target>` in the pod's def trio if you also need the generic editor's picker populated.

## Verification

1. Rebuild the pod (`fan buildLocal.fan`) and restart SkySpark.
2. Open the view → click Create → confirm each field shows:
   - The label from `dis:` (not the raw tag name).
   - The description from `doc:` (not silence).
   - Optional fields don't block submit when empty.
   - Dropdowns show the leading blank if you used `,a,b,c`.
   - Hidden fields (`id`, type markers) are not visible.
   - Ref pickers open without a client-side `Invalid Ref id` error in the browser console.
   - Scoped Ref pickers list the **expected** records — cross-check against `readAll(<scope>).size` (e.g. a `Ref<writable>` target picker should match `readAll(writable).size`). You can dry-run a filter under **Settings → UI → Test Nav** before shipping.
3. Submit a record with only the required fields filled and confirm folio commit succeeds.
4. Click Edit on the new rec — same expectations. **Save twice in a row** — the second save catches the "view-synthetic column persisted as a tag" bug if your action wires `poppy_*Edit` instead of the built-in `recEdit`.

## Pitfalls

| Symptom                                          | Cause                                                            | Fix                                                  |
|--------------------------------------------------|------------------------------------------------------------------|------------------------------------------------------|
| Field shows raw tag name like `stage1Start`      | Missing `dis:"Friendly Label"`.                                  | Add `dis:`.                                          |
| No help text under any field                     | Used `help:` instead of `doc:`.                                  | Rename to `doc:`.                                    |
| Form refuses to submit, complains about a field | Field lacks `optional` and user can't fill it in this variant.   | Add `optional` + branch in handler code.             |
| Dropdown has no blank option                     | `enum:"a,b,c"` instead of `enum:",a,b,c"`.                       | Add leading comma.                                   |
| Phantom "id" or marker checkbox shows up         | Missing `hidden` on system tags.                                 | Add `hidden`.                                        |
| Template change had no effect after build        | SkySpark not restarted — templates don't hot-reload.             | Restart SkySpark.                                    |
| Save throws `sys::ArgErr: argument type mismatch` with stack at `axon::Eq.eq → CoreLib.get → trap → reflection`, often with `21 More…` truncating the user frame | View button uses a custom edit wrapper (`action:"myProj_RecEdit"`) that re-implements `recEdit`. The selected Row carries synthetic view columns (`targetDis`, `active`, …) and the wrapper commits them as folio tags; the next refresh's row-cache `==` walks into a half-coerced value. | Change the button to `action:"recEdit"` (the built-in). If you must keep a wrapper, call `recEdit(input)` from inside it instead of re-implementing `diff(existing, dict).commit`. See Step 8. |
| Browser console throws `sys::ParseErr: Invalid Ref id (invalid char ' '): nav:<filter>.all` from `PimNavNode.makeHead` when opening a Ref picker | Template field declared `kind:"Ref<two or more words>"`. The picker builds a nav URI from the filter words and Ref ids can't contain spaces. | Drop the `<filter>`: use `kind:"Ref"` and validate the chosen rec in the handler. Single-word filters (`Ref<writable>`, `Ref<poppyReset>`) are safe. See Step 9. |
| Same `ArgErr → Eq.eq → CoreLib.get → trap` error opening a form whose template uses `Ref<multi word>` | Same root cause as the picker parse error, surfacing on the server side when the malformed nav handle becomes an operand of an axon `==`. | Same fix: drop the multi-word filter from the template. |
| Ref picker lists too few records — e.g. a "Target Point" picker shows only points already referenced by existing recs, not the full writable set | Field is a bare unscoped `kind:"Ref"`. It does not reliably enumerate folio; it surfaces values already in use for that tag. | Scope the input: `kind:"Ref<writable>"` (flat, complete) or `kind:"Ref<point>" navAuxFilter:"point and writable"` (tree, excludes orphans). See Step 9. |
| Ref picker (tree-grouped) is missing some valid records | Used `Ref<entity> navAuxFilter:...`; nav pickers only show recs that exist in the nav tree, so orphan recs without `equipRef`/`siteRef` are dropped. | Switch to flat `Ref<marker>` for completeness, or add the missing `equipRef`/`siteRef` linkage. See Step 9 table. |
