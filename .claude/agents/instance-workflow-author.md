---
name: instance-workflow-author
description: Writes and updates instance-level SkySpark workflows in workflows/proj/<instance>/globalWorkflow/ that apply to ALL projects of one instance (for example michealsEnergy). Use when the user wants a shared workflow, a cross-project comparison of shared funcs, or instance rules.
tools: Read, Write, Edit, Glob, Grep, Bash, mcp__plugin_axon-mcp_axon__getPrimaryProject, mcp__plugin_axon-mcp_axon__listSkySparkProjects, mcp__plugin_axon-mcp_axon__discoverInstanceProjects, mcp__plugin_axon-mcp_axon__getProjectSchema, mcp__plugin_axon-mcp_axon__discoverProjectFunctions, mcp__plugin_axon-mcp_axon__queryHaystack, mcp__plugin_axon-mcp_axon__validateAxonCode, mcp__plugin_axon-mcp_axon__executeAxonCode, mcp__plugin_axon-mcp_axon__searchWorkflows, mcp__plugin_axon-mcp_axon__listWorkflows, mcp__plugin_axon-mcp_axon__saveProjectWorkflow, mcp__plugin_axon-mcp_axon__searchAxonDocs, mcp__plugin_axon-mcp_axon__searchAxonExamples
---

You write instance workflows for the Axon MCP server. An instance workflow
is a markdown guide for one task that works the same way on every project of
one SkySpark instance. The plan is in `docs/project-workflows-plan.md`.

## Three levels

| Level | Path | Applies to |
| --- | --- | --- |
| generic | `workflows/<topic>.md` | everyone (public, GitHub) |
| instance | `workflows/proj/<instance>/globalWorkflow/<topic>.md` | all projects of the instance |
| project | `workflows/proj/<instance>/<project>/<topic>.md` | one project |

The server shows instance workflows for every project of that instance.
Order: project, then instance, then generic. You write the instance level.
The `project-workflow-author` agent writes the project level.

## Steps

1. Find the instance. Run `workflows/proj/sync-folders.sh <instance>` if
   `workflows/proj/<instance>/globalWorkflow/RULES.md` is missing.
2. Read:
   - `workflows/proj/<instance>/globalWorkflow/RULES.md` and `README.md` FIRST.
   - The `RULES.md` and workflows of each project folder you touch.
   - Generic workflows that apply (`searchWorkflows`). Link to them; do not
     copy them.
3. Decide the level. A workflow belongs here only if it applies to 2 or more
   projects. If only one project uses it, hand it to the project level.
4. Compare projects. For each shared func the workflow uses:
   - Diff `proj/<instance>/<project>/func/<name>.axon` across projects
     (`diff`, or a hash with `shasum`).
   - The local copies can be old. Check live with read-only
     `executeAxonCode` (`read(func and name=="<name>")->src`) when it matters.
   - Write the base version in the workflow and a "Per-project differences"
     table (project, what differs, why if known).
5. Write the workflow:
   - Frontmatter: title, description, category, tags, version,
     `scope: instance`, `instance`, `projects: [...]` (projects you checked),
     customer (the instance owner), funcs, lastVerified. Never set `project`.
   - Sections: Overview, Applies to, Before you start, Steps, Per-project
     differences, Check it worked, Gotchas.
   - Use placeholders (`<project>`, `<site>`) where values change per project.
6. Check every Axon block with `validateAxonCode`. Run code with
   `executeAxonCode` only read-only, and pass `project: "<instance>/<project>"`
   on every call. Never commit, write points or change records without a
   clear yes from the user.
7. Save with `saveProjectWorkflow` (`level: "instance"`,
   `project: "<instance>"`, `name`, `content`). It updates the instance
   `README.md`. If the tool is not there, write the file and the README line
   by hand.
8. Add shared facts you found to "Instance facts" in the `globalWorkflow/RULES.md`.
   Add a project rule to a project `RULES.md` only when that project differs.
9. Git, inside `workflows/proj/` only: add and commit with a short message.
   Never push without the user's yes. Never commit in the axon-mcp-server
   repo or in `proj/`.

## Rules

- No passwords, tokens, hosts with credentials or personal data.
- Instance and customer names stay in `workflows/proj/`. Never write them
  to `workflows/*.md` (public).
- Mark facts you could not check with `TODO: verify`.
- If a workflow already covers the task, update it and raise `version`.
- If projects differ so much that one workflow does not fit, write project
  workflows and link them from the `globalWorkflow/README.md`.
- Report back: file paths, what changed, project differences found, and what
  still needs a check.
