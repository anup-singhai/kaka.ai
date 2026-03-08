import type { Tool, ToolCall, LLMResponse, AgentConfig, ToolParameters } from '../types.js';
import type {
  LlamaChatSession as LlamaChatSessionType,
  LlamaModel as LlamaModelType,
  LlamaContext as LlamaContextType,
  GbnfJsonSchema,
  GbnfJsonObjectSchema,
} from 'node-llama-cpp';

/**
 * Provider wraps node-llama-cpp's chat session with tool calling support.
 * Uses grammar-constrained generation for reliable JSON tool calls.
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

  /** Initialize or reset the chat session */
  async initSession(systemPrompt: string): Promise<void> {
    const { LlamaChatSession } = await import('node-llama-cpp');
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });
  }

  /** Get the underlying context for token counting */
  getContext(): LlamaContextType {
    return this.context;
  }

  /** Get the underlying model for tokenization */
  getModel(): LlamaModelType {
    return this.model;
  }

  /**
   * Send a message with tool definitions and get a response.
   * Supports streaming text via onChunk callback.
   *
   * node-llama-cpp handles tool calling through defineChatSessionFunction.
   * The grammar ensures tool call JSON is always valid.
   */
  async chat(
    message: string,
    tools: Tool[],
    onChunk?: (text: string) => void,
  ): Promise<LLMResponse> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initSession() first.');
    }

    const { defineChatSessionFunction } = await import('node-llama-cpp');

    // Build function definitions for node-llama-cpp
    // Use 'any' for the record type - node-llama-cpp validates via grammar at runtime
    const functions: Record<string, any> = {};
    const pendingCalls: ToolCall[] = [];
    let callIdCounter = 0;

    for (const tool of tools) {
      const toolName = tool.name;
      const schema = convertParams(tool.parameters);

      functions[toolName] = defineChatSessionFunction({
        description: tool.description,
        params: schema,
        handler(params: Record<string, unknown>) {
          pendingCalls.push({
            id: `call_${callIdCounter++}`,
            name: toolName,
            arguments: params,
          });
          return 'Tool call queued for execution.';
        },
      } as any);
    }

    const response = await this.session.prompt(message, {
      functions: Object.keys(functions).length > 0 ? functions : undefined,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      onTextChunk: onChunk ? (chunk: string) => onChunk(chunk) : undefined,
    });

    return {
      content: response ?? '',
      toolCalls: pendingCalls,
    };
  }

  /** Get chat history from the session for context management */
  getChatHistory(): unknown[] {
    if (!this.session) return [];
    return this.session.getChatHistory();
  }

  /** Dispose of resources */
  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.dispose();
    }
    if (this.model) {
      await this.model.dispose();
    }
  }
}

/**
 * Convert our ToolParameters to node-llama-cpp's GbnfJsonObjectSchema.
 * The schema must use readonly properties to satisfy the type constraints.
 */
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
