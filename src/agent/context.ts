import { platform, release, arch } from 'node:os';
import { basename } from 'node:path';
import type { ToolRegistry } from '../tools/registry.js';

/** Build the system prompt with environment info and tool summaries */
export function buildSystemPrompt(tools: ToolRegistry): string {
  const cwd = process.cwd();
  const projectName = basename(cwd);
  const toolSummaries = tools.getSummaries().join('\n');

  return `You are kaka, a local AI coding assistant running on the user's machine.
You help with software engineering tasks: reading code, writing code, running commands, debugging, and more.

## Environment
- Working directory: ${cwd}
- Project: ${projectName}
- Platform: ${platform()} ${arch()} (${release()})
- Shell: ${process.env.SHELL || 'sh'}

## Available Tools
${toolSummaries}

## Guidelines
- Read files before modifying them to understand existing code.
- Use edit_file for surgical changes, write_file for new files.
- Use glob and grep to explore the codebase before making changes.
- Use bash to run tests, build commands, and other shell operations.
- Be concise and direct in responses.
- When making code changes, explain what you changed and why.
- If a task is unclear, ask for clarification.
- Prefer editing existing files over creating new ones.
- Do not make unnecessary changes beyond what was asked.`;
}

/**
 * Estimate token count using a simple heuristic.
 * ~4 chars per token for English text is a reasonable approximation.
 * node-llama-cpp has a real tokenizer we can use for more accuracy.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if context compaction is needed.
 * Returns true if history exceeds 75% of context window or 20+ messages.
 */
export function needsCompaction(
  messageCount: number,
  estimatedTokens: number,
  contextSize: number,
): boolean {
  return messageCount > 20 || estimatedTokens > contextSize * 0.75;
}

/**
 * Compact conversation history by summarizing older messages.
 * Keeps the last `keepLast` messages intact.
 */
export function compactHistory(
  messages: Array<{ role: string; content: string }>,
  keepLast: number = 4,
): Array<{ role: string; content: string }> {
  if (messages.length <= keepLast + 1) return messages;

  // Keep system message (index 0) and last N messages
  const system = messages[0];
  const toSummarize = messages.slice(1, messages.length - keepLast);
  const kept = messages.slice(messages.length - keepLast);

  // Create a summary of older messages
  const summaryParts: string[] = [];
  for (const msg of toSummarize) {
    if (msg.role === 'user') {
      summaryParts.push(`User asked: ${msg.content.slice(0, 200)}`);
    } else if (msg.role === 'assistant') {
      summaryParts.push(`Assistant: ${msg.content.slice(0, 200)}`);
    }
  }

  const summaryMessage = {
    role: 'system' as const,
    content: `[Conversation summary - ${toSummarize.length} earlier messages]\n${summaryParts.join('\n')}`,
  };

  return [system, summaryMessage, ...kept];
}
