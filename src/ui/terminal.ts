import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export class Terminal {
  private rl: ReadlineInterface | null = null;
  private abortController: AbortController | null = null;

  /** Get user input with prompt. Creates a fresh readline each time for robustness. */
  async prompt(): Promise<string | null> {
    // Close previous readline if still open
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    try {
      this.rl = createInterface({
        input: stdin,
        output: stdout,
        terminal: true,
      });

      const input = await this.rl.question('\n> ');
      return input.trim();
    } catch {
      return null;
    } finally {
      if (this.rl) {
        this.rl.close();
        this.rl = null;
      }
    }
  }

  /** Create an AbortController for the current operation */
  createAbortController(): AbortController {
    this.abortController = new AbortController();
    return this.abortController;
  }

  /** Abort current operation */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** Close the terminal */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /** Check if input is a special command */
  static parseCommand(input: string): { command: string; args: string } | null {
    if (!input.startsWith('/')) return null;

    const spaceIdx = input.indexOf(' ');
    if (spaceIdx === -1) {
      return { command: input.slice(1), args: '' };
    }
    return {
      command: input.slice(1, spaceIdx),
      args: input.slice(spaceIdx + 1).trim(),
    };
  }
}
