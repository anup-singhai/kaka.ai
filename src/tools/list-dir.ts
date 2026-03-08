import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Tool, ToolResult } from '../types.js';
import { successResult, errorResult } from './result.js';

export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List directory contents with type indicators (/ for dirs, * for executables). Use this as the first step to understand project structure.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list (default: current directory)' },
    },
  },

  async execute(args): Promise<ToolResult> {
    const dirPath = args.path ? resolve(args.path as string) : process.cwd();

    try {
      const entries = readdirSync(dirPath);
      const lines: string[] = [];

      for (const entry of entries) {
        // Skip hidden files starting with .
        if (entry.startsWith('.')) continue;

        try {
          const fullPath = join(dirPath, entry);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            lines.push(`${entry}/`);
          } else if (stat.mode & 0o111) {
            lines.push(`${entry}*`);
          } else {
            lines.push(entry);
          }
        } catch {
          lines.push(entry);
        }
      }

      if (lines.length === 0) {
        return successResult('(empty directory)');
      }

      return successResult(lines.join('\n'));
    } catch (err) {
      return errorResult(`Failed to list directory: ${err instanceof Error ? err.message : err}`);
    }
  },
};
