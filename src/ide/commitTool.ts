/**
 * The commitAxonFunction MCP tool, without the server around it: how its
 * arguments become CommitArgs, and how a CommitResult becomes the tool reply.
 * The commit itself is commitFunction() in commitFunction.ts, the same one the
 * IDE API calls.
 */
import type { CommitArgs, CommitResult } from './commitFunction.js';

/** The arguments of the commitAxonFunction tool. */
export interface CommitToolArgs {
  name: string;
  src: string;
  doc?: string | null;
  expectedMod?: string | null;
  project?: string;
  appName?: string;
  view?: string;
  dis?: string;
  icon?: string;
  order?: number;
  extraTags?: Record<string, any>;
}

/** The reply of an MCP tool. */
export interface ToolReply {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * CommitArgs for the shared commit. `doc` left out (or null) keeps the stored
 * doc; `expectedMod` left out means no stale-write check.
 */
export function toCommitArgs(args: CommitToolArgs): CommitArgs {
  const tags: Record<string, unknown> = { ...(args.extraTags || {}) };
  if (args.appName !== undefined) tags.appName = args.appName;
  if (args.view !== undefined) tags.view = args.view;
  if (args.dis !== undefined) tags.dis = args.dis;
  if (args.icon !== undefined) tags.icon = args.icon;
  if (args.order !== undefined) tags.order = args.order;

  const out: CommitArgs = { name: args.name, src: args.src, extraTags: tags };
  if (args.doc !== undefined && args.doc !== null) out.doc = args.doc;
  if (args.expectedMod !== undefined) out.expectedMod = args.expectedMod;
  return out;
}

/** The tool reply for a commit result. A conflict is an error reply; nothing was written. */
export function commitToolReply(
  result: CommitResult, where: { name: string; instance: string; project: string; warning?: string }
): ToolReply {
  const { name, instance, project } = where;
  const text = (body: unknown) => [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }];

  if (result.status === 'conflict') {
    const message = result.exists
      ? `Function ${name} has changed in ${instance}/${project} since expectedMod. Nothing was committed. Read it again, merge, and retry with the new mod.`
      : `Function ${name} is not in ${instance}/${project} any more. Nothing was committed. Retry with expectedMod null to add it.`;
    return {
      isError: true,
      content: text({
        success: false,
        status: 'conflict',
        name,
        instance,
        project,
        exists: result.exists,
        mod: result.mod,
        hash: result.hash,
        warning: where.warning,
        message,
      }),
    };
  }

  const warning = [where.warning, result.warning].filter(Boolean).join(' ') || undefined;
  return {
    content: text({
      success: true,
      status: 'ok',
      name,
      operation: result.operation,
      instance,
      project,
      mod: result.mod,
      hash: result.hash,
      doc: result.doc,
      backedUp: result.backedUp,
      backupPath: result.backupPath,
      removedDuplicates: result.removedDuplicates,
      localCopy: result.localCopy,
      warning,
      message: `Function ${name} ${result.operation} in ${instance}/${project}`,
    }),
  };
}
