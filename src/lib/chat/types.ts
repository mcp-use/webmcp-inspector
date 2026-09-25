// Adapted from mcp-use Inspector and @mcp-use/agent; see THIRD_PARTY_NOTICES.md.

export interface TextContentPart {
  type: "text";
  text: string;
}
export interface ImageContentPart {
  type: "image";
  /** Data URL (`data:image/png;base64,...`) or https URL. */
  url: string;
}
export type ContentPart = TextContentPart | ImageContentPart;

export interface ProviderToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Provider-neutral transcript entry; `llm.ts` maps it to the OpenAI wire format. */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  toolCalls?: ProviderToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface ProviderTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type LlmStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string }
  | {
      type: "tool-call-args-delta";
      toolCallId: string;
      toolName: string;
      argsDelta: string;
    }
  | {
      type: "tool-call-ready";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "usage"; usage: TokenUsage }
  | { type: "error"; message: string }
  | { type: "done" };

export type ToolInvocationState = "streaming" | "pending" | "result" | "error";

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  partialArgs?: Record<string, unknown>;
  result?: unknown;
  state: ToolInvocationState;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-invocation"; toolInvocation: ToolInvocation };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  timestamp: number;
  /** User text. Assistant messages keep their content in `parts`. */
  content: string;
  parts?: MessagePart[];
}
