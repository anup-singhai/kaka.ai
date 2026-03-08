import type { Tool, ToolCall, LLMResponse, AgentConfig, ToolParameters } from '../types.js';
import type { ToolResult } from '../types.js';
import type {
  LlamaChatSession as LlamaChatSessionType,
  LlamaModel as LlamaModelType,
  LlamaContext as LlamaContextType,
  GbnfJsonSchema,
  GbnfJsonObjectSchema,
} from 'node-llama-cpp';

/** Callback to execute a tool and optionally check approval */
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

/** Callback for UI notifications during tool execution */
export interface ProviderCallbacks {
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
  onText?: (chunk: string) => void;
}

/**
 * Provider wraps node-llama-cpp's chat session with tool calling support.
 *
 * Key insight: node-llama-cpp executes tool handlers DURING session.prompt().
 * The handler return value becomes the tool result the model sees.
 * So we execute tools inside the handlers to give the model real results.
 */
export class Provider {
  private model: LlamaModelType;
  private context: LlamaContextType;
  private session: LlamaChatSessionType | null = null;
  private config: AgentConfig;

  constructor(model: LlamaModelType, context: LlamaContextType, config: AgentConfig) {
    this.model = model;
    this.context = context;
    this.config = config;
  }

  async initSession(systemPrompt: string): Promise<void> {
    const { LlamaChatSession } = await import('node-llama-cpp');
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });
  }

  getContext(): LlamaContextType {
    return this.context;
  }

  getModel(): LlamaModelType {
    return this.model;
  }

  /**
   * Send a message with tool definitions and get a response.
   *
   * Tools are executed inside the handlers during session.prompt().
   * The model sees real tool results and can chain multiple calls.
   */
  async chat(
    message: string,
    tools: Tool[],
    executor: ToolExecutor,
    callbacks: ProviderCallbacks = {},
  ): Promise<LLMResponse> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initSession() first.');
    }

    const { defineChatSessionFunction } = await import('node-llama-cpp');

    const functions: Record<string, any> = {};
    const executedCalls: ToolCall[] = [];
    let callIdCounter = 0;

    for (const tool of tools) {
      const toolName = tool.name;
      const schema = convertParams(tool.parameters);

      functions[toolName] = defineChatSessionFunction({
        description: tool.description,
        params: schema,
        async handler(params: Record<string, unknown>) {
          const callId = `call_${callIdCounter++}`;
          executedCalls.push({ id: callId, name: toolName, arguments: params });

          callbacks.onToolCall?.(toolName, params);

          // Execute the tool for real - the return value is what the model sees
          const result = await executor(toolName, params);

          callbacks.onToolResult?.(toolName, result);

          return result.content;
        },
      } as any);
    }

    // Append /no_think to disable Qwen3's internal reasoning mode.
    // This reduces latency significantly — the model skips <think> tokens
    // and goes straight to tool calls or responses.
    const promptMessage = message + ' /no_think';

    const response = await this.session.prompt(promptMessage, {
      functions: Object.keys(functions).length > 0 ? functions : undefined,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      onTextChunk: callbacks.onText ? (chunk: string) => callbacks.onText!(chunk) : undefined,
    });

    return {
      content: response ?? '',
      toolCalls: executedCalls,
    };
  }

  getChatHistory(): unknown[] {
    if (!this.session) return [];
    return this.session.getChatHistory();
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.dispose();
    }
    if (this.model) {
      await this.model.dispose();
    }
  }
}

function convertParams(params: ToolParameters): GbnfJsonObjectSchema {
  const properties: Record<string, GbnfJsonSchema> = {};

  for (const [key, prop] of Object.entries(params.properties)) {
    if (prop.enum) {
      properties[key] = {
        enum: prop.enum,
        description: prop.description,
      } as GbnfJsonSchema;
    } else {
      properties[key] = {
        type: prop.type as 'string' | 'number' | 'integer' | 'boolean',
        description: prop.description,
      };
    }
  }

  return {
    type: 'object' as const,
    properties,
    required: params.required,
  } as GbnfJsonObjectSchema;
}
