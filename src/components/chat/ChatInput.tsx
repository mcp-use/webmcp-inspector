// Adapted from mcp-use Inspector (chat/ChatInput.tsx, ChatInputArea.tsx); see THIRD_PARTY_NOTICES.md.
import { useRef, useState, type ReactNode } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { cn } from "@/src/lib/utils";
import { useShape } from "@/src/lib/shape-context";

export function ChatInput({
  disabled,
  loading,
  placeholder,
  onSend,
  onStop,
  controls,
}: {
  disabled: boolean;
  loading: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Rendered on the left of the bottom toolbar (e.g. the model selector). */
  controls?: ReactNode;
}) {
  const shape = useShape();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !loading && value.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
  };
  return (
    <div className="relative w-full">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
        className={cn(
          "px-3.5 pt-3 pb-12 min-h-[104px] max-h-[220px] text-[13px] md:text-[13px] resize-none",
          shape.container,
        )}
        disabled={disabled}
        data-testid="chat-input"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2 pl-2.5">
        <div className="flex min-w-0 flex-1 items-center">{controls}</div>
        <Button
          type="button"
          size="sm"
          className={cn(
            "h-8 w-8 shrink-0 rounded-full p-0",
            !canSend && !loading && "opacity-50",
          )}
          disabled={!loading && !canSend}
          title={loading ? "Stop" : "Send"}
          aria-label={loading ? "Stop" : "Send"}
          onClick={loading ? onStop : submit}
          data-testid="chat-send-button"
        >
          {loading ? (
            <Square className="size-3 fill-current" />
          ) : (
            <ArrowUp className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
