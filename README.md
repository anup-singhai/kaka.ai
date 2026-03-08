# kaka

Self-contained local AI coding agent for your terminal. No API keys, no servers -- just install and code.

Runs [Qwen3-8B](https://huggingface.co/unsloth/Qwen3-8B-GGUF) locally via [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) with native Metal GPU acceleration on Apple Silicon.

## Install

```bash
npm install -g kaka
```

First run automatically downloads the model (~5GB) from HuggingFace.

## Usage

```bash
# Interactive REPL
kaka

# One-shot mode
kaka "fix the bug in app.ts"

# Resume a previous session
kaka --sessions              # list sessions
kaka --continue <id>         # resume one
```

### REPL commands

| Command     | Description               |
|-------------|---------------------------|
| `/help`     | Show available commands    |
| `/clear`    | Start a new session       |
| `/sessions` | List saved sessions       |
| `/model`    | Show model info           |
| `/exit`     | Exit                      |
| `Ctrl+C`    | Abort generation (2x to exit) |

## Tools

kaka has 7 built-in tools the model can use:

| Tool | Description |
|------|-------------|
| `read_file` | Read files with line numbers |
| `write_file` | Create or overwrite files |
| `edit_file` | Search and replace in files |
| `bash` | Execute shell commands |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `list_dir` | List directory contents |

## Safety

- **Read-only tools** (read_file, glob, grep, list_dir) auto-approve
- **Bash commands** prompt for approval: `Allow bash("npm test")? [y]es / [n]o / [a]lways`
- **Dangerous commands** are hard-blocked (rm -rf, format, dd, shutdown, fork bombs)

## Options

```
--context-size <n>     Context window size (default: 8192)
--model-path <path>    Use a custom GGUF model file
--no-approval          Auto-approve all tool calls
--temperature <n>      Set temperature (default: 0.7)
-v, --version          Show version
-h, --help             Show help
```

## Configuration

Config is loaded in order (later overrides earlier):

1. **Defaults** -- built-in
2. **Project config** -- `.kaka.json` in current directory
3. **User config** -- `~/.config/kaka/config.json`
4. **Environment variables** -- `KAKA_MODEL_REPO`, `KAKA_MODEL_FILE`, `KAKA_CONTEXT_SIZE`
5. **CLI flags**

Example `.kaka.json`:

```json
{
  "model": {
    "contextSize": 16384
  },
  "agent": {
    "temperature": 0.3,
    "maxIterations": 15
  },
  "safety": {
    "requireApproval": "all"
  }
}
```

## Using a different model

Any GGUF model works. Example with a larger model on a 64GB+ Mac:

```bash
kaka --model-path ~/.kaka/models/some-other-model.gguf
```

Or set defaults in `~/.config/kaka/config.json`:

```json
{
  "model": {
    "repo": "unsloth/Qwen3-8B-GGUF",
    "file": "Qwen3-8B-Q8_0.gguf"
  }
}
```

## Architecture

```
src/
  index.ts              CLI entry, arg parsing, REPL
  types.ts              Shared interfaces
  config.ts             Config loading (defaults -> file -> env -> CLI)
  model/
    loader.ts           Model download + loading via node-llama-cpp
    provider.ts         Chat completion with grammar-constrained tool calling
  agent/
    loop.ts             Core agentic loop (call LLM -> execute tools -> repeat)
    context.ts          System prompt + context window management
    session.ts          Conversation persistence (JSON files)
  tools/
    registry.ts         Tool registry
    result.ts           ToolResult helpers
    read-file.ts        write-file.ts    edit-file.ts
    bash.ts             glob.ts          grep.ts          list-dir.ts
  safety/
    approval.ts         Deny patterns + user approval prompts
  ui/
    terminal.ts         REPL loop, readline
    renderer.ts         Streaming markdown, spinners, tool display
```

## Requirements

- Apple Silicon Mac (M1/M2/M3/M4)
- 16GB+ RAM
- Node.js 18+
- ~5GB disk for default model

## Development

```bash
git clone https://github.com/anup-singhai/kaka.ai.git
cd kaka.ai
npm install
npm run build
node bin/kaka.js
```

## License

MIT
