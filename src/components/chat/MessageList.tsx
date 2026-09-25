// Adapted from mcp-use Inspector (chat/MessageList.tsx, AssistantMessage.tsx,
// UserMessage.tsx, StreamingAssistantContent.tsx); see THIRD_PARTY_NOTICES.md.
import { memo, useMemo, type RefObject } from "react";
import { ChatMessage } from "./ChatMessage";
import { CopyButton } from "./CopyButton";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TextShimmer } from "./TextShimmer";
import { ToolCallDisplay } from "./ToolCallDisplay";
import type { ChatMessage as Message } from "@/src/lib/chat/types";

/** Close an odd ``` count so in-progress fenced blocks still render. */
function prepareStreamingMarkdown(content: string): string {
  const fences = content.match(/```/g);
  return fences && fences.length % 2 === 1 ? `${content}\n\`\`\`` : content;
}

const AssistantText = memo(function AssistantText({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const markdown = useMemo(
    () => (streaming ? prepareStreamingMarkdown(content) : content),
    [content, streaming],
  );
  if (!content) return null;
  return (
    <ChatMessage
      from="assistant"
      actions={<CopyButton text={content} />}
      data-testid="chat-message-assistant"
    >
      <MarkdownRenderer
        className="text-[13px] leading-relaxed whitespace-normal [&_p:last-child]:mb-0"
        content={markdown}
      />
      {streaming && (
        <span
          className="inline-block w-0.5 h-[1em] ml-0.5 -mt-1 align-middle bg-foreground/60 animate-pulse"
          aria-hidden
        />
      )}
    </ChatMessage>
  );
});

export function MessageList({
  messages,
  loading,
  endRef,
}: {
  messages: Message[];
  loading: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  const last = messages[messages.length - 1];
  const thinking =
    loading && (!last || last.role === "user" || !last.parts?.length);

  return (
    <div className="flex flex-col gap-4 px-4 py-4" aria-live="polite">
      {messages.map((message) => {
        if (message.role === "user")
          return (
            <ChatMessage
              key={message.id}
              from="user"
              time={new Date(message.timestamp).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              actions={<CopyButton text={message.content} />}
              data-testid="chat-message-user"
            >
              {message.content}
            </ChatMessage>
          );
        const parts = message.parts ?? [];
        let lastText = -1;
        parts.forEach((part, i) => {
          if (part.type === "text") lastText = i;
        });
        const streaming = loading && message.id === last?.id;
        return (
          <div key={message.id} className="flex flex-col gap-2">
            {parts.map((part, i) =>
              part.type === "text" ? (
                <AssistantText
                  key={`${message.id}-text-${i}`}
                  content={part.text}
                  streaming={
                    streaming && i === lastText && i === parts.length - 1
                  }
                />
              ) : (
                <ToolCallDisplay
                  key={`${message.id}-tool-${part.toolInvocation.toolCallId}`}
                  invocation={part.toolInvocation}
                />
              ),
            )}
          </div>
        );
      })}
      {thinking && (
        <div className="text-[13px] py-1">
          <TextShimmer duration={2} spread={1}>
            Thinking...
          </TextShimmer>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
