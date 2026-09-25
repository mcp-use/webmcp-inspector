import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("wxt/browser", () => ({ browser: {} }));
import {
  LlmRequestError,
  openAIChatDriver,
  parseSSE,
  toOpenAIMessages,
} from "../src/lib/chat/llm";
import { runToolLoop } from "../src/lib/chat/tool-loop";
import {
  applyEvent,
  settleInterrupted,
  toProviderMessages,
} from "../src/lib/chat/conversation";
import {
  buildToolset,
  callWebMcpTool,
  sanitizeToolName,
} from "../src/lib/chat/webmcp-tools";
import { noticeFromError } from "../src/lib/chat/notice";
import { toolResultToContent } from "../src/lib/chat/tool-result";
import type { LlmDriver } from "../src/lib/chat/llm";
import type {
  ChatMessage,
  LlmStreamEvent,
  MessagePart,
} from "../src/lib/chat/types";
import type { Connection } from "../src/lib/types";

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("parseSSE", () => {
  it("splits events across chunk boundaries and CRLF separators", async () => {
    const events = await collect(
      parseSSE(
        streamOf(
          "data: one\n",
          "\ndata: tw",
          "o\r\n\r\n: comment\n\nevent: x\ndata: a\ndata: b",
        ),
      ),
    );
    expect(events).toEqual([
      { data: "one" },
      { data: "two" },
      { event: "x", data: "a\nb" },
    ]);
  });
});

describe("openAIChatDriver", () => {
  it("streams text and assembles tool call arguments", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          streamOf(
            sse({ choices: [{ delta: { content: "Hi" } }] }),
            sse({
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_a",
                        function: { name: "add", arguments: '{"a":' },
                      },
                    ],
                  },
                },
              ],
            }),
            sse({
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { arguments: "1}" } }],
                  },
                },
              ],
            }),
            sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
            sse({
              choices: [],
              usage: { prompt_tokens: 5, completion_tokens: 2 },
            }),
            "data: [DONE]\n\n",
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const driver = openAIChatDriver({
      baseUrl: "https://cloud.test/api/v1/inspector/llm/",
      model: "openai/test",
      getAccessToken: async () => "token-1",
    });
    const events = await collect(
      driver.stream({
        messages: [{ role: "user", content: "hello" }],
        tools: [
          { name: "add", description: "Add", inputSchema: { type: "object" } },
        ],
      }),
    );
    expect(events).toEqual([
      { type: "text-delta", delta: "Hi" },
      { type: "tool-call-start", toolCallId: "call_a", toolName: "add" },
      {
        type: "tool-call-args-delta",
        toolCallId: "call_a",
        toolName: "add",
        argsDelta: '{"a":',
      },
      {
        type: "tool-call-args-delta",
        toolCallId: "call_a",
        toolName: "add",
        argsDelta: "1}",
      },
      {
        type: "tool-call-ready",
        toolCallId: "call_a",
        toolName: "add",
        args: { a: 1 },
      },
      { type: "usage", usage: { inputTokens: 5, outputTokens: 2 } },
      { type: "done" },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://cloud.test/api/v1/inspector/llm/chat/completions",
    );
    expect(init?.credentials).toBe("omit");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-1",
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "openai/test",
      stream: true,
      tools: [
        {
          type: "function",
          function: { name: "add", parameters: { type: "object" } },
        },
      ],
    });
  });

  it("throws a structured error for proxy failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ loginRequired: true, loginUrl: "https://x" }),
            {
              status: 429,
            },
          ),
      ),
    );
    const driver = openAIChatDriver({
      baseUrl: "https://c",
      model: "m",
      getAccessToken: async () => "t",
    });
    const error = await collect(
      driver.stream({ messages: [], tools: [] }),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(LlmRequestError);
    expect(noticeFromError(error)).toEqual({ kind: "login_required" });
  });
});

describe("toOpenAIMessages", () => {
  it("serializes tool calls and forwards tool images as a user turn", () => {
    expect(
      toOpenAIMessages([
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "1", name: "snap", args: { x: 1 } }],
        },
        {
          role: "tool",
          toolCallId: "1",
          toolName: "snap",
          content: toolResultToContent({
            content: [
              { type: "text", text: "ok" },
              { type: "image", data: "AAAA", mimeType: "image/png" },
            ],
          }) as never,
        },
      ]),
    ).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "1",
            type: "function",
            function: { name: "snap", arguments: '{"x":1}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "1", content: "ok" },
      {
        role: "user",
        content: [
          { type: "text", text: '(Tool "snap" returned the following image:)' },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AAAA" },
          },
        ],
      },
    ]);
  });
});

function scriptedDriver(
  steps: LlmStreamEvent[][],
): LlmDriver & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async *stream(params) {
      calls.push(structuredClone(params.messages));
      yield* steps.shift() ?? [];
    },
  };
}

describe("runToolLoop", () => {
  it("runs tools sequentially and feeds results back to the model", async () => {
    const driver = scriptedDriver([
      [
        { type: "tool-call-ready", toolCallId: "a", toolName: "one", args: {} },
        {
          type: "tool-call-ready",
          toolCallId: "b",
          toolName: "two",
          args: { n: 2 },
        },
        { type: "done" },
      ],
      [{ type: "text-delta", delta: "Done" }, { type: "done" }],
    ]);
    const order: string[] = [];
    const events = await collect(
      runToolLoop({
        driver,
        messages: [{ role: "user", content: "go" }],
        tools: [],
        callTool: async (name) => {
          order.push(name);
          if (name === "two") throw new Error("boom");
          return { content: [{ type: "text", text: "first" }] };
        },
      }),
    );
    expect(order).toEqual(["one", "two"]);
    expect(events.filter((e) => e.type === "tool-result")).toEqual([
      {
        type: "tool-result",
        toolCallId: "a",
        toolName: "one",
        result: { content: [{ type: "text", text: "first" }] },
        isError: false,
      },
      {
        type: "tool-result",
        toolCallId: "b",
        toolName: "two",
        result: { isError: true, error: "boom" },
        isError: true,
      },
    ]);
    expect(driver.calls[1]).toEqual([
      { role: "user", content: "go" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a", name: "one", args: {} },
          { id: "b", name: "two", args: { n: 2 } },
        ],
      },
      { role: "tool", content: "first", toolCallId: "a", toolName: "one" },
      {
        role: "tool",
        content: '{"isError":true,"error":"boom"}',
        toolCallId: "b",
        toolName: "two",
      },
    ]);
  });

  it("stops after maxSteps", async () => {
    const step = (): LlmStreamEvent[] => [
      {
        type: "tool-call-ready",
        toolCallId: crypto.randomUUID(),
        toolName: "t",
        args: {},
      },
    ];
    const driver = scriptedDriver([step(), step(), step()]);
    const callTool = vi.fn(async () => "ok");
    await collect(
      runToolLoop({ driver, messages: [], tools: [], callTool, maxSteps: 2 }),
    );
    expect(callTool).toHaveBeenCalledTimes(2);
  });
});

describe("WebMCP toolset", () => {
  it("sanitizes and deduplicates tool names", () => {
    expect(sanitizeToolName("cart.add item!")).toBe("cart_add_item_");
    const { tools, names } = buildToolset([
      {
        name: "a.b",
        inputSchema: { type: "object", properties: { x: { type: "string" } } },
      },
      { name: "a_b", inputSchema: {} },
      { name: "x".repeat(80), inputSchema: {} },
    ]);
    expect(tools.map((t) => t.name)).toEqual(["a_b", "a_b_2", "x".repeat(64)]);
    expect(names.get("a_b_2")).toBe("a_b");
    expect(tools[1]!.inputSchema).toEqual({ type: "object", properties: {} });
  });

  const connection: Connection = {
    tabId: 1,
    documentId: "doc",
    url: "https://shop.test/",
    title: "Shop",
    api: "testing",
    revision: 1,
    tools: [
      {
        name: "cart.add",
        inputSchema: {
          type: "object",
          properties: { sku: { type: "string" } },
          required: ["sku"],
        },
      },
    ],
  };

  it("validates arguments before executing in the page", async () => {
    const toolset = buildToolset(connection.tools);
    const execute = vi.fn(async () => ({
      value: { ok: true },
      elapsed: 1,
      isError: false,
    }));
    const invalid = await callWebMcpTool(
      connection,
      toolset,
      "cart_add",
      {},
      execute,
    );
    expect(invalid).toMatchObject({ isError: true });
    expect(execute).not.toHaveBeenCalled();
    await expect(
      callWebMcpTool(connection, toolset, "cart_add", { sku: "A1" }, execute),
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(connection, connection.tools[0], {
      sku: "A1",
    });
  });

  it("fails when the tool is gone from the current page", async () => {
    const toolset = buildToolset(connection.tools);
    await expect(
      callWebMcpTool(
        { ...connection, tools: [] },
        toolset,
        "cart_add",
        {},
        vi.fn(),
      ),
    ).rejects.toThrow(/not available/);
    await expect(
      callWebMcpTool(null, toolset, "cart_add", {}, vi.fn()),
    ).rejects.toThrow(/no longer connected/);
  });
});

describe("conversation", () => {
  it("maps stream events to message parts", () => {
    const buffers = new Map<string, string>();
    let parts: MessagePart[] = [];
    for (const event of [
      { type: "text-delta", delta: "Let me " },
      { type: "text-delta", delta: "check." },
      { type: "tool-call-start", toolCallId: "c1", toolName: "search" },
      {
        type: "tool-call-args-delta",
        toolCallId: "c1",
        toolName: "search",
        argsDelta: '{"q":"sh',
      },
    ] as LlmStreamEvent[])
      parts = applyEvent(parts, event, buffers);
    expect(parts[0]).toEqual({ type: "text", text: "Let me check." });
    expect(parts[1]).toMatchObject({
      toolInvocation: { state: "streaming", partialArgs: { q: "sh" } },
    });
    parts = applyEvent(
      parts,
      {
        type: "tool-call-ready",
        toolCallId: "c1",
        toolName: "search",
        args: { q: "shoes" },
      },
      buffers,
    );
    parts = applyEvent(
      parts,
      {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "search",
        result: "3 hits",
        isError: false,
      },
      buffers,
    );
    expect(parts[1]).toEqual({
      type: "tool-invocation",
      toolInvocation: {
        toolCallId: "c1",
        toolName: "search",
        args: { q: "shoes" },
        partialArgs: undefined,
        state: "result",
        result: "3 hits",
      },
    });
  });

  it("rebuilds the provider transcript, closing interrupted calls", () => {
    const messages: ChatMessage[] = [
      { id: "u", role: "user", content: "hi", timestamp: 0 },
      {
        id: "a",
        role: "assistant",
        content: "",
        timestamp: 0,
        parts: settleInterrupted([
          { type: "text", text: "Looking" },
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: "1",
              toolName: "t",
              args: {},
              state: "result",
              result: "r",
            },
          },
          { type: "text", text: "Next" },
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: "2",
              toolName: "t",
              args: {},
              state: "pending",
            },
          },
        ]),
      },
    ];
    expect(toProviderMessages(messages)).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "Looking",
        toolCalls: [{ id: "1", name: "t", args: {} }],
      },
      { role: "tool", content: "r", toolCallId: "1", toolName: "t" },
      {
        role: "assistant",
        content: "Next",
        toolCalls: [{ id: "2", name: "t", args: {} }],
      },
      {
        role: "tool",
        content: "Cancelled by user",
        toolCallId: "2",
        toolName: "t",
      },
    ]);
  });
});

describe("noticeFromError", () => {
  it("recognizes exhausted credits and cloud outages", () => {
    expect(
      noticeFromError(
        new LlmRequestError(402, "x", {
          creditsExhausted: true,
          billingUrl: "https://manufact.com/cloud",
          error: { message: "Out of credits." },
        }),
      ),
    ).toEqual({
      kind: "credits_exhausted",
      billingUrl: "https://manufact.com/cloud",
      message: "Out of credits.",
    });
    expect(noticeFromError(new LlmRequestError(503, "x"))).toEqual({
      kind: "cloud_unavailable",
    });
    expect(noticeFromError(new TypeError("Failed to fetch"))).toEqual({
      kind: "cloud_unavailable",
    });
    expect(noticeFromError(new LlmRequestError(400, "bad"))).toBeNull();
  });
});
