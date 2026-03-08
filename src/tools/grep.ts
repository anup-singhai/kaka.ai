import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { Tool, ToolResult } from '../types.js';
import { successResult, errorResult } from './result.js';

const MAX_OUTPUT = 50_000;

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search file contents for a pattern. Returns matching lines with file paths and line numbers. Use this to find function definitions, imports, usages, and specific code patterns.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The search pattern (regex supported)' },
      path: { type: 'string', description: 'Directory or file to search in (default: current directory)' },
      include: { type: 'string', description: 'File pattern to include (e.g. "*.ts", "*.py")' },
    },
    required: ['pattern'],
  },

  async execute(args): Promise<ToolResult> {
    const pattern = args.pattern as string;
    if (!pattern) return errorResult('pattern is required');

    const searchPath = args.path ? resolve(args.path as string) : process.cwd();
    const include = args.include as string | undefined;

    // Try rg first, fall back to grep
    const useRg = await commandExists('rg');

    const cmdArgs: string[] = [];
    if (useRg) {
      cmdArgs.push('rg', '-n', '--no-heading', '--color=never');
      if (include) cmdArgs.push('--glob', include);
      cmdArgs.push('--', pattern, searchPath);
    } else {
      cmdArgs.push('grep', '-rn', '--color=never');
      if (include) cmdArgs.push('--include', include);
      cmdArgs.push('--', pattern, searchPath);
    }

    return new Promise((resolvePromise) => {
      const proc = spawn(cmdArgs[0], cmdArgs.slice(1), {
        timeout: 30_000,
      });

      let output = '';
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        // Stop collecting if too large
        if (output.length > MAX_OUTPUT * 2) {
          proc.kill();
        }
      });

      proc.stderr.on('data', () => { /* ignore */ });

      proc.on('close', (code) => {
        if (!output && code === 1) {
          resolvePromise(successResult('No matches found.'));
          return;
        }

        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + `\n... (truncated)`;
        }

        resolvePromise(successResult(output || 'No matches found.'));
      });

      proc.on('error', () => {
        resolvePromise(errorResult('grep/rg command not available'));
      });
    });
  },
};

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [cmd]);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}
