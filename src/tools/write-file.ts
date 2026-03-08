import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Tool, ToolResult } from '../types.js';
import { silentResult, errorResult } from './result.js';

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file. Creates parent directories automatically. Overwrites existing files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to write' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['path', 'content'],
  },

  async execute(args): Promise<ToolResult> {
    const path = args.path as string;
    const content = args.content as string;
    if (!path) return errorResult('path is required');
    if (content === undefined) return errorResult('content is required');

    const resolved = resolve(path);

    try {
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, content, 'utf-8');
      return silentResult(`File written: ${path} (${content.length} chars)`);
    } catch (err) {
      return errorResult(`Failed to write file: ${err instanceof Error ? err.message : err}`);
    }
  },
};
