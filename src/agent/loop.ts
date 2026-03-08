import type { Config, Message, ToolResult } from '../types.js';
import type { Provider } from '../model/provider.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ApprovalSystem } from '../safety/approval.js';
import type { SessionManager } from './session.js';
import type { Session } from '../types.js';
import { buildSystemPrompt, needsCompaction, compactHistory, estimateTokens } from './context.js';

export interface AgentLoopCallbacks {
  onText?: (chunk: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
  onDenied?: (name: string, reason: string) => void;
  onThinking?: (message: string) => void;
}

/**
 * Core agent loop - mirrors v16-client toolloop.go RunToolLoop.
 *
 * 1. Add user message to session history
 * 2. Loop (max iterations):
 *    a. Call model.chat() with tools (streaming)
 *    b. If no tool calls → return text response
 *    c. For each tool call: check approval → execute → feed result back
 * 3. Save session
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

  /** Initialize the LLM chat session with system prompt */
  async init(): Promise<void> {
    if (this.initialized) return;
    const systemPrompt = buildSystemPrompt(this.tools);
    await this.provider.initSession(systemPrompt);
    this.initialized = true;
  }

  /** Process a user message through the agent loop */
  async processMessage(
    userInput: string,
    callbacks: AgentLoopCallbacks = {},
  ): Promise<string> {
    await this.init();

    // Add user message to session
    this.sessions.addMessages(this.session, {
      role: 'user',
      content: userInput,
    });

    let iteration = 0;
    let finalContent = '';

    while (iteration < this.config.agent.maxIterations) {
      iteration++;

      callbacks.onThinking?.(`Thinking... (iteration ${iteration})`);

      // Call LLM with streaming
      const response = await this.provider.chat(
        iteration === 1 ? userInput : 'Continue based on the tool results above.',
        this.tools.getAll(),
        callbacks.onText,
      );

      // No tool calls → we have our final answer
      if (response.toolCalls.length === 0) {
        finalContent = response.content;
        break;
      }

      // Process each tool call
      for (const toolCall of response.toolCalls) {
        callbacks.onToolCall?.(toolCall.name, toolCall.arguments);

        // Check approval
        const decision = await this.approval.check(toolCall.name, toolCall.arguments);

        if (decision === 'deny') {
          callbacks.onDenied?.(toolCall.name, 'User denied tool execution');
          // Feed denial back to model
          const denialResult: ToolResult = {
            content: `Tool call "${toolCall.name}" was denied by the user.`,
            isError: true,
            silent: false,
          };
          callbacks.onToolResult?.(toolCall.name, denialResult);
          continue;
        }

        // Execute tool
        const result = await this.tools.execute(toolCall.name, toolCall.arguments);
        callbacks.onToolResult?.(toolCall.name, result);

        // Add to session history
        this.sessions.addMessages(this.session, {
          role: 'assistant',
          content: '',
          toolCalls: [toolCall],
        }, {
          role: 'tool',
          content: result.content,
          toolCallId: toolCall.id,
        });
      }

      // Check for context compaction
      const totalChars = this.session.messages.reduce((sum, m) => sum + m.content.length, 0);
      if (needsCompaction(this.session.messages.length, estimateTokens(String(totalChars)), this.config.model.contextSize)) {
        callbacks.onThinking?.('Compacting conversation history...');
        this.session.messages = compactHistory(this.session.messages) as Message[];
        this.sessions.save(this.session);
      }
    }

    // Save final assistant response
    if (finalContent) {
      this.sessions.addMessages(this.session, {
        role: 'assistant',
        content: finalContent,
      });
    }

    return finalContent;
  }

  getSession(): Session {
    return this.session;
  }
}
