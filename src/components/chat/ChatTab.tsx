import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogOut, MessageSquare, SquarePen } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { McpUseLogo } from "../McpUseLogo";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { useChat } from "@/src/hooks/useChat";
import { useCloudModels } from "@/src/hooks/useCloudModels";
import { useManufactAuth } from "@/src/hooks/useManufactAuth";
import type { ChatNotice } from "@/src/lib/chat/notice";
import type { Connection } from "@/src/lib/types";

const SUGGESTIONS = ["What can this page's tools do?"];

export function ChatTab({ connection }: { connection: Connection | null }) {
  const auth = useManufactAuth();
  const { models, selectedId, setSelectedId } = useCloudModels(auth.signedIn);
  const chat = useChat(connection, selectedId);
  const scroller = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the stream only while the user is at the bottom of the thread.
  useLayoutEffect(() => {
    if (pinned.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);

  if (!auth.loaded)
    return (
      <div className="empty-state">
        <span className="spinner" />
      </div>
    );

  if (!auth.signedIn)
    return (
      <div className="empty-state">
        <McpUseLogo />
        <h2>Chat with this page’s tools</h2>
        <p>
          Sign in with Manufact to chat with a cloud model that can call the
          WebMCP tools on the current page.
        </p>
        <Button
          size="sm"
          onClick={() => void auth.authorize()}
          disabled={auth.authorizing}
          data-testid="chat-sign-in"
        >
          {auth.authorizing ? "Waiting for sign-in…" : "Sign in with Manufact"}
        </Button>
        {auth.error && (
          <div role="alert" className="error-box">
            {auth.error}
          </div>
        )}
        <p className="hint">
          Usage counts toward your Manufact organization’s credits.
        </p>
      </div>
    );

  const available = !!connection && connection.api !== "unavailable";
  const toolCount = available ? connection.tools.length : 0;

  return (
    <div className="chat">
      <div className="list-toolbar">
        <MessageSquare size={15} />
        <h1>Chat</h1>
        <Badge color="gray" size="sm" title="Tools exposed to the model">
          {toolCount} {toolCount === 1 ? "tool" : "tools"}
        </Badge>
        <div className="toolbar-end">
          <Button
            variant="ghost"
            size="icon-sm"
            title="New chat"
            aria-label="New chat"
            onClick={chat.reset}
            disabled={chat.messages.length === 0 && !chat.loading}
          >
            <SquarePen />
          </Button>
          <AccountMenu
            user={auth.user}
            onSignOut={() => {
              chat.reset();
              void auth.logout();
            }}
          />
        </div>
      </div>
      <div
        ref={scroller}
        className="chat-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {chat.messages.length === 0 ? (
          <div className="empty-state chat-intro">
            <MessageSquare />
            <h2>Test tools in conversation</h2>
            <p>
              The model can call this page’s WebMCP tools. Calls run in the live
              page, just like Execute in the Tools tab.
            </p>
            {available && toolCount > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="tertiary"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      pinned.current = true;
                      void chat.send(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <MessageList
            messages={chat.messages}
            loading={chat.loading}
            endRef={endRef}
          />
        )}
      </div>
      <div className="chat-composer">
        {chat.notice && (
          <NoticeBanner
            notice={chat.notice}
            onSignIn={() => void auth.authorize()}
          />
        )}
        {chat.error && (
          <div role="alert" className="error-box mt-0 mb-2">
            {chat.error}
          </div>
        )}
        <ChatInput
          disabled={!available}
          loading={chat.loading}
          placeholder="Ask anything about this page."
          onSend={(text) => {
            pinned.current = true;
            void chat.send(text);
          }}
          onStop={chat.stop}
          controls={
            <ModelPicker
              models={models}
              selectedId={selectedId}
              onSelect={setSelectedId}
              disabled={chat.loading}
            />
          }
        />
      </div>
    </div>
  );
}

function AccountMenu({
  user,
  onSignOut,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const label = user?.name || user?.email || "Manufact account";
  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon-sm"
        title={label}
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {user?.image ? (
          <img src={user.image} alt="" className="size-5 rounded-full" />
        ) : (
          <span className="size-5 rounded-full bg-muted text-[10px] font-medium text-foreground flex items-center justify-center">
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
      </Button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="px-3 py-2 min-w-0">
            {user?.name && (
              <p className="text-[12px] font-medium truncate">{user.name}</p>
            )}
            {user?.email && (
              <p className="text-[11px] text-muted-foreground truncate">
                {user.email}
              </p>
            )}
          </div>
          <button type="button" role="menuitem" onClick={onSignOut}>
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NoticeBanner({
  notice,
  onSignIn,
}: {
  notice: ChatNotice;
  onSignIn: () => void;
}) {
  return (
    <p role="status" className="chat-notice" data-testid="chat-managed-notice">
      {notice.kind === "cloud_unavailable" &&
        "Manufact Cloud chat is currently unavailable. Try again shortly."}
      {/* Shown only while still signed in: an invalid token signs the panel out. */}
      {notice.kind === "login_required" && (
        <>
          Manufact Cloud didn’t accept this account for chat. Finish setting up
          your account and organization, then try again.{" "}
          {notice.loginUrl ? (
            <a href={notice.loginUrl} target="_blank" rel="noopener noreferrer">
              Open Manufact
            </a>
          ) : (
            <button type="button" onClick={onSignIn}>
              Sign in again
            </button>
          )}
        </>
      )}
      {notice.kind === "credits_exhausted" && (
        <>
          {notice.message}{" "}
          {notice.billingUrl && (
            <a
              href={notice.billingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage billing
            </a>
          )}
        </>
      )}
    </p>
  );
}
