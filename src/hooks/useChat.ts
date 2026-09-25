import { useCallback, useEffect, useRef, useState } from "react";
import { execute } from "../lib/bridge";
import {
  applyEvent,
  settleInterrupted,
  toProviderMessages,
} from "../lib/chat/conversation";
import { openAIChatDriver } from "../lib/chat/llm";
import { noticeFromError, type ChatNotice } from "../lib/chat/notice";
import { runToolLoop } from "../lib/chat/tool-loop";
import type { ChatMessage, MessagePart } from "../lib/chat/types";
import {
  buildToolset,
  callWebMcpTool,
  systemPrompt,
} from "../lib/chat/webmcp-tools";
import {
  recheckSession,
  getAccessToken,
  MANUFACT_CLOUD_URL,
} from "../lib/manufact-auth";
import type { Connection } from "../lib/types";

const LLM_BASE_URL = `${MANUFACT_CLOUD_URL}/api/v1/inspector/llm`;

export function useChat(connection: Connection | null, model: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  // Tool calls run against whichever document is current when the model asks.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const page = connectionRef.current;
      if (!text.trim() || abort.current || !page) return;
      const controller = new AbortController();
      abort.current = controller;
      setNotice(null);
      setError("");
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      const assistantId = crypto.randomUUID();
      const history = [...messagesRef.current, user];
      setMessages([
        ...history,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          parts: [],
        },
      ]);
      setLoading(true);
      let parts: MessagePart[] = [];
      const argsBuffers = new Map<string, string>();
      const update = (next: MessagePart[]) => {
        parts = next;
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId ? { ...m, parts: next } : m,
          ),
        );
      };
      const toolset = buildToolset(page.tools);
      try {
        for await (const event of runToolLoop({
          driver: openAIChatDriver({
            baseUrl: LLM_BASE_URL,
            model,
            getAccessToken,
          }),
          messages: [
            { role: "system", content: systemPrompt(page) },
            ...toProviderMessages(history),
          ],
          tools: toolset.tools,
          callTool: (name, args) =>
            callWebMcpTool(connectionRef.current, toolset, name, args, execute),
          signal: controller.signal,
        })) {
          if (event.type === "error") setError(event.message);
          else update(applyEvent(parts, event, argsBuffers));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const next = noticeFromError(error);
          // Signs the panel out unless the token is still valid (e.g. no organization yet).
          if (next?.kind === "login_required") await recheckSession();
          if (next) setNotice(next);
          else setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        update(settleInterrupted(parts));
        // Drop an assistant turn that produced nothing (e.g. sign-in required).
        if (parts.length === 0)
          setMessages((current) => current.filter((m) => m.id !== assistantId));
        // A reset may already have started a newer turn; leave it alone.
        if (abort.current === controller) {
          abort.current = null;
          setLoading(false);
        }
      }
    },
    [model],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setLoading(false);
    setMessages([]);
    setNotice(null);
    setError("");
  }, []);

  return { messages, loading, notice, error, send, stop, reset };
}
