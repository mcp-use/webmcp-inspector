import { toolResultToContent } from "./tool-result";
import type {
  ChatMessage,
  LlmStreamEvent,
  MessagePart,
  ProviderMessage,
  ProviderToolCall,
} from "./types";
import { parsePartialToolArgs } from "./partial-tool-args";

/**
 * Rebuild the provider transcript from UI messages. Each run of assistant text
 * followed by tool calls becomes one assistant turn plus its tool results.
 */
export function toProviderMessages(messages: ChatMessage[]): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    let text = "";
    let calls: { call: ProviderToolCall; result: unknown }[] = [];
    const flush = () => {
      if (calls.length) {
        out.push({
          role: "assistant",
          content: text,
          toolCalls: calls.map((c) => c.call),
        });
        for (const { call, result } of calls)
          out.push({
            role: "tool",
            content: toolResultToContent(result),
            toolCallId: call.id,
            toolName: call.name,
          });
      } else if (text) out.push({ role: "assistant", content: text });
      text = "";
      calls = [];
    };
    for (const part of message.parts ?? []) {
      if (part.type === "text") {
        if (calls.length) flush();
        text += part.text;
      } else {
        const inv = part.toolInvocation;
        calls.push({
          call: { id: inv.toolCallId, name: inv.toolName, args: inv.args },
          // An interrupted call still needs a result or the provider rejects the transcript.
          result:
            inv.state === "result" || inv.state === "error"
              ? inv.result
              : { isError: true, error: "Cancelled by user" },
        });
      }
    }
    flush();
  }
  return out;
}

/** Apply one stream event to the assistant message's parts (immutably). */
export function applyEvent(
  parts: MessagePart[],
  event: LlmStreamEvent,
  argsBuffers: Map<string, string>,
): MessagePart[] {
  switch (event.type) {
    case "text-delta": {
      const last = parts[parts.length - 1];
      if (last?.type === "text")
        return [
          ...parts.slice(0, -1),
          { type: "text", text: last.text + event.delta },
        ];
      return [...parts, { type: "text", text: event.delta }];
    }
    case "tool-call-start":
      argsBuffers.set(event.toolCallId, "");
      return [
        ...parts,
        {
          type: "tool-invocation",
          toolInvocation: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: {},
            state: "streaming",
          },
        },
      ];
    case "tool-call-args-delta": {
      const raw = (argsBuffers.get(event.toolCallId) ?? "") + event.argsDelta;
      argsBuffers.set(event.toolCallId, raw);
      const partialArgs = parsePartialToolArgs(raw);
      return updateInvocation(parts, event.toolCallId, (inv) =>
        partialArgs ? { ...inv, partialArgs } : inv,
      );
    }
    case "tool-call-ready": {
      const exists = parts.some(
        (p) =>
          p.type === "tool-invocation" &&
          p.toolInvocation.toolCallId === event.toolCallId,
      );
      if (!exists)
        parts = applyEvent(
          parts,
          {
            type: "tool-call-start",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
          argsBuffers,
        );
      return updateInvocation(parts, event.toolCallId, (inv) => ({
        ...inv,
        args: event.args,
        partialArgs: undefined,
        state: "pending",
      }));
    }
    case "tool-result":
      return updateInvocation(parts, event.toolCallId, (inv) => ({
        ...inv,
        result: event.result,
        state: event.isError ? "error" : "result",
      }));
    default:
      return parts;
  }
}

function updateInvocation(
  parts: MessagePart[],
  toolCallId: string,
  update: (
    inv: Extract<MessagePart, { type: "tool-invocation" }>["toolInvocation"],
  ) => Extract<MessagePart, { type: "tool-invocation" }>["toolInvocation"],
): MessagePart[] {
  return parts.map((part) =>
    part.type === "tool-invocation" &&
    part.toolInvocation.toolCallId === toolCallId
      ? { ...part, toolInvocation: update(part.toolInvocation) }
      : part,
  );
}

/** Mark calls that never finished (stop, error) so they don't spin forever. */
export function settleInterrupted(parts: MessagePart[]): MessagePart[] {
  return parts.map((part) =>
    part.type === "tool-invocation" &&
    (part.toolInvocation.state === "streaming" ||
      part.toolInvocation.state === "pending")
      ? {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            state: "error",
            result: "Cancelled by user",
          },
        }
      : part,
  );
}
