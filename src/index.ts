import { parseArgs, loadConfig } from './config.js';
import { resolveModelPath, loadModel } from './model/loader.js';
import { Provider } from './model/provider.js';
import { ToolRegistry } from './tools/registry.js';
import { readFileTool } from './tools/read-file.js';
import { writeFileTool } from './tools/write-file.js';
import { editFileTool } from './tools/edit-file.js';
import { bashTool } from './tools/bash.js';
import { globTool } from './tools/glob.js';
import { grepTool } from './tools/grep.js';
import { listDirTool } from './tools/list-dir.js';
import { ApprovalSystem } from './safety/approval.js';
import { SessionManager } from './agent/session.js';
import { AgentLoop } from './agent/loop.js';
import { Renderer } from './ui/renderer.js';
import { Terminal } from './ui/terminal.js';

const VERSION = '0.1.0';

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = loadConfig(cliArgs);

  // Handle --version
  if (cliArgs.version) {
    console.log(`kaka ${VERSION}`);
    process.exit(0);
  }

  // Handle --help
  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  // Initialize renderer
  const renderer = new Renderer();
  await renderer.init();

  // Handle --sessions
  const sessions = new SessionManager(config.session.dir);
  if (cliArgs.sessions) {
    const list = sessions.list();
    if (list.length === 0) {
      console.log('No sessions found.');
    } else {
      console.log('\nSessions:\n');
      for (const s of list) {
        console.log(`  ${s.id}  ${s.cwd}  (${s.messageCount} messages, ${s.updatedAt})`);
      }
      console.log();
    }
    process.exit(0);
  }

  renderer.showWelcome();

  // Load or resume session
  let session;
  if (cliArgs.continue) {
    session = sessions.load(cliArgs.continue);
    if (!session) {
      renderer.showError(`Session "${cliArgs.continue}" not found.`);
      process.exit(1);
    }
    renderer.showInfo(`Resumed session ${session.id} (${session.messages.length} messages)`);
  } else {
    session = sessions.create();
  }

  // Download/load model
  renderer.startSpinner('Loading model...');
  const startTime = Date.now();

  let modelPath: string;
  try {
    renderer.stopSpinner();
    modelPath = await resolveModelPath(config.model);
  } catch (err) {
    renderer.showError(`Model download failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  renderer.startSpinner('Initializing model...');
  let provider: Provider;
  try {
    const { model, context, contextSize } = await loadModel(modelPath, config.model);
    config.model.contextSize = contextSize;
    provider = new Provider(model, context, config.agent);
    const loadTime = Date.now() - startTime;
    renderer.stopSpinner();
    renderer.showModelInfo(contextSize, loadTime);
  } catch (err) {
    renderer.showError(`Model loading failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Register tools
  const tools = new ToolRegistry();
  tools.register(readFileTool);
  tools.register(writeFileTool);
  tools.register(editFileTool);
  tools.register(bashTool);
  tools.register(globTool);
  tools.register(grepTool);
  tools.register(listDirTool);

  // Create agent
  const approval = new ApprovalSystem(config.safety);
  const agent = new AgentLoop(provider, tools, approval, sessions, config, session);

  // One-shot mode
  if (cliArgs.prompt) {
    await processMessage(agent, cliArgs.prompt, renderer);
    await provider.dispose();
    process.exit(0);
  }

  // Interactive REPL
  const terminal = new Terminal();

  // Handle Ctrl+C
  let ctrlCCount = 0;
  process.on('SIGINT', () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log('\nExiting...');
      provider.dispose();
      process.exit(0);
    }
    terminal.abort();
    console.log('\n(Press Ctrl+C again to exit)');
    setTimeout(() => { ctrlCCount = 0; }, 1000);
  });

  // REPL loop
  while (true) {
    const input = await terminal.prompt();

    if (input === null) {
      // EOF or closed
      break;
    }

    if (!input) continue;

    // Handle special commands
    const cmd = Terminal.parseCommand(input);
    if (cmd) {
      switch (cmd.command) {
        case 'exit':
        case 'quit':
          console.log('Goodbye!');
          await provider.dispose();
          terminal.close();
          process.exit(0);
          break;
        case 'clear':
          session = sessions.create();
          // Re-create agent with new session
          const newAgent = new AgentLoop(provider, tools, approval, sessions, config, session);
          Object.assign(agent, newAgent);
          console.log('Session cleared.');
          continue;
        case 'sessions':
          const list = sessions.list();
          if (list.length === 0) {
            console.log('No saved sessions.');
          } else {
            for (const s of list) {
              console.log(`  ${s.id}  ${s.cwd}  (${s.messageCount} messages)`);
            }
          }
          continue;
        case 'help':
          printREPLHelp();
          continue;
        case 'model':
          console.log(`Context size: ${config.model.contextSize}`);
          console.log(`Temperature: ${config.agent.temperature}`);
          console.log(`Max iterations: ${config.agent.maxIterations}`);
          continue;
        default:
          console.log(`Unknown command: /${cmd.command}. Type /help for available commands.`);
          continue;
      }
    }

    await processMessage(agent, input, renderer);
  }

  await provider.dispose();
  terminal.close();
}

async function processMessage(agent: AgentLoop, input: string, renderer: Renderer): Promise<void> {
  try {
    const response = await agent.processMessage(input, {
      onText: (chunk) => renderer.onTextChunk(chunk),
      onToolCall: (name, args) => renderer.showToolCall(name, args),
      onToolResult: (name, result) => renderer.showToolResult(name, result),
      onDenied: (name, reason) => renderer.showDenied(name, reason),
      onThinking: (msg) => renderer.startSpinner(msg),
    });

    renderer.finishStream();

    // If streaming didn't produce output, render the full response
    if (response && !renderer.hadStreamOutput()) {
      renderer.renderMarkdown(response);
    }
  } catch (err) {
    renderer.showError(err instanceof Error ? err.message : String(err));
  }
}

function printHelp(): void {
  console.log(`
kaka - Local AI coding agent powered by Qwen3.5-35B-A3B

Usage:
  kaka                            Interactive REPL
  kaka "fix the bug in app.ts"    One-shot mode
  kaka --continue <id>            Resume a session
  kaka --sessions                 List saved sessions

Options:
  --context-size <n>     Override context window size (default: 32768)
  --model-path <path>    Use a custom GGUF model file
  --no-approval          Auto-approve all tool calls (use with caution)
  --temperature <n>      Set temperature (default: 0.7)
  -v, --version          Show version
  -h, --help             Show this help

First run downloads Qwen3-8B Q4_K_M (~5GB). Requires Apple Silicon Mac with 16GB+ RAM.
`);
}

function printREPLHelp(): void {
  console.log(`
Commands:
  /exit      Exit the REPL
  /clear     Start a new session
  /sessions  List saved sessions
  /model     Show model info
  /help      Show this help

Shortcuts:
  Ctrl+C     Abort current generation (press twice to exit)
`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
