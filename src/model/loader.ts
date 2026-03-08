import { existsSync, mkdirSync } from 'node:fs';
import type { ModelConfig } from '../types.js';

/**
 * Resolve model path: if already downloaded, return path; otherwise download.
 * Uses node-llama-cpp's resolveModelFile which handles downloading and
 * correct filename resolution (the downloader prefixes filenames).
 */
export async function resolveModelPath(config: ModelConfig): Promise<string> {
  // If user provided an absolute model path, use it directly
  if (config.dir === '' && config.file) {
    if (!existsSync(config.file)) {
      throw new Error(`Model file not found: ${config.file}`);
    }
    return config.file;
  }

  mkdirSync(config.dir, { recursive: true });

  const { resolveModelFile } = await import('node-llama-cpp');

  // resolveModelFile handles:
  // - Checking if already downloaded (with prefixed filename)
  // - Downloading from HuggingFace if missing
  // - Showing CLI progress during download
  // - Returning the correct resolved path
  const modelPath = await resolveModelFile(
    `hf:${config.repo}/${config.file}`,
    {
      directory: config.dir,
      download: 'auto',
      cli: true,
    },
  );

  return modelPath;
}

/**
 * Load model and create context via node-llama-cpp.
 * Returns { model, context } for use by the provider.
 */
export async function loadModel(modelPath: string, config: ModelConfig) {
  const { getLlama } = await import('node-llama-cpp');

  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath,
    gpuLayers: config.gpuLayers === 'auto' ? undefined : config.gpuLayers,
  });

  // Try requested context size, fall back to smaller sizes if VRAM is insufficient
  let contextSize = config.contextSize;
  let context;
  while (contextSize >= 2048) {
    try {
      context = await model.createContext({ contextSize });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('too large') || msg.includes('VRAM') || msg.includes('memory')) {
        contextSize = Math.floor(contextSize / 2);
        continue;
      }
      throw err;
    }
  }

  if (!context) {
    throw new Error('Could not create context - insufficient memory even at 2048 tokens');
  }

  return { llama, model, context, contextSize };
}
