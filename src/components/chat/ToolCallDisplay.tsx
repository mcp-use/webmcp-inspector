// Adapted from mcp-use Inspector (chat/ToolCallDisplay.tsx); see THIRD_PARTY_NOTICES.md.
// The Inspector's side sheet becomes the extension's Modal.
import { useState } from "react";
import { Check, Loader2, Wrench, X } from "lucide-react";
import { Modal } from "../Modal";
import { CopyButton } from "./CopyButton";
import { cn } from "@/src/lib/utils";
import type { ToolInvocation } from "@/src/lib/chat/types";

const format = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

export function ToolCallDisplay({
  invocation,
}: {
  invocation: ToolInvocation;
}) {
  const [open, setOpen] = useState(false);
  const { toolName, state, result } = invocation;
  const running = state === "streaming" || state === "pending";
  const args =
    running && invocation.partialArgs
      ? invocation.partialArgs
      : invocation.args;
  const argCount = Object.keys(args).length;

  return (
    <div className="my-1 flex w-fit max-w-full flex-col items-start">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex max-w-full items-center gap-2.5 rounded-full border bg-background p-1 pr-1 transition-colors hover:bg-hover cursor-pointer"
        data-testid={`chat-tool-call-${toolName}`}
        title="Show tool call details"
      >
        <span className="w-7 h-7 rounded-full bg-muted border flex items-center justify-center shrink-0">
          <Wrench className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 truncate text-[12px] font-medium">
          {toolName}(
          {argCount > 0 && (
            <span className="bg-muted-foreground/20 rounded-full px-1.5 mx-1 py-0.5 text-[10px]">
              {argCount} {argCount === 1 ? "arg" : "args"}
            </span>
          )}
          )
        </span>
        <span
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
            running
              ? "bg-blue-500/20"
              : state === "error"
                ? "bg-red-500/20"
                : "bg-emerald-500/20",
          )}
          data-testid={`chat-tool-call-status-${state}`}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-blue-500 dark:text-blue-400" />
          ) : state === "error" ? (
            <X className="size-3.5 text-red-500 dark:text-red-400" />
          ) : (
            <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
          )}
        </span>
      </button>
      {open && (
        <Modal
          title={`${toolName} · ${running ? "running" : state}`}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[12px] font-medium">Arguments</h3>
                <CopyButton text={format(args)} title="Copy arguments" />
              </div>
              <pre className="metadata-json">{format(args)}</pre>
            </section>
            {result !== undefined && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3
                    className={cn(
                      "text-[12px] font-medium",
                      state === "error" && "error-text",
                    )}
                  >
                    {state === "error" ? "Error" : "Result"}
                  </h3>
                  <CopyButton text={format(result)} title="Copy result" />
                </div>
                <pre className="metadata-json">{format(result)}</pre>
              </section>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
