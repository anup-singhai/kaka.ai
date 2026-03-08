import type { Tool, ToolResult } from '../types.js';
import { errorResult } from './result.js';

/** Tool registry - mirrors v16-client registry.go */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResult(`Tool "${name}" not found`);
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`Tool "${name}" threw: ${msg}`);
    }
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  count(): number {
    return this.tools.size;
  }

  /** Human-readable summaries for system prompt */
  getSummaries(): string[] {
    return this.getAll().map(t => `- \`${t.name}\` - ${t.description}`);
  }
}
