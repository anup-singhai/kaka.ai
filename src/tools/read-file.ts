import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tool, ToolResult } from '../types.js';
import { successResult, errorResult } from './result.js';

const MAX_FILE_SIZE = 100 * 1024; // 100KB

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read a file and return its contents with line numbers. Supports offset and limit for large files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to read' },
      offset: { type: 'string', description: 'Line number to start from (1-based)' },
      limit: { type: 'string', description: 'Maximum number of lines to read' },
    },
    required: ['path'],
  },

  async execute(args): Promise<ToolResult> {
    const path = args.path as string;
    if (!path) return errorResult('path is required');

    const resolved = resolve(path);

    try {
      const stat = statSync(resolved);
      if (stat.size > MAX_FILE_SIZE) {
        return errorResult(`File too large (${(stat.size / 1024).toFixed(1)}KB). Max: ${MAX_FILE_SIZE / 1024}KB. Use offset/limit.`);
      }
    } catch {
      return errorResult(`File not found: ${path}`);
    }

    try {
      const content = readFileSync(resolved, 'utf-8');
      const lines = content.split('\n');

      const offset = args.offset ? parseInt(args.offset as string, 10) - 1 : 0;
      const limit = args.limit ? parseInt(args.limit as string, 10) : lines.length;

      const sliced = lines.slice(offset, offset + limit);
      const numbered = sliced.map((line, i) => `${String(offset + i + 1).padStart(6)}\t${line}`);

      return successResult(numbered.join('\n'));
    } catch (err) {
      return errorResult(`Failed to read file: ${err instanceof Error ? err.message : err}`);
    }
  },
};
