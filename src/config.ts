import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Config } from './types.js';

const home = homedir();

export const DEFAULT_CONFIG: Config = {
  model: {
    repo: 'unsloth/Qwen3-8B-GGUF',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    dir: join(home, '.kaka', 'models'),
    gpuLayers: 'auto',
    contextSize: 8192,
  },
  agent: {
    maxIterations: 25,
    maxTokens: 8192,
    temperature: 0.7,
  },
  safety: {
    requireApproval: 'writes',
  },
  session: {
    dir: join(home, '.kaka', 'sessions'),
  },
};

/** Load config: defaults → config file → env → CLI args */
export function loadConfig(cliArgs: Partial<CLIArgs> = {}): Config {
  const config = structuredClone(DEFAULT_CONFIG);

  // Load from project config file
  const projectConfig = tryLoadJson(resolve('.kaka.json'));
  if (projectConfig) mergeConfig(config, projectConfig);

  // Load from user config file
  const userConfig = tryLoadJson(join(home, '.config', 'kaka', 'config.json'));
  if (userConfig) mergeConfig(config, userConfig);

  // Env overrides
  if (process.env.KAKA_MODEL_REPO) config.model.repo = process.env.KAKA_MODEL_REPO;
  if (process.env.KAKA_MODEL_FILE) config.model.file = process.env.KAKA_MODEL_FILE;
  if (process.env.KAKA_CONTEXT_SIZE) config.model.contextSize = parseInt(process.env.KAKA_CONTEXT_SIZE, 10);

  // CLI overrides
  if (cliArgs.contextSize) config.model.contextSize = cliArgs.contextSize;
  if (cliArgs.modelPath) {
    config.model.dir = '';
    config.model.file = cliArgs.modelPath;
  }
  if (cliArgs.noApproval) config.safety.requireApproval = 'none';
  if (cliArgs.temperature !== undefined) config.agent.temperature = cliArgs.temperature;

  return config;
}

export interface CLIArgs {
  prompt?: string;
  continue?: string;
  sessions?: boolean;
  contextSize?: number;
  modelPath?: string;
  noApproval?: boolean;
  temperature?: number;
  version?: boolean;
  help?: boolean;
}

export function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--continue':
      case '-c':
        args.continue = argv[++i];
        break;
      case '--sessions':
        args.sessions = true;
        break;
      case '--context-size':
        args.contextSize = parseInt(argv[++i], 10);
        break;
      case '--model-path':
        args.modelPath = argv[++i];
        break;
      case '--no-approval':
        args.noApproval = true;
        break;
      case '--temperature':
        args.temperature = parseFloat(argv[++i]);
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          positional.push(arg);
        }
        break;
    }
  }

  if (positional.length > 0) {
    args.prompt = positional.join(' ');
  }

  return args;
}

function tryLoadJson(path: string): Record<string, unknown> | null {
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function mergeConfig(target: Config, source: Record<string, unknown>): void {
  const src = source as Record<string, Record<string, unknown>>;
  if (src.model) Object.assign(target.model, src.model);
  if (src.agent) Object.assign(target.agent, src.agent);
  if (src.safety) Object.assign(target.safety, src.safety);
  if (src.session) Object.assign(target.session, src.session);
}
