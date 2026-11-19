# IDE API

HTTP routes for editor plugins. A plugin uses them to copy the Axon functions
of a SkySpark project to the developer's machine, and to push one edited
function back with a stale-write check.

The routes exist only in HTTP mode (`MCP_TRANSPORT=http`). They live under
`/api/ide` on the same port as `/mcp`.

## Access key

Every route needs `Authorization: Bearer <key>`. The key is a **user access
key**. It belongs to one dashboard user. There is no shared token.

How a developer gets a key:

1. An admin opens the dashboard, page **Users**.
2. The admin makes the user (button **Add User**), or finds the user in the
   list.
3. The admin clicks the **Access keys** button of that user, gives the key a
   name, picks an expiry and clicks **Create key**.
4. The dashboard shows the key **one time**, with a **Copy** button. The
   server keeps only a sha256 hash of it. A lost key cannot be shown again:
   revoke it and make a new one.
5. The developer pastes the key in the plugin as the token.

A key looks like `axk_1a2b3c4d_<43 characters>`. The first part,
`axk_1a2b3c4d`, is the prefix. The dashboard and the logs show the prefix to
tell keys apart. They never show the rest.

Rules:

- A key is always required. It does not depend on `mcpRequireAuth`.
- The same key also works on `/mcp`, so one key serves the IDE and MCP
  clients. An OAuth login token of a user is accepted here too.
- A key never works on `/admin` (the dashboard API uses the user's password).
- The server checks the user on every call. A revoked key, an expired key, a
  key of a disabled user and a key of a deleted user all get
  `401 {"error":"unauthorized"}` from the next call on. The reply does not
  say which of these it was; the server log does.
- The key is checked before the body is read and before any project name is
  looked at.
- When the key check cannot run (the database is not ready), the reply is
  `503`.
- Send the key over HTTPS only.

### Roles

The role of the user decides what the key can do. The role is read on every
call, so a role change works at once.

| Role | List and export | `sync=true` | Commit |
|---|---|---|---|
| `admin`, `user` | yes | yes | yes |
| `readonly` | yes | yes | no: `403 {"error":"your user is read-only and cannot commit"}` |

A read-only user can use `sync=true`: it reads SkySpark and writes only the
server's local copy.

### The access record

Every call that passes the key check gives one row in the access record:
time, user, key prefix, action (`projects.list`, `functions.export`,
`function.commit`, `write.denied`), result, project and function name. A
commit made with the `commitAxonFunction` MCP tool gives a row too. An admin
sees the rows on the dashboard, page **Sessions**, tab **Access keys**. Rows
are kept for 365 days. A row never holds a key or Axon source.

### AXON_IDE_TOKEN is gone

Older versions used one shared token from the `AXON_IDE_TOKEN` environment
variable. It is no longer read. A call with the old token gets `401`. When
the variable is still set, the server logs one warning at start (it never
prints the value). Remove the variable and give each developer a key.

## Projects

A project is addressed as `{instance}/{project}`. Both are URL-encoded path
segments, so names with spaces and dots work (`My%20Site`, `v1.2`).

A project is known when it is in the SkySpark config of the server, or when
it has a local copy under `proj/<instance>/<project>`. Names must match
exactly (same case). An unknown project gets `404 {"error":"unknown project"}`.
The API never falls back to the default, primary or pinned project.

Names with `/`, `\`, control characters, or the names `.` and `..` get
`400 {"error":"invalid project name"}`.

## GET /api/ide/projects

```json
{
  "projects": [
    { "key": "demo/site", "instance": "demo", "project": "site",
      "functionCount": 42, "lastSync": "2026-01-02T03:04:05.678Z" }
  ]
}
```

`functionCount` is the number of functions in the local copy. A project that
is in the config but was never synced has `functionCount` 0 and `lastSync`
null.

## GET /api/ide/projects/{instance}/{project}/functions?sync=true|false

```json
{
  "key": "demo/site",
  "syncedAt": "2026-01-02T03:04:05.678Z",
  "functions": [
    { "name": "calcDailyAvg",
      "src": "(pt) => pt.hisRead(yesterday).avg",
      "doc": "Daily average of a point",
      "mod": "2026-01-02T03:04:05.678Z",
      "hash": "<sha256 of src, hex>" }
  ]
}
```

- The functions come from the local copy (`proj/<instance>/<project>/func`
  and `.sync-metadata.json`). There is one entry for each `func/<name>.axon`
  file.
- `sync=true` runs the project sync first, so the copy is fresh. Without it,
  SkySpark is not called.
- `doc` is null when the function has no doc. `mod` is the `mod` of the func
  record in UTC with milliseconds. `mod` is null when the copy does not hold
  it (a copy made by an older server version); call once with `sync=true` to
  fill it.
- A project with a local copy that is not in the SkySpark config can be read,
  but `sync=true` gets `503`.
- When SkySpark refuses the sync: `502 {"error":"sync failed: ..."}`.

## POST /api/ide/projects/{instance}/{project}/functions/{name}

Body:

```json
{ "src": "(pt) => pt.hisRead(lastWeek).avg",
  "doc": "optional",
  "expectedMod": "2026-01-02T03:04:05.678Z" }
```

- `src`: required, not empty.
- `doc`: optional. Absent or null: the stored doc is kept. `""` clears it.
- `expectedMod`: required. The `mod` the client last saw for this function.
  Use `null` for a new function (the function must not exist yet).
  The value must carry a time zone (`Z` or an offset such as `-05:00`).
  A date-time with no zone gets `400`.
- `name`: a letter, then letters, digits or `_` (128 characters at most).
  Other names get `400 {"error":"invalid function name"}`.

Replies:

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"status":"ok","mod":"<new ISO>","hash":"<sha256 of src>","removedDuplicates":[]}` | Committed. Use `mod` as the next `expectedMod`. `removedDuplicates` lists the older records with the same name that were backed up and removed: `[{"id","mod","backup"}]`. It is empty in the normal case. |
| 409 | `{"status":"conflict","mod":"<server mod>","hash":"<sha256 of server src>"}` | The function changed on the server (or exists, with `expectedMod` null). Nothing was committed. `mod` and `hash` are null when the function is gone. |
| 400 | `{"error":"..."}` | Bad name or body. |
| 401 | `{"error":"unauthorized"}` | No key, or a key that is wrong, revoked or expired, or its user is disabled or deleted. |
| 403 | `{"error":"your user is read-only and cannot commit"}` | The user has the `readonly` role. |
| 404 | `{"error":"unknown project"}` | No such project. |
| 413 | `{"error":"the body is too large"}` | Body over 2 MB. |
| 500 | `{"error":"Function ... Their backup was not written ..."}` | Older records with the same name are there, and the server could not back them up. Nothing was committed and no record was removed. |
| 502 | `{"error":"commit failed: ..."}` | SkySpark refused the commit. |
| 503 | `{"error":"..."}` | The project is not in the SkySpark config, or the key check is not ready. |

The `mod` check and the commit run in one Axon eval on SkySpark, so there is
no gap between the check and the write on the server side of this API.

After a good commit the server updates its local copy: `func/<name>.axon`,
`func/<name>.trio` and the function's entry in `.sync-metadata.json`. The
source that was replaced goes to `proj/<instance>/<project>/.backups/<name>/`
(the last 10 are kept). A following GET shows the new `src`, `mod` and `hash`
with no sync.

## The MCP tool uses the same code

`commitAxonFunction` and this POST route both call `commitFunction()` in
`src/ide/commitFunction.ts`. For the MCP tool:

- `expectedMod` is optional. Not given: no stale-write check, as before.
- `doc` not given: the stored doc is kept (before, it was cleared).
- The function name is validated.
- A stale write returns a result with `"status": "conflict"` and `isError`.
- One func record per name. An existing record is updated in place. If older
  records with the same name are there (an old commit added a new record each
  time), the newest one is updated and the others are removed. Each one is
  **backed up first**: a first eval reads the records, and the whole record
  (id, `mod`, `src`, `doc` and every other tag, as Hayson) goes to
  `proj/<instance>/<project>/.backups/<name>/removed-<ts>-<id>.json`. Only then
  does the commit eval run. It removes only the records that have a backup,
  and only when their `mod` did not change since the read. The `removed-*`
  files are never trimmed.
- If a backup cannot be written, nothing is committed and no record is removed.
  The tool fails with the error; the POST route answers 500 with it.
- The reply of the tool and of the POST route has `removedDuplicates`:
  `[{"id": "<record id>", "mod": "<ISO>", "backup": "<file>"}]`.
- A user with the `readonly` role cannot call it (see docs/implementation/OAUTH.md,
  "User access keys"). This rule needs a token on the call.

## Example

```bash
TOKEN=axk_1a2b3c4d_...   # the access key of the user (made-up here)
BASE=http://localhost:3847/api/ide

curl -s -H "Authorization: Bearer $TOKEN" $BASE/projects
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/projects/demo/site/functions?sync=true"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"src":"() => 1","expectedMod":null}' \
  $BASE/projects/demo/site/functions/calcDailyAvg
```
