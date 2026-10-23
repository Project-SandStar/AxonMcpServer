# Plan: Project-Based Workflows

Status: phases 1-3 done (2026-10-23)

## Goal

Keep generic workflows (`workflows/*.md`) public on GitHub. Keep customer
workflows private on gitlab.bas.co, one folder per SkySpark project. The MCP
server loads both, and shows the active project's workflows first.

## Current state

- `WorkflowManager` reads only `workflows/*.md`. It does not read sub-folders,
  so files in `workflows/proj/` do not load today.
- `fs.watch` on `workflows/` is not recursive.
- `.gitignore` rule `proj/` already matches `workflows/proj/`, so GitHub never
  gets these files. (We add an explicit line to make this clear.)
- `claudePlugin/scripts/build.mjs` reads only `workflows/*.md`. Customer
  workflows do not go into the public plugin. Keep it that way.

## Folder layout

Mirror the layout of `proj/` so the server can match the active project:

```
workflows/
  *.md                                  generic, public (GitHub)
  proj/                                 own git repo -> gitlab.bas.co
    README.md
    _template.md                        copy this to start a new workflow
    <instance>/<project>/
      README.md                         project index: site, key funcs, links
      <topic>.md                        one workflow per task
```

Example: `workflows/proj/<instance>/<project>/restart-task.md`.

## Frontmatter

Generic fields stay the same. Project workflows add these fields:

```yaml
---
title: Restart the pulse task
description: Steps to stop, fix and restart a scheduled task
category: operations
tags: [task, obsSchedule]
version: 1.0
scope: project                 # generic | project
instance: <instance>
project: <project>
customer: <customer name>
funcs: [myTask_run]            # funcs this workflow uses
lastVerified: 2026-10-23       # date someone last ran it with success
---
```

The server takes `instance` and `project` from the folder path if the
frontmatter does not give them.

## Server changes (`src/workflows/`)

1. Load files from sub-folders. Workflow id for project files:
   `proj/<instance>/<project>/<file>`. Generic ids do not change.
2. Watch `workflows/` with `{ recursive: true }` (macOS supports this).
3. Add `scope`, `instance`, `project`, `customer`, `funcs`, `lastVerified` to
   `WorkflowMetadata`.
4. `listWorkflows` and `searchWorkflows` get a `project` argument. With no
   argument, they use the session's active project. Results show the active
   project's workflows first, then generic ones. They hide other projects'
   workflows unless `project: "*"`.
5. Add tool `saveProjectWorkflow({ project, name, content })`. It writes to
   the correct folder and checks the frontmatter. It does not commit.
6. `switchSkySparkProject` result lists the workflow titles for that project,
   so the AI sees them at once.
7. Tests: loader, id format, project filter, and a test that
   `claudePlugin` build output has no file from `workflows/proj/`.

## Git and GitLab

- `workflows/proj/` is its own git repo, like `proj/`.
- Remote: one repo for all projects, https://gitlab.bas.co/openbassg/skyspark/AxonProjWorkflows
- Each project folder has a `RULES.md` (rules for reading and adding
  workflows) and a `README.md` (index). `sync-folders.sh <instance>` adds
  folders for new projects.
- The agent commits locally. It pushes only when the user says so.
- No credentials, hosts, passwords or tokens in any workflow file.

## The agent

File: `.claude/agents/project-workflow-author.md`. It:

1. Finds the target project (from the user, or `getPrimaryProject`).
2. Collects facts: `getProjectSchema`, funcs in `proj/<instance>/<project>/`,
   the project memory notes, and related generic workflows.
3. Writes the workflow from `_template.md`.
4. Checks every Axon block with `validateAxonCode`. Runs read-only code
   with `executeAxonCode` only if the user agrees.
5. Saves the file and updates the project `README.md` index.
6. Commits in `workflows/proj/`. Asks before it pushes.

## Daily use

1. Open a session and switch to a project.
2. The server shows that project's workflows.
3. Ask "how do I X here?" The AI calls `searchWorkflows` and follows the
   project workflow first, then the generic one.
4. When a workflow is wrong or old, ask the agent to fix it and set
   `lastVerified`.

## Phases

| Phase | Work | Result |
| --- | --- | --- |
| 1 | Folder, template, git repo, agent | We can write workflows now (files only) |
| 2 | Recursive loader, metadata, project filter, tests | MCP tools find them |
| 3 | `saveProjectWorkflow`, list on project switch | Less manual work |
| 4 | Write the first workflows per project | Real content |

## Decisions

1. One GitLab repo for all projects: `openbassg/skyspark/AxonProjWorkflows`.
2. The agent file and this plan go to GitHub. They have no customer data.
