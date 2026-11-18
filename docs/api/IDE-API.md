# IDE API

HTTP routes for editor plugins. A plugin uses them to copy the Axon functions
of a SkySpark project to the developer's machine, and to push one edited
function back with a stale-write check.

The routes exist only in HTTP mode (`MCP_TRANSPORT=http`). They live under
`/api/ide` on the same port as `/mcp`.

## Token

Every route needs `Authorization: Bearer <token>`. The token is the value of
the `AXON_IDE_TOKEN` environment variable of the server.

- The token is always required. It does not depend on `mcpRequireAuth`, and
  an OAuth token for `/mcp` is not accepted here.
- The token must be 16 characters or more. Make one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- When `AXON_IDE_TOKEN` is not set (or is too short), the server does **not**
  mount the routes. It logs one line at start:
  `IDE API is OFF: AXON_IDE_TOKEN is not set. ...`
- A missing or wrong token gets `401 {"error":"unauthorized"}`. The token is
  checked before the body is read and before any project name is looked at.

The token gives write access to every project in the SkySpark config of the
server. Keep it in `.env` (git-ignored) and send it over HTTPS only.

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
| 200 | `{"status":"ok","mod":"<new ISO>","hash":"<sha256 of src>"}` | Committed. Use `mod` as the next `expectedMod`. |
| 409 | `{"status":"conflict","mod":"<server mod>","hash":"<sha256 of server src>"}` | The function changed on the server (or exists, with `expectedMod` null). Nothing was committed. `mod` and `hash` are null when the function is gone. |
| 400 | `{"error":"..."}` | Bad name or body. |
| 401 | `{"error":"unauthorized"}` | Missing or wrong token. |
| 404 | `{"error":"unknown project"}` | No such project. |
| 413 | `{"error":"the body is too large"}` | Body over 2 MB. |
| 502 | `{"error":"commit failed: ..."}` | SkySpark refused the commit. |
| 503 | `{"error":"..."}` | The project is not in the SkySpark config. |

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

## Example

```bash
TOKEN=...   # the value of AXON_IDE_TOKEN
BASE=http://localhost:3847/api/ide

curl -s -H "Authorization: Bearer $TOKEN" $BASE/projects
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/projects/demo/site/functions?sync=true"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"src":"() => 1","expectedMod":null}' \
  $BASE/projects/demo/site/functions/calcDailyAvg
```
