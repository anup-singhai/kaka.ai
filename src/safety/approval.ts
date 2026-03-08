import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { ApprovalDecision, SafetyConfig } from '../types.js';

/** Tools that are always safe to auto-approve */
const READ_ONLY_TOOLS = new Set(['read_file', 'glob', 'grep', 'list_dir']);

/** Tools that modify files */
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);

/** Deny patterns - hard block, mirrors v16-client shell.go */
const DENY_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\b(format|mkfs|diskpart)\b\s/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd[a-z]\b/,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/,
];

export class ApprovalSystem {
  private config: SafetyConfig;
  private alwaysApproved = new Set<string>();

  constructor(config: SafetyConfig) {
    this.config = config;
  }

  /**
   * Check if a tool call should be approved.
   * Returns 'allow' if auto-approved, 'deny' if hard-blocked, or prompts user.
   */
  async check(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ApprovalDecision> {
    // Hard deny for dangerous bash commands
    if (toolName === 'bash' && args.command) {
      const cmd = (args.command as string).toLowerCase().trim();
      for (const pattern of DENY_PATTERNS) {
        if (pattern.test(cmd)) {
          return 'deny';
        }
      }
    }

    // No approval needed
    if (this.config.requireApproval === 'none') return 'allow';

    // Read-only tools always auto-approved
    if (READ_ONLY_TOOLS.has(toolName)) return 'allow';

    // Check session-level always-approved
    if (this.alwaysApproved.has(toolName)) return 'allow';

    // Write tools: auto-approve if config says 'all' only requires approval
    if (WRITE_TOOLS.has(toolName) && this.config.requireApproval !== 'all') {
      return 'allow';
    }

    // Prompt user
    return this.promptUser(toolName, args);
  }

  private async promptUser(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ApprovalDecision> {
    const rl = createInterface({ input: stdin, output: stdout });

    let preview: string;
    if (toolName === 'bash') {
      preview = args.command as string;
    } else {
      const pairs = Object.entries(args).map(([k, v]) => {
        const val = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '...' : v;
        return `${k}=${JSON.stringify(val)}`;
      });
      preview = pairs.join(', ');
    }

    const answer = await rl.question(
      `\n  Allow ${toolName}(${preview})?\n  [y]es / [n]o / [a]lways > `,
    );
    rl.close();

    const choice = answer.trim().toLowerCase();
    if (choice === 'y' || choice === 'yes') return 'allow';
    if (choice === 'a' || choice === 'always') {
      this.alwaysApproved.add(toolName);
      return 'always';
    }
    return 'deny';
  }
}
