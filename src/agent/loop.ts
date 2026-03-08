import type { Config, Message, ToolResult } from '../types.js';
import type { Provider } from '../model/provider.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ApprovalSystem } from '../safety/approval.js';
import type { SessionManager } from './session.js';
import type { Session } from '../types.js';
import { buildSystemPrompt } from './context.js';
import { errorResult } from '../tools/result.js';

export interface AgentLoopCallbacks {
  onText?: (chunk: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
  onDenied?: (name: string, reason: string) => void;
  onThinking?: (message: string) => void;
}

/**
 * Core agent loop.
 *
 * With node-llama-cpp, tool execution happens inside session.prompt() via handlers.
 * The provider calls our executor for each tool, and the model sees the real result.
 * A single prompt() call can chain multiple tool calls automatically.
 */
export class AgentLoop {
  private provider: Provider;
  private tools: ToolRegistry;
  private approval: ApprovalSystem;
  private sessions: SessionManager;
  private config: Config;
  private session: Session;
  private initialized = false;

  constructor(
    provider: Provider,
    tools: ToolRegistry,
    approval: ApprovalSystem,
    sessions: SessionManager,
    config: Config,
    session: Session,
  ) {
    this.provider = provider;
    this.tools = tools;
    this.approval = approval;
    this.sessions = sessions;
    this.config = config;
    this.session = session;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const systemPrompt = buildSystemPrompt(this.tools);
    await this.provider.initSession(systemPrompt);
    this.initialized = true;
  }

  /** Process a user message. Tools are executed inline during model generation. */
  async processMessage(
    userInput: string,
    callbacks: AgentLoopCallbacks = {},
  ): Promise<string> {
    await this.init();

    this.sessions.addMessages(this.session, {
      role: 'user',
      content: userInput,
    });

    callbacks.onThinking?.('Thinking...');

    // Tool executor: called by the provider during session.prompt()
    const executor = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      const decision = await this.approval.check(name, args);
      if (decision === 'deny') {
        callbacks.onDenied?.(name, 'User denied tool execution');
        return errorResult(`Tool call "${name}" was denied by the user.`);
      }
      return this.tools.execute(name, args);
    };

    const response = await this.provider.chat(
      userInput,
      this.tools.getAll(),
      executor,
      {
        onText: callbacks.onText,
        onToolCall: callbacks.onToolCall,
        onToolResult: callbacks.onToolResult,
      },
    );

    // Save assistant response
    if (response.content) {
      this.sessions.addMessages(this.session, {
        role: 'assistant',
        content: response.content,
      });
    }

    return response.content;
  }

  getSession(): Session {
    return this.session;
  }
}
