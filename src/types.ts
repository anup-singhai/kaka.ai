/** Tool interface - all tools must implement this. Mirrors v16-client base.go */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

/** ToolResult - mirrors v16-client result.go */
export interface ToolResult {
  content: string;
  isError: boolean;
  silent: boolean;
}

/** Chat message for conversation history */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** LLM response from provider */
export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

/** Config types */
export interface ModelConfig {
  repo: string;
  file: string;
  dir: string;
  gpuLayers: number | 'auto';
  contextSize: number;
}

export interface AgentConfig {
  maxIterations: number;
  maxTokens: number;
  temperature: number;
}

export interface SafetyConfig {
  requireApproval: 'all' | 'writes' | 'none';
}

export interface SessionConfig {
  dir: string;
}

export interface Config {
  model: ModelConfig;
  agent: AgentConfig;
  safety: SafetyConfig;
  session: SessionConfig;
}

/** Session persistence */
export interface Session {
  id: string;
  cwd: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

/** Approval decision */
export type ApprovalDecision = 'allow' | 'deny' | 'always';
