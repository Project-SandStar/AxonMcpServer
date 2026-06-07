/**
 * Workflow summary generation.
 *
 * Two paths:
 *   - generateLocalSummary: deterministic extraction from frontmatter +
 *     intro paragraph + step headings. No network. Default for every workflow.
 *   - generateClaudeSummary: opt-in AI summary via Anthropic. Triggered from
 *     the admin "Summarize with Claude" button.
 */

import type { Workflow } from './workflowManager.js';
import { getAnthropicApiKey } from '../admin/secretsStore.js';

export interface WorkflowSummary {
  id: string;
  title: string;
  summary: string;
  mode: 'local' | 'claude';
  generatedAt: string;
  sourceMtime: number;
  model?: string;
}

const MAX_SUMMARY_CHARS = 600;
const MAX_STEP_HEADINGS = 8;

function firstParagraph(body: string): string {
  for (const block of body.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (/^[-*]\s/.test(trimmed)) continue;
    return trimmed.replace(/\s+/g, ' ');
  }
  return '';
}

function extractStepHeadings(body: string): string[] {
  const headings: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) headings.push(m[1].replace(/\s+/g, ' '));
    if (headings.length >= MAX_STEP_HEADINGS) break;
  }
  return headings;
}

export function generateLocalSummary(workflow: Workflow, sourceMtime: number): WorkflowSummary {
  const parts: string[] = [];
  if (workflow.metadata.description) {
    parts.push(workflow.metadata.description);
  }

  const intro = firstParagraph(workflow.content);
  if (intro && intro !== workflow.metadata.description) {
    parts.push(intro);
  }

  const steps = extractStepHeadings(workflow.content);
  if (steps.length > 0) {
    parts.push(`Steps: ${steps.join(' → ')}`);
  }

  let summary = parts.join(' — ').trim();
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd() + '…';
  }
  if (!summary) summary = workflow.metadata.title;

  return {
    id: workflow.metadata.id,
    title: workflow.metadata.title,
    summary,
    mode: 'local',
    generatedAt: new Date().toISOString(),
    sourceMtime,
  };
}

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const CLAUDE_PROMPT_PREFIX =
  'Summarize this Axon workflow for an AI coding agent that needs to decide whether to load the full markdown content. ' +
  'Two to three sentences. Mention the trigger/entry condition, the main steps, and the outcome. No preamble, no markdown, no headings.';

export class AnthropicNotConfiguredError extends Error {
  constructor() {
    super('Anthropic API key is not configured (set in /dashboard/settings or ANTHROPIC_API_KEY env).');
    this.name = 'AnthropicNotConfiguredError';
  }
}

export async function generateClaudeSummary(workflow: Workflow, sourceMtime: number): Promise<WorkflowSummary> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) throw new AnthropicNotConfiguredError();

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `${CLAUDE_PROMPT_PREFIX}\n\n---\n${workflow.fullContent}`,
      },
    ],
  });

  const textPart = message.content.find((p: any) => p.type === 'text') as { type: 'text'; text: string } | undefined;
  const summary = (textPart?.text ?? '').trim() || workflow.metadata.description || workflow.metadata.title;

  return {
    id: workflow.metadata.id,
    title: workflow.metadata.title,
    summary,
    mode: 'claude',
    generatedAt: new Date().toISOString(),
    sourceMtime,
    model: CLAUDE_MODEL,
  };
}

/**
 * Quick-and-cheap connectivity check for the API key panel "Test" button.
 * Sends a 1-token request and reports latency.
 */
export async function testAnthropicKey(): Promise<{ ok: true; latencyMs: number; model: string } | { ok: false; error: string }> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) return { ok: false, error: 'No API key configured' };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const t0 = Date.now();
    await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ok' }],
    });
    return { ok: true, latencyMs: Date.now() - t0, model: CLAUDE_MODEL };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
