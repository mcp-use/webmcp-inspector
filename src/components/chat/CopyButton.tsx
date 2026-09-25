// Copied from mcp-use Inspector (chat/CopyButton.tsx); see THIRD_PARTY_NOTICES.md.
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({
  text,
  title = "Copy message content",
}: {
  text: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the text stays selectable.
    }
  };
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground flex items-center rounded p-0.5"
      onClick={copy}
      title={title}
      aria-label={title}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
