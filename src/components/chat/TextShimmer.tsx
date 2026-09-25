// Copied from mcp-use Inspector (ui/text-shimmer.tsx); see THIRD_PARTY_NOTICES.md.
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { cn } from "@/src/lib/utils";

export function TextShimmer({
  children,
  className,
  duration = 2,
  spread = 1,
}: {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}) {
  return (
    <motion.span
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text",
        "text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        "dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{ repeat: Infinity, duration, ease: "linear" }}
      style={
        {
          "--spread": `${children.length * spread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--base-color), var(--base-color))",
        } as CSSProperties
      }
    >
      {children}
    </motion.span>
  );
}
