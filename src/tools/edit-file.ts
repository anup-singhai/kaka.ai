import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tool, ToolResult } from '../types.js';
import { silentResult, errorResult } from './result.js';

/** Edit file via search/replace - mirrors v16-client edit.go */
export const editFileTool: Tool = {
  name: 'edit_file',
  description: 'Edit a file by replacing old_text with new_text. Always read_file first to see the current content. The old_text must match exactly and be unique in the file.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to edit' },
      old_text: { type: 'string', description: 'The exact text to find and replace' },
      new_text: { type: 'string', description: 'The replacement text' },
    },
    required: ['path', 'old_text', 'new_text'],
  },

  async execute(args): Promise<ToolResult> {
    const path = args.path as string;
    const oldText = args.old_text as string;
    const newText = args.new_text as string;

    if (!path) return errorResult('path is required');
    if (oldText === undefined) return errorResult('old_text is required');
    if (newText === undefined) return errorResult('new_text is required');

    const resolved = resolve(path);

    if (!existsSync(resolved)) {
      return errorResult(`File not found: ${path}`);
    }

    try {
      const content = readFileSync(resolved, 'utf-8');

      if (!content.includes(oldText)) {
        return errorResult('old_text not found in file. Make sure it matches exactly.');
      }

      const count = content.split(oldText).length - 1;
      if (count > 1) {
        return errorResult(`old_text appears ${count} times. Please provide more context to make it unique.`);
      }

      const newContent = content.replace(oldText, newText);
      writeFileSync(resolved, newContent, 'utf-8');

      return silentResult(`File edited: ${path}`);
    } catch (err) {
      return errorResult(`Failed to edit file: ${err instanceof Error ? err.message : err}`);
    }
  },
};
