// Adapted from mcp-use Inspector (shared/MarkdownRenderer.tsx); see THIRD_PARTY_NOTICES.md.
import type { ReactNode } from "react";
import Markdown from "markdown-to-jsx";
import { CopyButton } from "./CopyButton";

function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const language =
    className?.match(/(?:lang(?:uage)?-)(\w+)/)?.[1] ??
    className?.replace(/^(lang-|language-)\s*/, "").trim() ??
    "text";
  const code = String(children).trim();
  return (
    <div className="my-3 relative group/code bg-muted rounded-md">
      <div className="flex items-center justify-between absolute top-0 left-0 w-full">
        <div className="text-[10px] font-mono text-muted-foreground/60 px-2">
          {language}
        </div>
        <span className="opacity-0 group-hover/code:opacity-100 transition-opacity px-1 pt-1">
          <CopyButton text={code} title="Copy code" />
        </span>
      </div>
      <pre className="text-xs m-0 p-3 pt-7 rounded-lg font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Fenced blocks carry a language class; inline code does not.
function Code({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  if (className) return <CodeBlock className={className}>{children}</CodeBlock>;
  return (
    <code className="bg-muted px-1 py-0.5 rounded text-[12px] font-mono">
      {children}
    </code>
  );
}

type Props = { children?: ReactNode };

export function MarkdownRenderer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Markdown
        options={{
          overrides: {
            code: Code,
            pre: ({ children }: Props) => <>{children}</>,
            h1: ({ children }: Props) => (
              <h1 className="text-base font-bold mb-2 mt-3">{children}</h1>
            ),
            h2: ({ children }: Props) => (
              <h2 className="text-[14px] font-bold mb-2 mt-3">{children}</h2>
            ),
            h3: ({ children }: Props) => (
              <h3 className="text-[13px] font-bold mb-2 mt-3">{children}</h3>
            ),
            p: ({ children }: Props) => (
              <p className="mb-2 leading-relaxed">{children}</p>
            ),
            ul: ({ children }: Props) => (
              <ul className="list-disc list-outside pl-5 mb-2 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }: Props) => (
              <ol className="list-decimal list-outside pl-5 mb-2 space-y-1">
                {children}
              </ol>
            ),
            table: ({ children }: Props) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }: Props) => (
              <th className="border-b px-2 py-1 text-left font-medium">
                {children}
              </th>
            ),
            td: ({ children }: Props) => (
              <td className="border-b px-2 py-1 align-top">{children}</td>
            ),
            blockquote: ({ children }: Props) => (
              <blockquote className="border-l-2 border-muted-foreground pl-3 italic text-muted-foreground mb-2">
                {children}
              </blockquote>
            ),
            a: ({ children, href }: Props & { href?: string }) => (
              <a
                href={href}
                className="underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            strong: ({ children }: Props) => (
              <strong className="font-semibold">{children}</strong>
            ),
            img: ({ src, alt }: { src?: string; alt?: string }) => (
              <img
                src={src}
                alt={alt || ""}
                className="max-w-full max-h-[400px] object-contain rounded-lg my-3 border"
                loading="lazy"
              />
            ),
            hr: () => <hr className="my-3 border-t" />,
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
