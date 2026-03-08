import type { ToolResult } from '../types.js';

const MAX_CONTENT_LENGTH = 30_000;

export function successResult(content: string): ToolResult {
  return { content: truncate(content), isError: false, silent: false };
}

export function silentResult(content: string): ToolResult {
  return { content: truncate(content), isError: false, silent: true };
}

export function errorResult(message: string): ToolResult {
  return { content: message, isError: true, silent: false };
}

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  const remaining = text.length - MAX_CONTENT_LENGTH;
  return text.slice(0, MAX_CONTENT_LENGTH) + `\n... (truncated, ${remaining} more chars)`;
}
