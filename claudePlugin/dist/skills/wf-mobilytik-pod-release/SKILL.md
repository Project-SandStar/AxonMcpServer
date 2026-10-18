---
name: wf-mobilytik-pod-release
description: "How to bump the pod API level, release every line through lic.bas.co podRepo, and port master changes to the..."
---

<!-- generated from workflows/mobilytik-pod-release.md by claudePlugin/scripts/build.mjs; edit the source, not this file -->

# Release bassgMobilytik Through the podRepo

## Overview

bassgMobilytik ships to customers only through the podRepo on lic.bas.co
(`https://lic.bas.co/podRepo/`, admin `https://lic.bas.co/api/podrepo/ext/podRepoAdmin/`).
A pod version is `<line>.<api>.<build>`, e.g. `3.1.12.6.1`. Pushing a tag of that
form starts the GitLab `release_pod` job, which builds, tests and uploads the pod
as a candidate, then beta. The 3.1.x lines are tagged on `master`; 4.0.6 is
worked on and tagged on the `skyspark-4.0.6` branch.

## When to Use This Workflow

- "release the pod", "put it on lic.bas.co", "I don't see the pod in podRepo"
- "increment the API level", "the app reads new pod fields"
- "apply the changes to 4.0.6", "release 4.0.6"

## Step 1: Decide the API level

Raise the API level when the app starts reading something new from the pod: a
new Axon func, a new or renamed result field, a new filter value. A new level
takes build 1 on every line (`<line>.<api>.1`). Change all of these together:

- `skyspark_pod/tools/skysparkExt/build.fan` `version = Version("3.1.12.<api>")`
- `skyspark_pod/buildLocal3112.fan` and `buildRelease.fan` default api
- `skyspark_pod/tools/scripts/skyspark/skyspark.sh` `API_LEVEL=<api>` (easy to miss:
  `skyspark.sh install` passes it to the build script and overrides the .fan default)
- `lib/logic/services/pod_compatibility.dart` `kLatestPodApiLevel`
- `CLAUDE.md` level history
- `kRequiredPodApiLevel` only when old servers can no longer work with the app.
  When the app gates the new parts on a `pushInfo().features` flag, leave it.

## Step 2: Release the 3.1.x lines from master

1. Test on the local SkySpark 3.1.12 first (`skyspark.sh install 3.1.12 -noAuth`).
2. Commit, merge `origin/master` in, push to `master`.
3. On the Mac, on that exact commit: `skyspark_pod/tools/scripts/podrepo/web-bundle.sh`.
   The CI job has no Flutter; it downloads the web bundle keyed by the commit SHA.
   Without it the job fails at once with `curl: (22) ... 404` and
   "No web bundle for <sha>". The script refuses uncommitted files under
   `skyspark_pod/`, `lib/`, `pubspec.yaml`, including untracked ones.
4. Tag every line on that commit and push the tags:
   `3.1.6 3.1.8 3.1.9 3.1.10 3.1.11 3.1.12` -> `<line>.<api>.<build>`.
5. GitLab creates at most a few tag pipelines per push. Check that every tag has a
   pipeline; start a missing one with
   `glab api -X POST "projects/openbassg%2Fskyspark%2Fmobilytik/pipeline?ref=<tag>"`.

## Step 3: Port to skyspark-4.0.6 and release 4.0.6

Work in a worktree: `git worktree add /tmp/wt406 origin/skyspark-4.0.6`, then
`git merge origin/master`. Code from master is written for SkySpark 3.1 and does
not compile on 4.0.6 as is. Fix every file master added or changed:

| 3.1 (master) | 4.0.6 (skyspark-4.0.6) |
|---|---|
| `Proj p` parameters | `XProj p` |
| `Remove.val` in a Diff | `None.val` (xeto::None) |
| `Context.cur`, `Context.cur.proj`, `Context.cur.eval(...)` | `MobilytikRuntime.context`, `.proj`, `.eval(...)` |
| `using haystack` only, with `Dict` / `Ref` / `Grid` | add `using xeto` (Dict, Ref live in xeto on 4.0.6) |
| `version = Version("3.1.12.<api>")` in build.fan | keep the branch's `4.0.6.<api>.0` |
| `.gitlab-ci.yml` | keep the branch's `POD_TEST_EXCLUDE: "SkySpark4Test"` |

Quick check for leftovers before pushing:

```bash
cd skyspark_pod/tools/skysparkExt
grep -rnE "\bProj [a-z]|Remove\.val|Context\.cur" fan
for f in $(grep -rlE "\b(Dict|Ref|Grid|Number|Marker)\b" fan test); do grep -q "^using xeto" $f || echo "missing using xeto: $f"; done
```

Then:

1. Push the branch, run `web-bundle.sh` on its HEAD (the worktree commit, not master).
2. The manual `build_pod_4_0_6` job on a branch pipeline cannot run on its own: it
   fails with `PODREPO_TOKEN: unbound variable` (the token is only given to tag
   pipelines). Use the tag pipeline as the build check.
3. Tag `4.0.6.<api>.<build>` and push. A version number is used once, also after a
   failed run: a failed `4.0.6.6.1` means the next try is `4.0.6.6.2`.
4. The 4.0.6 build cannot run on the Mac unless `~/bassgCommon/dist/skyspark-4.0.6`
   and `~/development/flutter-3.47.5-mobilytik` exist (`scripts/build-skyspark4.sh`).
   Without them the CI tag run is the only compile check.

## Step 4: Verify

- Each tag pipeline `success`, then the version shows as beta in podRepoAdmin.
- A server's podRepoClient shows beta only when its channel is beta; otherwise
  promote to stable in podRepoAdmin.
- Do not tag `v*` (the app release to the stores) until the user has tested the app.

## Common Failures

| Error | Cause | Fix |
|---|---|---|
| `No web bundle for <sha>` | web-bundle.sh not run on the tagged commit | run it on that commit, retry the job |
| `Unknown type 'Ref'` / `'Dict'` in a .fan on 4.0.6 | file from master lacks `using xeto` | add `using xeto` |
| `Unknown type 'Proj'` on 4.0.6 | 3.1 type | `XProj` |
| `Unknown slot Remove.val` on 4.0.6 | 3.1 Diff removal | `None.val` |
| `PODREPO_TOKEN: unbound variable` | manual branch build job | use a tag pipeline |
| local install still shows the old API level | `skyspark.sh` `API_LEVEL` not bumped | change `API_LEVEL=` in skyspark.sh |
