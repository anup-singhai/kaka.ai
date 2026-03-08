# kaka

Self-contained local AI coding agent for your terminal. No API keys, no servers -- just install and code.

Runs [Qwen3-8B](https://huggingface.co/unsloth/Qwen3-8B-GGUF) locally via [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) with native Metal GPU acceleration on Apple Silicon.

## Install

```bash
npm install -g kaka.ai
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

Any GGUF model works. Point to a local file:

```bash
kaka --model-path ~/models/some-other-model.gguf
```

Or change the default HuggingFace download in `~/.config/kaka/config.json`:

```json
{
  "model": {
    "repo": "unsloth/Qwen3-8B-GGUF",
    "file": "Qwen3-8B-Q8_0.gguf"
  }
}
```

## How it works

kaka embeds a full LLM runtime via `node-llama-cpp`. When you send a message:

1. The model generates a response, optionally calling tools
2. Tool calls are executed locally (file reads, shell commands, etc.)
3. Results are fed back to the model via grammar-constrained function calling
4. The model continues until it has a final answer

All inference runs on-device using Metal GPU acceleration. No data leaves your machine.

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
