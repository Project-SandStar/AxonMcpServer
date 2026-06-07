---
title: Task Subscribers — Wiring, Permissions, and Host-User Access
description: How obsCurVals (and other) task subscribers are wired, the task user's role, the @Axon su vs admin distinction, userAllow, taskRefreshUser, and reading host-folio users from inside a project.
category: automation
tags: [task, obsCurVals, taskExpr, su, admin, userAllow, userReadAll, taskRefreshUser, host-folio]
version: 1.0
---

# Task Subscribers — Wiring, Permissions, and Host-User Access

## Overview

A SkySpark `task` rec is an **always-running message handler** that processes events from an observable (a `curVal` change, a schedule, a folio commit, an external message). The handler is an axon function specified by `taskExpr`. Tasks are the supported way to react to point changes in near-real-time — they're the alternative to cron-style jobs.

But tasks run in a **separate evaluation context** with a **different user account** than ad-hoc evals from the Shell. That difference is the source of two recurring footguns:

1. Helper functions marked `@Axon { su = true }` fail with `PermissionErr` when called from a task path even though they work fine from the Shell.
2. `readAll(user and …)` returns 0 rows from a task (or from any axon call inside a project), because real auth users live in the **host folio**, not the project's folio.

This workflow covers wiring the task rec, the task user's role/permissions, and how to query host-level recs from a project-scoped axon function.

## When to Use This Workflow

- You're writing a `task` rec or `obsCurVals` subscriber for the first time.
- An ad-hoc eval works but the same code throws `PermissionErr: Missing 'su' permission` when invoked from a task.
- `readAll(user and …)` returns 0 rows even though you can see users in the system UI.
- You changed something on a user rec (added a tag, edited `userAllow`) and the task doesn't see the change.
- You're wondering whether to use `emailSend` vs `emailSendAsync` from a task.

## Prerequisites

1. A project with at least one writable folio.
2. `lib-task` available (it's standard — confirm in `Settings → Libs`).
3. The handler function you want to invoke already committed (folio rec or shipped in a pod's `lib/funcs/`).

## Step 1: The Task Rec Shape

A minimal `obsCurVals` task that reacts to point changes:

```trio
task
dis: "My Reset Task"
taskExpr: "myHandler"
obsCurVals
obsFilter: "mySensorPoint"
```

| Tag         | Purpose                                                                                                                |
|-------------|------------------------------------------------------------------------------------------------------------------------|
| `task`      | Marker — this is a task rec.                                                                                            |
| `taskExpr`  | Name of the axon function to call when a message arrives. Typically just the function name; no args (handler reads msg).|
| `obsCurVals` | Marker — subscribe to **curVal change events**. Other observable types include `obsCommits`, `obsSchedule`, etc.       |
| `obsFilter` | Haystack filter (as a **Str**, in quotes) selecting which points' curVal changes to subscribe to.                       |
| `disabled`  | Optional marker — when present the task is paused.                                                                      |

The handler signature is `(msg) => do … end`. For `obsCurVals` the `msg` carries the rec id whose curVal changed; the handler typically reads the rec and decides what to do.

Idempotent creation pattern (so re-running setup doesn't duplicate):

```axon
() => do
  existing: try(read(task and taskExpr=="myHandler", false)) catch null
  if (existing == null) do
    diff(null, {task, dis:"My Reset Task", taskExpr:"myHandler",
                obsCurVals, obsFilter:"mySensorPoint"}, {add}).commit
  end
end
```

## Step 2: How the Task User Works

Every task execution runs in an axon context **owned by a special "task" user**:

- If a user rec with `username == "task"` exists, it's used as-is.
- Otherwise SkySpark synthesises a "task" user with **admin role** and a `projAccessFilter` restricted to the local project.

**The task user must NOT have the `su` role.** Per the `lib-task` docs: "The task user account must not be configured with the 'su' role or it will not be used." If you tag the task user `su`, SkySpark refuses to use it and falls back to the synthetic admin user.

This is why tasks behave differently from Shell evals:

| Caller                          | User context                | Can call `@Axon { su = true }`? |
|---------------------------------|-----------------------------|---------------------------------|
| SkySpark Shell (logged in as su) | The logged-in user (su).    | Yes.                            |
| Scheduled job (`jobExpr`)        | The task user (admin).      | **No** — fails with PermissionErr. |
| `task` rec with `taskExpr`       | The task user (admin).      | **No** — fails with PermissionErr. |
| `taskRun(expr)`                  | The task user (admin).      | **No** — fails with PermissionErr. |

## Step 3: When You Hit `PermissionErr: Missing 'su' permission`

Three fixes, ordered from simplest to most secure:

### 3a. Lower the decorator to `admin` (recommended for internal helpers)

If the helper function is *not actually su-sensitive* — it's just doing webhook POSTs or sending emails or reading non-sensitive recs — switch the fantom decorator:

```fantom
// Before:
@Axon { su = true }
static Dict poppy_httpPostGrid(Uri uri, Str username, Str password, Obj grid)

// After:
@Axon { admin = true }
static Dict poppy_httpPostGrid(Uri uri, Str username, Str password, Obj grid)
```

The task user's admin role can call admin-marked funcs directly. No config required. This is the right answer for the **vast majority of internal helpers** — `su` is for system-level operations like deleting users.

### 3b. Set `userAllow` on the task user

When the function legitimately requires `su` and you can't lower it, grant the task user permission to call **that specific function name** via the `userAllow` list tag on the task user rec:

```axon
taskUser: read(user and username=="task")
diff(taskUser, {userAllow: ["myReallySuFunction", "anotherSuFunction"]}, null).commit
taskRefreshUser()    // invalidate the cached task-user reference
```

`userAllow` is documented in `lib-user::userAllow` — list of Str function names that grant `su`/`admin` funcs to a user who wouldn't normally have permission. Call `taskRefreshUser()` after editing — without it the task may keep using the cached pre-edit user dict.

### 3c. Drop the permission flag entirely

For purely internal helpers in your own pod that no one else can call, you can just remove the `@Axon { … }` argument block:

```fantom
@Axon
static Dict myInternalHelper(…)
```

The function becomes callable by anyone with access to the lib. Don't do this for anything that touches credentials, the host folio, or system mutations.

## Step 4: Reading Users from a Task — `userReadAll`, not `readAll`

Real SkySpark auth users (those with `@u:username` style refs) live in the **host folio**, **shared across all projects**. They are **NOT in any project's folio**. So:

```axon
readAll(user and email)        // returns 0 rows from inside a project
readById(@u:alper)             // UnknownRecErr: u:alper
```

…even when the user clearly exists. The correct API is from `lib-user`:

```axon
userReadAll(poppyNotify and email)         // host folio, returns proper Recs
userRead(username == "<username>")              // expects exactly one
userReadById(@u:alper)                     // by ref
```

**Important: the filter argument is a Haystack filter expression, NOT a Str.** Just like `readAll(…)`:

```axon
userReadAll(poppyNotify and email)              // correct
userReadAll("poppyNotify and email")            // WRONG — "Expr is not a filter; String literal"
```

If you need a string-driven filter (because the filter is computed dynamically), use `parseFilter`:

```axon
userReadAll(parseFilter("poppyNotify and userRole==\"" + role + "\""))
```

Confusion tip: project-level recs that happen to carry a `username` tag (e.g. an outbound connector rec) DO show up under `readAll(username)`. Those are **not** auth users — they're project recs that share the tag name. Always filter on `user` (the marker) too if you mean "auth user".

## Step 5: Wiring Email Notifications from a Task

End-to-end pattern combining everything:

```axon
// 1. Task handler — fires when a sensor curVal changes.
name: poppy_TaskHandler
src:
  (msg) => do
    if (msg == null or msg.isEmpty) return null
    sensorId: msg["id"]
    if (sensorId == null) return null
    virus: try(read(poppyReset and sensorRef==sensorId, false)) catch null
    if (virus == null) return null
    oldS: virus["currentStage"]
    newS: poppy_updateStage(virus)
    if (oldS == newS) return null          // skip when no transition
    poppy_arbitrateAndWrite("poppyTask")    // pointWrite branch
  end

// 2. updateStage commits the new stage and fires dispatch on transition.
name: poppy_updateStage
src:
  (virus) => do
    newS: poppy_computeStage(virus)
    oldS: virus["currentStage"]
    if (oldS != newS) do
      diff(virus, {currentStage:newS, currentStageMod:now()}, null).commit
      try(poppy_dispatchNotifications(readById(virus->id), oldS, newS))
        catch (ex) logErr("poppyReset", "dispatch err: " + ex.toStr)
    end
    return newS
  end

// 3. dispatch resolves recipients via the host user folio + sends.
name: poppy_dispatchNotifications
src:
  (virus, oldStage, newStage) => do
    bindings: readAll(poppyBinding and virusRef==virus->id).toRecList
    bindings.each(b => do
      if (b->stage != newStage) return null
      action: try(readById(b->actionRef)) catch null
      if (action == null or action.has("disabled")) return null
      at: action["actionType"]
      if (at != "emailSkySpark") return null
      role: action["recipientRole"]
      users: userReadAll(poppyNotify and email).toRecList
      if (role != null and role != "")
        users = users.findAll(u => u["userRole"] == role)
      emails: users.map(u => u->email)
      if (emails.size == 0) return null
      try do
        emailSend(emails, buildSubject(virus, newStage), buildHtml(virus, newStage))
        logInfo("poppyReset", "emailed " + emails.size)
      end
      catch (ex) do
        logErr("poppyReset", "emailSend failed: " + ex.toStr)
      end
    end)
  end
```

Key choices made above:

- The whole dispatch is `try/catch`-wrapped so one bad recipient or one missing rec doesn't crash the task.
- `emailSend` (sync) is used so failures land in `logRead`. `emailSendAsync` would silently drop them.
- `userReadAll` (not `readAll`) finds host users like `@u:alper`.
- `recipientRole` filtering is optional — blank means broadcast.
- `currentStage` is committed inside `poppy_updateStage` so re-entrant task fires can skip when the stage hasn't actually changed.

## Step 6: Debugging a Misbehaving Task

| Symptom                                                          | Likely cause                                                                              | Diagnostic                                                                                          |
|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Task fires on every curVal but does nothing visible              | Handler returning early on an unexpected guard.                                            | Add `logInfo` at each branch and tail `var/log/skyspark.out`.                                       |
| `PermissionErr: Missing 'su' permission`                         | Task user is admin, helper requires su.                                                   | Lower decorator to admin, or set `userAllow` on the task user + `taskRefreshUser()`.                |
| Handler change had no effect after rebuild                       | Lib funcs don't hot-reload; SkySpark using old version.                                   | Restart SkySpark, or commit a folio shadow via `commitAxonFunction`.                                 |
| Task fires duplicates after `taskRefreshUser`                    | Cached task-user dict invalidated mid-message.                                            | Expected; the next message uses the fresh user.                                                     |
| `readAll(user and …)` returns 0 from the task handler            | Looking in the project folio for host users.                                              | Switch to `userReadAll(…)`.                                                                          |
| Async emails "sent" but never arrive                             | `emailSendAsync` swallows SMTP errors.                                                     | Switch to sync `emailSend` and tail logs.                                                            |
| Task seems disabled even though `disabled` tag is absent         | Subscription state cached in memory; pod reload required.                                 | Restart SkySpark, then `tasks()` to confirm the task is active.                                     |

## Step 7: `taskRefreshUser`, `taskRestart`, and Friends

A few helpers from `lib-task` worth knowing:

| Function             | Purpose                                                                                            |
|----------------------|----------------------------------------------------------------------------------------------------|
| `taskRefreshUser()`  | Invalidate the cached task-user dict. Call after editing the task user's `userAllow` etc.          |
| `taskRestart(task)`  | Stop and restart a specific task. Use after editing its `obsFilter` or `taskExpr`.                  |
| `taskCancel(task)`   | Stop a running message handler invocation (e.g. one stuck in an infinite loop).                     |
| `taskSend(task, msg)`| Manually enqueue a message to a task — useful for one-off testing without an actual sensor change.  |
| `tasks()`            | List all tasks in the project (debug grid).                                                         |
| `taskCur()`          | Inside a handler, returns the currently-running task rec. Useful for self-introspection.            |

## Verification

1. **Task is loaded**: `tasks()` returns a grid that includes your task with a non-null state.
2. **Handler is reachable**: from the Shell, call your handler directly with a dummy msg dict — should run without `Unknown symbol`.
3. **Permission check**: from the Shell, `taskRun("yourHandler()")` — runs as the task user. If it throws `PermissionErr`, your handler depends on a helper marked `su` that needs lowering or `userAllow`-ing.
4. **End-to-end via real event**:
   - For `obsCurVals`: `pointOverride(sensor, newValue, …)` and watch `logRead(today(), null)` for the handler's log lines.
   - For `obsSchedule`: wait, or manually trigger via `taskSend`.
5. **Host-user resolution**: `userReadAll(poppyNotify and email)` from inside the handler returns the same list you see in the Users UI.

## Pitfalls

- **Don't tag the task user `su`.** Tasks will silently refuse to use that user and fall back to the synthetic admin. Use `userAllow` instead.
- **Don't forget `taskRefreshUser()` after `userAllow` edits** — the task keeps using the cached old user dict.
- **Don't quote `userReadAll` filters.** Pass the filter expression directly, like `readAll`.
- **Don't use `emailSendAsync` from a task** unless you have separate error monitoring. The sync path is debuggable; async failures vanish.
- **Don't expect lib func changes to take effect without a restart.** Trio funcs in `lib/funcs/` load once at pod install. Either restart or commit a folio shadow with `commitAxonFunction`.

## See Also

- `axon-func-update` workflow — the folio-shadow trick for hot-deploying axon function changes without a restart.
- `axon-lang-information` workflow — broader axon syntax + permission gotchas.
- `html-email-skyspark` workflow — building delivery-safe HTML bodies from inside a task.
