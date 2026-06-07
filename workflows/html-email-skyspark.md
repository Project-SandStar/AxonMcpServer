---
title: Write HTML Emails in Axon (Delivery-Safe Bodies)
description: How to construct HTML email bodies in axon that actually arrive — emailSend behavior, the rich-body delivery trap, the concat-list pattern, and the email-client-safe HTML structure.
category: reporting
tags: [email, emailSend, emailSendAsync, html, smtp, notification, lib-email]
version: 1.0
---

# Write HTML Emails in Axon (Delivery-Safe Bodies)

## Overview

SkySpark's `lib-email` ships `emailSend(recipients, subject, content, attachments:null)` and `emailSendAsync(…)`. Both are simple to call — but the **HTML body itself** is what determines delivery success. A body that's syntactically valid but uses modern web HTML patterns (XHTML DOCTYPE, `<style>` blocks, Unicode chars, semantic `<div>` layout) **gets quietly dropped by Gmail / Outlook / corporate MTAs** even when SkySpark reports `"sent"`.

This workflow covers what `emailSend` does, the **email-safe HTML pattern** that arrives reliably, and the gotchas that bit us in poppyResets.

## When to Use This Workflow

- You're adding email notifications to an axon function.
- `emailSend` returns `"sent"` but recipients say they didn't receive anything.
- Plain-text emails arrive but rich HTML doesn't.
- You're choosing between `emailSend` and `emailSendAsync`.
- You're wondering why your `<style>` block isn't styling anything in Gmail.

## Prerequisites

1. **`lib-email`** loaded in the project (it's standard — check `Settings → Libs`).
2. **SMTP configured** in the host email settings (host folio rec, not project). Verify by sending a 1-line test:
   ```axon
   emailSend(["you@example.com"], "smtp ping", "plain test")
   ```
   If that doesn't arrive, the problem is SMTP config, not your code — fix Settings → Email first.

## Step 1: `emailSend` Mechanics

```axon
emailSend(recipients, subject, content, attachments: null)
```

| Argument      | Type                                       | Notes                                                                                                                                                       |
|---------------|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `recipients`  | `Str` or `Str[]` or `{to, cc, bcc}` Dict   | Email addresses. Lists become multiple `To:` recipients in one message.                                                                                     |
| `subject`     | `Str`                                       | Mail subject. Avoid identical subjects in rapid succession — Gmail dedupes / spam-classifies.                                                                |
| `content`     | `Str`                                       | **If it starts with `<html>`, sent as `Content-Type: text/html`; otherwise `text/plain`.** No middle ground — the leading-`<html>` sniff is the only switch. |
| `attachments` | file handle / Ref / List of those           | Optional. Reports referenced by `Ref` are rendered to PDF and attached.                                                                                     |

Required permission: `admin` (per `@Axon { admin = true }` on the fantom side). Task subscribers run with admin role, so the dispatch path can call this directly — no `su` workaround needed.

## Step 2: Sync vs Async

| Function          | Returns when…                    | Use for…                                                                                            |
|-------------------|----------------------------------|------------------------------------------------------------------------------------------------------|
| `emailSend`       | SMTP handoff completes.          | When you want **errors surfaced immediately** in your function and in `logRead`.                     |
| `emailSendAsync`  | Immediately (queued).            | Long mass-mails where blocking the caller is unacceptable; you're OK losing the error signal.        |

**Default to `emailSend`.** `emailSendAsync` swallows errors silently — we lost a half-day of debug time in poppyResets because the async send "succeeded" but nothing was being delivered. Only switch to async when you have a measured reason (long blocking, high volume) and a separate channel to surface failures.

## Step 2.5: The Per-Line Length Cap (THE silent-drop trap)

`emailSend(recipients, subject, body)` passes the body string to SkySpark's local SMTP **with whatever line breaks the body already contains** — there is no auto-wrap. The local SMTP layer accepts it, `emailSend` returns `"sent"`, the SkySpark log shows no errors, the message is forwarded to the upstream relay. **The upstream relay then rejects it** with something like:

```
message has lines too long for transport (received 3896, limit 2048)
```

…and emits a bounce notice to the From: address (which is usually a no-reply box you don't read). The result: **`emailSend` reports success, no SkySpark-side error, no email arrives, the bounce is invisible.** This is the highest-frustration-per-byte failure mode in SkySpark email and the one that wasted a half-day in poppyResets debugging.

**RFC 5321** requires ≤998 bytes per line. Many corporate relays enforce **≤2048 bytes per line**. Some go lower.

The canonical axon HTML email pattern is:

```axon
parts: ["<html><body>", "<h1>" + title + "</h1>", …, "</body></html>"]
return parts.concat("")
```

For a 100-byte body, this is fine — one ~100-byte line. For a 4 KB rich HTML email, `parts.concat("")` produces **one ~4 KB single line**, which is over the relay's per-line cap, and the entire message is silently dropped.

### The fix is one character

```axon
return parts.concat("\n")   // instead of concat("")
```

Each fragment in `parts` becomes its own line. Now no individual line exceeds the cap.

### Long dynamic strings also need internal newlines

If you build up rows in a single Str inside a loop:

```axon
actLines: ""
bindings.each(b => do
  actLines = actLines + "<li>…" + b.dis() + "…</li>"        // BAD — single Str grows unbounded
end)
```

That entire `actLines` is *one* fragment when it lands in `parts`, even with `concat("\n")` around the outside. Add `\n` inside the dynamic Str too:

```axon
actLines = actLines + "<li>…</li>\n"                         // GOOD — wraps as it grows
```

The same applies to multi-row Str values like a band-row block that emits 3+ `<tr>…</tr>` lines.

### Verify by inspecting the body

After building, write the body to disk and check the longest line:

```axon
ioWriteStr(body, `io/emailDebug.html`)
```

Then from a shell:

```bash
awk '{print length, NR}' var/proj/<proj>/io/emailDebug.html | sort -rn | head -5
```

Anything over ~1000 bytes on a single line is a delivery risk. Anything over 2048 is virtually guaranteed to be dropped.

### Why `emailSend` reports success despite the rejection

The local SMTP submission succeeds — SkySpark hands the message to its outbound queue and gets an OK. The relay-side rejection happens asynchronously at the next hop, **after** `emailSend` has already returned. The relay generates an RFC 3464 bounce report (the "delivery status notification") to the envelope-from address. If that From: is `noreply@…` or a system box, the bounce is lost. The SkySpark side has no idea anything went wrong.

## Step 3: The Rich-Body Delivery Trap

A semantically-clean modern HTML body like:

```html
<!DOCTYPE html>
<html xmlns='http://www.w3.org/1999/xhtml'>
<head>
  <meta http-equiv='Content-Type' content='text/html; charset=utf-8' />
  <style>
    body { font: 11pt Arial; }
    .banner { background:#e67e22; color:#fff; padding:20px; }
  </style>
</head>
<body>
  <div class='banner'><h1>Stage 2 — Influenza A M gene</h1></div>
  <p>Reading: 30.2 gc/m³ → Stage 2</p>
</body>
</html>
```

…**gets silently dropped at delivery** by Gmail/Outlook even when `emailSend` returns `"sent"`. The culprits:

1. **XHTML DOCTYPE / xmlns** — flagged as legacy and treated as suspicious by modern spam scoring.
2. **`<style>` block** — most webmail clients strip or rewrite it; some servers reject the message outright as "uses external stylesheet trickery".
3. **Unicode characters** (`—`, `→`, `³`) — without explicit charset alignment between header and body, MTAs can quarantine for character-set confusion.
4. **`<div>`-based layout** — modern but not the email standard.
5. **Single-quoted HTML attributes** (`xmlns='...'`) — non-canonical, some clients reject.
6. **Subject collisions** — identical subjects in rapid succession (e.g. multiple `[Stage 2] X` from a hot task subscriber) trigger Gmail's "promotions" filter or get dropped as duplicates.

Symptom: simple test emails arrive (plain text or minimal `<html><body><h1>x</h1></body></html>`), but a 3-KB rich body returns `"sent"` and never lands.

## Step 4: The Delivery-Safe Email Pattern

Stick to these rules — they're the same rules every marketing-email vendor follows for a reason:

1. **Plain `<html><body>`** — no DOCTYPE, no xmlns.
2. **`<table>`-based layout** with `cellpadding="0" cellspacing="0"` — the established email standard.
3. **All styles inline** via `style="…"` attributes on every element. **No `<style>` block.**
4. **Double quotes** for HTML attribute values, not single quotes.
5. **HTML entities** for non-ASCII chars: `&rarr;` `&ndash;` `&sup3;` `&middot;` (or simple ASCII substitutes like `->`, `-`).
6. **Unique subject lines** — include a timestamp, reading, or unique ID so identical subjects don't pile up.
7. **Keep total body size under ~50 KB** to stay under Gmail's clipping threshold.

Reference body skeleton:

```axon
parts: [
  "<html><body style=\"font:11pt Arial,sans-serif;color:#222;margin:0;padding:0;background:#f7f7f7;\">",
  "<table width=\"640\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" ",
    "style=\"margin:24px auto;background:#ffffff;border-radius:6px;\">",
  "<tr><td style=\"padding:20px 24px;color:#ffffff;background:", stageColor, ";\">",
    "<div style=\"font-size:20px;font-weight:600;\">", stageLabel, "</div>",
  "</td></tr>",
  "<tr><td style=\"padding:18px 24px;\">",
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:13px;\">",
      "<tr><td style=\"padding:6px 10px;background:#f3f4f6;width:38%;\">Organism</td>",
          "<td style=\"padding:6px 10px;border-top:1px solid #eee;\">", organism, "</td></tr>",
      "<tr><td style=\"padding:6px 10px;background:#f3f4f6;\">Reading</td>",
          "<td style=\"padding:6px 10px;border-top:1px solid #eee;\">",
            reading.toStr, " ", unit.replace(\"³\", \"&sup3;\"),
          "</td></tr>",
    "</table>",
  "</td></tr>",
  "</table>",
  "</body></html>"
]
return parts.concat("")
```

## Step 5: The Concat-List Pattern (axon-idiomatic)

Don't build long bodies with `+` chains — they're hard to read and unforgiving when a value is null. Use the **list-of-fragments concat** pattern from `bassg/consumption/email_monthlyReport.axon`:

```axon
parts: [
  "<html><body>",
  "<h1>" + title + "</h1>",
  ifSomething ? sectionA : "",
  sectionB,
  "</body></html>"
]
return parts.concat("")
```

A `""` fragment vanishes harmlessly under concat — no special-casing needed. For a fragment that depends on a possibly-null value, default the value first:

```axon
addrLine: if (addr == null) "" else "<tr><td>" + addr + "</td></tr>"
```

Then drop `addrLine` into the `parts` list.

## Step 6: Subject Lines That Don't Get Filtered

Bad: `[Stage 2] Influenza A M gene at Ed W. Clark High School` — 100 identical subjects in 10 minutes from a hot task subscriber will trigger filtering.

Better: include a per-message unique signal —

```axon
subj: "[S" + stage + " " + reading.toStr + " " + unit + "] " + organism +
      " - " + schoolName + " - " + now().format("HH:mm:ss")
```

Yields `[S2 30.2 gc/m³] Influenza A M gene - Ed W. Clark High - 11:35:21` — distinct per send.

## Step 7: Wiring to a Task Subscriber

A common pattern is to fire emails from a `task` rec that subscribes to `obsCurVals`:

```trio
task
dis: "Notify on Stage Change"
taskExpr: "myDispatchHandler"
obsCurVals
obsFilter: "mySensorPoint"
```

The handler runs **as the task user** (admin role). Therefore:

- `@Axon { admin = true }` helpers work directly.
- `@Axon { su = true }` helpers **fail** with `PermissionErr: Missing 'su' permission`. Lower the decorator to `admin` (the right fix when the helper is not truly su-sensitive) or set `userAllow` on the task user (heavier).
- The task should call `emailSend` sync so that any send failure surfaces in `logRead` rather than vanishing — debug-time matters more than the few ms of blocking.

A wrap-around `try/catch` belongs inside the dispatch so one bad recipient doesn't kill the whole task:

```axon
(payload) => do
  recipients: resolveRecipients(payload->role)
  if (recipients.size == 0) do
    logWarn("myLib", "no recipients for " + payload->role.toStr)
    return {sent: 0}
  end
  try do
    emailSend(recipients, buildSubject(payload), buildBody(payload))
    logInfo("myLib", "emailed " + recipients.size + " recipients")
    return {sent: recipients.size}
  end
  catch (ex) do
    logErr("myLib", "email send failed: " + ex.toStr)
    return {sent: 0, error: ex.toStr}
  end
end
```

## Step 8: Recipient Resolution — Host Users Need `userReadAll`

Real SkySpark auth users live in a **host folio**, not the project's. `readAll(user and ...)` from inside a project returns **0 rows** even when users exist. Use:

```axon
userReadAll(poppyNotify and email)          // filter expr, NOT a Str
```

`userReadAll` takes a **filter expression** (same syntax as `readAll`), not a quoted string. Passing `"poppyNotify and email"` errors with `Expr is not a filter; String literal`.

See workflow `axon-lang-information` for the full host-vs-project user gotcha.

## Verification

1. **Plain-text test** — `emailSend(["you@example.com"], "plain ping", "plain body")`. Must arrive. If not, SMTP is misconfigured; stop here.
2. **Minimal HTML test** — `emailSend(["you@example.com"], "html ping", "<html><body><h1>test</h1></body></html>")`. Must arrive.
3. **Rich body via the same axon path** — render your full `buildEmailHtml(payload)` and send it. If only #1 and #2 arrive but #3 doesn't, you have the **rich-body delivery trap**. Audit the body against Step 4's rules.
4. **Task path** — trigger a real `obsCurVals` event (or override a sensor curVal) and confirm the resulting email arrives. If the manual send works but the task-driven send doesn't, check the permission level (`admin` vs `su`) on the helper functions.
5. **Subject uniqueness** — fire two dispatches back-to-back. Verify both arrive (not just one). If only the first arrives, your subject lines collide.

## Pitfalls

| Symptom                                                                    | Cause                                                                        | Fix                                                                                                 |
|----------------------------------------------------------------------------|------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `emailSend` returns `"sent"` but nothing arrives                            | **`parts.concat("")` produced one giant line that exceeds the relay's per-line cap** (most common). Rich-body format filter is secondary.| Use `parts.concat("\n")` and add `\n` inside dynamically-grown Strs (Step 2.5). Then audit body per Step 4 if it still fails. |
| `emailSendAsync` returns no error but nothing arrives                       | Async swallows SMTP failures; you're flying blind.                           | Switch to sync `emailSend` for visibility.                                                          |
| First email arrives, identical subsequent ones don't                        | Subject collision triggers webmail dedupe/spam classification.               | Make subjects unique per message (Step 6).                                                          |
| `PermissionErr: Missing 'su' permission`                                    | Helper marked `@Axon { su = true }`; tasks run as admin not su.              | Lower to `@Axon { admin = true }` or `userAllow` on task user.                                      |
| `readAll(user and email)` returns 0 even though users exist                 | Real users live in host folio.                                               | Use `userReadAll(filter)` instead. Filter is an expression, not a Str.                              |
| Content-Type comes through as `text/plain` instead of HTML                   | Body doesn't literally start with `<html>`.                                  | Make `<html` the very first characters; no leading whitespace or DOCTYPE.                           |
| Gmail clips the message at "[Message clipped] View entire message"         | Body exceeds ~102 KB.                                                        | Trim — link to a detail page instead of inlining everything.                                        |
| Styles silently dropped, body looks unstyled                                | Used `<style>` block instead of inline styles.                               | Move every rule to `style="…"` attributes (Step 4).                                                  |

## See Also

- Reference real-world axon HTML emails:
  - `bassg/consumption/email_monthlyReport.axon` — full concat-list, inline-CSS layout.
  - `losalamo/email_PointsFault.axon` — minimal `"<html><body>" + body` pattern.
- `axon-lang-information` workflow — broader axon syntax gotchas.
- `task-subscriber-permissions` workflow — how task users and admin permissions interact.
