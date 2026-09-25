// Copied from mcp-use Inspector (ui/chat-message.tsx); see THIRD_PARTY_NOTICES.md.
import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/src/lib/utils";
import { spring } from "@/src/lib/springs";
import { useShape } from "@/src/lib/shape-context";
import { useTouchPrimary } from "@/src/hooks/use-touch-primary";

interface ChatMessageProps extends Omit<HTMLMotionProps<"div">, "children"> {
  /** `user` → right-aligned accent bubble, `assistant` → left-aligned plain text. */
  from: "user" | "assistant";
  /** Hover-revealed timestamp (user messages only). */
  time?: ReactNode;
  /** Icon-only actions shown in the hover-revealed meta row. */
  actions?: ReactNode;
  children?: ReactNode;
}

// A single transcript entry with baked-in entrance + layout motion.
// `layout="position"` lets earlier messages slide up when a new one is appended.
const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ from, time, actions, children, className, ...props }, ref) => {
    const shape = useShape();
    const isUser = from === "user";
    // Hover-reveal is unreachable on touch — keep the meta row visible there.
    const isTouch = useTouchPrimary();
    const showTime = isUser && time != null;

    return (
      <motion.div
        ref={ref}
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.moderate}
        style={{ transformOrigin: isUser ? "bottom right" : "bottom left" }}
        className={cn(
          "group flex flex-col gap-1.5",
          isUser
            ? "max-w-[85%] items-end self-end"
            : "max-w-full items-start self-start",
          className,
        )}
        {...props}
      >
        {children != null && children !== "" && (
          <div
            className={cn(
              "py-2 text-[13px] whitespace-pre-wrap break-words",
              isUser
                ? cn(
                    shape.bg,
                    // `text-pretty` only on settled user bubbles: on a streaming
                    // reply it re-balances lines on every token and visibly reflows.
                    "px-3.5 text-pretty bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] text-accent-foreground",
                  )
                : "text-foreground",
            )}
          >
            {children}
          </div>
        )}
        {(showTime || actions != null) && (
          <div
            className={cn(
              "flex items-center gap-2 px-1 text-[11px] leading-none text-muted-foreground select-none",
              !isTouch && [
                "opacity-0 pointer-events-none transition-opacity duration-150",
                "group-hover:opacity-100 group-hover:pointer-events-auto",
                "group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
              ],
            )}
          >
            {showTime && <span className="tabular-nums">{time}</span>}
            {actions != null && (
              <span className="flex items-center gap-0.5">{actions}</span>
            )}
          </div>
        )}
      </motion.div>
    );
  },
);

ChatMessage.displayName = "ChatMessage";

export { ChatMessage };
