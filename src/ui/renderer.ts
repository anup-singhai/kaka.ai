import type { ToolResult } from '../types.js';

let chalk: any;
let ora: any;
let Marked: any;
let markedTerminal: any;

/** Lazy-load ESM dependencies */
async function loadDeps() {
  if (!chalk) {
    chalk = (await import('chalk')).default;
    ora = (await import('ora')).default;
    const markedMod = await import('marked');
    Marked = markedMod.Marked;
    markedTerminal = (await import('marked-terminal')).markedTerminal;
  }
}

export class Renderer {
  private spinner: any = null;
  private streamBuffer = '';
  private marked: any = null;
  private _hadOutput = false;

  async init(): Promise<void> {
    await loadDeps();
    this.marked = new Marked(markedTerminal());
  }

  /** Show a spinner with a message */
  startSpinner(message: string): void {
    if (this.spinner) this.spinner.stop();
    this.spinner = ora({ text: message, color: 'cyan' }).start();
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /** Handle streaming text chunk - buffer for final markdown render */
  onTextChunk(chunk: string): void {
    this.stopSpinner();
    this.streamBuffer += chunk;
    this._hadOutput = true;
  }

  /** Finish streaming - render the buffered content as formatted markdown */
  finishStream(): void {
    if (this.streamBuffer) {
      const text = this.streamBuffer;
      this.streamBuffer = '';
      this.renderMarkdown(text);
    }
    this._hadOutput = false;
  }

  /** Check if streaming produced any output (reset after finishStream) */
  hadStreamOutput(): boolean {
    return this._hadOutput;
  }

  /** Display a tool call notification */
  showToolCall(name: string, args: Record<string, unknown>): void {
    this.stopSpinner();
    const preview = formatArgs(name, args);
    console.log(chalk.dim(`  [tool] ${name}(${preview})`));
  }

  /** Display a tool result */
  showToolResult(name: string, result: ToolResult): void {
    if (result.silent) return;

    if (result.isError) {
      console.log(chalk.red(`  [error] ${result.content.slice(0, 200)}`));
    } else {
      const preview = result.content.length > 200
        ? result.content.slice(0, 200) + '...'
        : result.content;
      console.log(chalk.dim(`  [result] ${preview}`));
    }
  }

  /** Display denial message */
  showDenied(name: string, reason: string): void {
    console.log(chalk.yellow(`  [denied] ${name}: ${reason}`));
  }

  /** Render a complete markdown response */
  renderMarkdown(text: string): void {
    if (!text) return;
    if (this.marked) {
      const rendered = this.marked.parse(text);
      process.stdout.write(rendered);
    } else {
      console.log(text);
    }
  }

  /** Show welcome banner */
  showWelcome(): void {
    console.log(chalk.bold('\n  kaka') + chalk.dim(' - local AI coding agent'));
    console.log(chalk.dim(`  cwd: ${process.cwd()}\n`));
  }

  /** Show model info after loading */
  showModelInfo(contextSize: number, loadTimeMs: number): void {
    console.log(chalk.green(`  Model loaded`) + chalk.dim(` in ${(loadTimeMs / 1000).toFixed(1)}s | Metal GPU | ${contextSize / 1024}K context\n`));
  }

  /** Show error */
  showError(message: string): void {
    this.stopSpinner();
    console.error(chalk.red(`\n  Error: ${message}\n`));
  }

  /** Show info */
  showInfo(message: string): void {
    console.log(chalk.dim(`  ${message}`));
  }
}

function formatArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'bash') {
    return JSON.stringify(args.command ?? '');
  }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(args)) {
    const str = typeof val === 'string'
      ? (val.length > 60 ? val.slice(0, 60) + '...' : val)
      : JSON.stringify(val);
    parts.push(`${key}=${JSON.stringify(str)}`);
  }
  return parts.join(', ');
}
