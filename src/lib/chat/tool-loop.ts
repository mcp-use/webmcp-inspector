// Adapted from @mcp-use/agent (llm/toolLoop.ts); see THIRD_PARTY_NOTICES.md.
import { LlmRequestError, type LlmDriver } from "./llm";
import { isToolResultError, toolResultToContent } from "./tool-result";
import type { LlmStreamEvent, ProviderMessage, ProviderTool } from "./types";

export interface ToolLoopParams {
  driver: LlmDriver;
  /** History plus the user turn that starts this run. */
  messages: ProviderMessage[];
  tools: ProviderTool[];
  /** Executes a tool and returns its raw result. May throw. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
  signal?: AbortSignal;
}

/**
 * Streams the assistant response, runs any tool calls in the browser, appends
 * their results and continues until the assistant answers without tools or
 * `maxSteps` is exhausted.
 */
export async function* runToolLoop(
  params: ToolLoopParams,
): AsyncGenerator<LlmStreamEvent, void, unknown> {
  const { driver, tools, callTool, signal } = params;
  const maxSteps = params.maxSteps ?? 10;
  const messages = [...params.messages];

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return;
    const pending: {
      id: string;
      name: string;
      args: Record<string, unknown>;
    }[] = [];
    let assistantText = "";
    try {
      for await (const ev of driver.stream({ messages, tools, signal })) {
        if (ev.type === "text-delta") assistantText += ev.delta;
        else if (ev.type === "tool-call-ready")
          pending.push({ id: ev.toolCallId, name: ev.toolName, args: ev.args });
        yield ev;
        if (ev.type === "error") return;
      }
    } catch (err) {
      // Keep HTTP errors structured so the UI can show sign-in / credits notices.
      if (err instanceof LlmRequestError) throw err;
      if (signal?.aborted) return;
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }
    if (pending.length === 0) return;

    messages.push({
      role: "assistant",
      content: assistantText,
      toolCalls: pending,
    });
    // Sequential: WebMCP tools mutate the page, so ordering must be deterministic.
    for (const tc of pending) {
      if (signal?.aborted) return;
      let result: unknown;
      let isError = false;
      try {
        result = await callTool(tc.name, tc.args);
        isError = isToolResultError(result);
      } catch (err) {
        isError = true;
        result = {
          isError: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      messages.push({
        role: "tool",
        content: toolResultToContent(result),
        toolCallId: tc.id,
        toolName: tc.name,
      });
      yield {
        type: "tool-result",
        toolCallId: tc.id,
        toolName: tc.name,
        result,
        isError,
      };
    }
  }
}
