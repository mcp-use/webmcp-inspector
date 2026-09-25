// Adapted from @mcp-use/agent (llm/sse.ts, llm/providers/openai-chat-completions.ts);
// see THIRD_PARTY_NOTICES.md.
import { partitionToolContent, toolImageFollowupHeader } from "./tool-result";
import type {
  ContentPart,
  LlmStreamEvent,
  ProviderMessage,
  ProviderTool,
  TokenUsage,
} from "./types";

/** HTTP error returned by the LLM proxy. `body` is parsed JSON when possible. */
export class LlmRequestError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "LlmRequestError";
    this.status = status;
    this.body = body;
  }
}

async function throwLlmRequestError(res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text
    }
  }
  throw new LlmRequestError(
    res.status,
    `Chat request failed (${res.status} ${res.statusText}): ${text}`,
    body,
  );
}

/** Minimal Server-Sent Events parser. Tolerates CR/LF and multi-line `data:`. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ event?: string; data: string }, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = indexOfEventSeparator(buffer)) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r\n\r\n|\n\n|\r\r)/, "");
        const parsed = parseSseBlock(raw);
        if (parsed) yield parsed;
      }
    }
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function indexOfEventSeparator(s: string): number {
  const a = s.indexOf("\n\n");
  const b = s.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseSseBlock(raw: string): { event?: string; data: string } | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function toOpenAIContent(content: string | ContentPart[]): unknown {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image_url", image_url: { url: p.url } },
  );
}

export function toOpenAIMessages(messages: ProviderMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      // The tool role only accepts strings; forward images as a follow-up user turn.
      const { text, imageParts } = partitionToolContent(m.content);
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content:
          text ||
          (imageParts.length > 0
            ? "[image content; see next message]"
            : "[no content]"),
      });
      if (imageParts.length > 0) {
        out.push({
          role: "user",
          content: [
            {
              type: "text",
              text: toolImageFollowupHeader(m.toolName, imageParts.length),
            },
            ...imageParts.map((p) => ({
              type: "image_url",
              image_url: { url: p.url },
            })),
          ],
        });
      }
      continue;
    }
    if (m.role === "assistant") {
      const entry: Record<string, unknown> = {
        role: "assistant",
        content:
          typeof m.content === "string" && m.content.length > 0
            ? m.content
            : null,
      };
      if (m.toolCalls?.length) {
        entry.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      out.push(entry);
      continue;
    }
    out.push({ role: m.role, content: toOpenAIContent(m.content) });
  }
  return out;
}

function tokenUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const usage = raw as Record<string, unknown>;
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  if (typeof input !== "number" && typeof output !== "number") return undefined;
  return {
    inputTokens: typeof input === "number" ? input : undefined,
    outputTokens: typeof output === "number" ? output : undefined,
  };
}

export interface LlmConfig {
  /** Base URL; the request goes to `${baseUrl}/chat/completions`. */
  baseUrl: string;
  model: string;
  /** Resolved per request so an expired token can be refreshed between tool steps. */
  getAccessToken: () => Promise<string>;
}

export interface LlmDriver {
  stream(params: {
    messages: ProviderMessage[];
    tools: ProviderTool[];
    signal?: AbortSignal;
  }): AsyncIterable<LlmStreamEvent>;
}

/** Streams an OpenAI Chat Completions request through the Manufact LLM proxy. */
export function openAIChatDriver(config: LlmConfig): LlmDriver {
  return {
    async *stream({ messages, tools, signal }) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: toOpenAIMessages(messages),
        stream: true,
      };
      if (tools.length > 0) {
        body.tools = tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));
      }
      const res = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await config.getAccessToken()}`,
          },
          body: JSON.stringify(body),
          signal,
          // Bearer only: a cookie would trigger the cloud's first-party origin check.
          credentials: "omit",
        },
      );
      if (!res.ok || !res.body) await throwLlmRequestError(res);

      // Buffer tool call fragments per index; emit parsed args on finish_reason.
      const buffers = new Map<
        number,
        { id: string; name: string; argsJson: string; started: boolean }
      >();
      for await (const ev of parseSSE(res.body!, signal)) {
        if (!ev.data || ev.data === "[DONE]") continue;
        let parsed: any;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          continue;
        }
        const usage = tokenUsage(parsed?.usage);
        if (usage) yield { type: "usage", usage };
        if (parsed?.error) {
          const message =
            typeof parsed.error === "string"
              ? parsed.error
              : (parsed.error.message ?? JSON.stringify(parsed.error));
          yield { type: "error", message };
          return;
        }
        const choice = parsed?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "text-delta", delta: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            let buf = buffers.get(idx);
            if (!buf) {
              buf = {
                id: tc.id ?? `call_${idx}`,
                name: tc.function?.name ?? "",
                argsJson: "",
                started: false,
              };
              buffers.set(idx, buf);
            }
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (!buf.started && buf.name) {
              buf.started = true;
              yield {
                type: "tool-call-start",
                toolCallId: buf.id,
                toolName: buf.name,
              };
            }
            const chunk: unknown = tc.function?.arguments;
            if (typeof chunk === "string" && chunk.length > 0) {
              buf.argsJson += chunk;
              if (buf.started) {
                yield {
                  type: "tool-call-args-delta",
                  toolCallId: buf.id,
                  toolName: buf.name,
                  argsDelta: chunk,
                };
              }
            }
          }
        }
        if (choice.finish_reason) {
          for (const buf of buffers.values()) {
            let args: Record<string, unknown> = {};
            try {
              const value = buf.argsJson ? JSON.parse(buf.argsJson) : {};
              if (value && typeof value === "object" && !Array.isArray(value))
                args = value;
            } catch {
              args = {};
            }
            yield {
              type: "tool-call-ready",
              toolCallId: buf.id,
              toolName: buf.name,
              args,
            };
          }
          buffers.clear();
        }
      }
      yield { type: "done" };
    },
  };
}
