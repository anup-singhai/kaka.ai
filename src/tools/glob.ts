import { resolve } from 'node:path';
import { glob as globFn } from 'glob';
import type { Tool, ToolResult } from '../types.js';
import { successResult, errorResult } from './result.js';

const MAX_RESULTS = 200;

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The glob pattern (e.g. "**/*.ts", "src/**/*.js")' },
      path: { type: 'string', description: 'Directory to search in (default: current directory)' },
    },
    required: ['pattern'],
  },

  async execute(args): Promise<ToolResult> {
    const pattern = args.pattern as string;
    if (!pattern) return errorResult('pattern is required');

    const cwd = args.path ? resolve(args.path as string) : process.cwd();

    try {
      const matches = await globFn(pattern, {
        cwd,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      if (matches.length === 0) {
        return successResult('No files matched the pattern.');
      }

      let result = matches.slice(0, MAX_RESULTS).join('\n');
      if (matches.length > MAX_RESULTS) {
        result += `\n... (${matches.length - MAX_RESULTS} more files)`;
      }

      return successResult(`${matches.length} files matched:\n${result}`);
    } catch (err) {
      return errorResult(`Glob failed: ${err instanceof Error ? err.message : err}`);
    }
  },
};
