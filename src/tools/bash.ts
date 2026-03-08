import { spawn } from 'node:child_process';
import type { Tool, ToolResult } from '../types.js';
import { errorResult } from './result.js';

const MAX_OUTPUT = 10_000;
const DEFAULT_TIMEOUT = 120_000; // 120 seconds

/** Deny patterns - mirrors v16-client shell.go lines 25-34 */
const DENY_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\b(format|mkfs|diskpart)\b\s/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd[a-z]\b/,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/,  // fork bomb
];

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command and return its output. Use for git operations, running tests, builds, and other terminal tasks. Requires user approval.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'string', description: 'Timeout in milliseconds (default: 120000)' },
    },
    required: ['command'],
  },

  async execute(args): Promise<ToolResult> {
    const command = args.command as string;
    if (!command) return errorResult('command is required');

    const timeout = args.timeout ? parseInt(args.timeout as string, 10) : DEFAULT_TIMEOUT;

    // Safety check - deny dangerous patterns
    const guardError = guardCommand(command);
    if (guardError) return errorResult(guardError);

    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd: process.cwd(),
        timeout,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        let output = stdout;
        if (stderr) {
          output += (output ? '\n' : '') + 'STDERR:\n' + stderr;
        }
        if (code !== 0 && code !== null) {
          output += `\nExit code: ${code}`;
        }

        if (!output) output = '(no output)';

        // Truncate
        if (output.length > MAX_OUTPUT) {
          const remaining = output.length - MAX_OUTPUT;
          output = output.slice(0, MAX_OUTPUT) + `\n... (truncated, ${remaining} more chars)`;
        }

        resolve({
          content: output,
          isError: code !== 0 && code !== null,
          silent: false,
        });
      });

      proc.on('error', (err) => {
        resolve(errorResult(`Command failed: ${err.message}`));
      });
    });
  },
};

function guardCommand(command: string): string | null {
  const lower = command.toLowerCase().trim();
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(lower)) {
      return 'Command blocked by safety guard (dangerous pattern detected)';
    }
  }
  return null;
}
