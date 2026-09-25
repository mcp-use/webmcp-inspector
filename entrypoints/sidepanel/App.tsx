import { useEffect, useState } from "react";
import {
  Wrench,
  Search,
  RefreshCw,
  Sun,
  Moon,
  ArrowLeft,
  Bookmark,
  PlugZap,
  CircleAlert,
  MessageSquare,
} from "lucide-react";
import { McpUseLogo } from "@/src/components/McpUseLogo";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { ToolsList } from "@/src/components/tools/ToolsList";
import { SavedRequestsList } from "@/src/components/tools/SavedRequestsList";
import { ToolDetail } from "@/src/components/tools/ToolDetail";
import { ChatTab } from "@/src/components/chat/ChatTab";
import { useAllSitesAccess } from "@/src/hooks/useAllSitesAccess";
import { useConnection } from "@/src/hooks/useConnection";
import { useSavedRequests } from "@/src/hooks/useSavedRequests";
import { deleteRequest } from "@/src/lib/saved-requests";
import type { SavedRequest } from "@/src/lib/types";

type Tab = "tools" | "chat";

function storedTab(): Tab {
  try {
    return localStorage.getItem("tab") === "chat" ? "chat" : "tools";
  } catch {
    return "tools";
  }
}

export function App() {
  const { connection, error, loading, refresh } = useConnection();
  const { granted: allSites, request: requestAllSites } = useAllSitesAccess();
  const [tab, setTab] = useState<Tab>(storedTab);
  useEffect(() => {
    try {
      localStorage.setItem("tab", tab);
    } catch {
      // A remembered tab is a convenience.
    }
  }, [tab]);
  const { requests, error: storageError } = useSavedRequests();
  const [selection, setSelection] = useState<{
    name: string;
    saved?: SavedRequest;
    documentId: string;
  } | null>(null);
  const [savedView, setSavedView] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem("theme") ??
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  const origin = connection ? new URL(connection.url).origin : "";
  const saved = requests.filter((request) => request.origin === origin);
  const selectedTool =
    selection?.documentId === connection?.documentId
      ? connection?.tools.find((tool) => tool.name === selection?.name)
      : undefined;
  useEffect(() => {
    if (!selectedTool) setSelection(null);
  }, [selectedTool]);
  const filteredTools = (connection?.tools ?? []).filter((tool) =>
    `${tool.name} ${tool.description ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const filteredSaved = saved.filter((request) =>
    `${request.name} ${request.toolName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function loadRequest(request: SavedRequest) {
    if (!connection?.tools.some((tool) => tool.name === request.toolName)) {
      setMessage(
        `“${request.toolName}” is not currently available on this page.`,
      );
      return;
    }
    setMessage("");
    setSelection({
      name: request.toolName,
      saved: request,
      documentId: connection.documentId,
    });
  }
  return (
    <div className="inspector">
      <nav className="tabs" role="tablist" aria-label="Views">
        {(
          [
            ["tools", Wrench, "Tools"],
            ["chat", MessageSquare, "Chat"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>
      <main
        id="panel-tools"
        role="tabpanel"
        aria-labelledby="tab-tools"
        hidden={tab !== "tools"}
      >
        {selectedTool && connection ? (
          <ToolDetail
            key={`${connection.documentId}:${selectedTool.name}:${JSON.stringify(selectedTool.inputSchema)}:${selection?.saved?.id ?? ""}`}
            connection={connection}
            tool={selectedTool}
            saved={selection?.saved}
            onBack={() => setSelection(null)}
          />
        ) : (
          <>
            <div className="list-toolbar">
              {savedView ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Back to all tools"
                  onClick={() => {
                    setSavedView(false);
                    setSearch("");
                  }}
                >
                  <ArrowLeft />
                </Button>
              ) : (
                <Wrench size={15} />
              )}
              <h1>{savedView ? "Saved requests" : "Tools"}</h1>
              <Badge color="gray" size="sm">
                {savedView ? saved.length : (connection?.tools.length ?? 0)}
              </Badge>
              <div className="toolbar-end">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Search tools"
                  aria-label="Search tools"
                  onClick={() => {
                    setSearchOpen(!searchOpen);
                    setSearch("");
                  }}
                >
                  <Search />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Refresh tools"
                  aria-label="Refresh tools"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  <RefreshCw className={loading ? "animate-spin" : ""} />
                </Button>
                {!savedView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSavedView(true);
                      setSearch("");
                      setMessage("");
                    }}
                  >
                    Saved{saved.length > 0 ? ` (${saved.length})` : ""}
                  </Button>
                )}
              </div>
            </div>
            {searchOpen && (
              <div className="search-box">
                <Input
                  autoFocus
                  aria-label="Search by name or description"
                  placeholder={
                    savedView ? "Search saved requests…" : "Search tools…"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            {(message || storageError) && (
              <div role="alert" className="error-box mx-4">
                {message || storageError}
              </div>
            )}
            {error ? (
              <div className="empty-state">
                <PlugZap />
                <h2>Connect a page</h2>
                <p>
                  Open a website, then click the extension’s toolbar icon to
                  inspect its tools.
                </p>
                <p className="hint">
                  {allSites === false &&
                    "Allowing all sites lets the panel reconnect on its own, without clicking the toolbar icon after each site change. "}
                  Browser settings pages and the Chrome Web Store cannot be
                  inspected.
                </p>
                <details>
                  <summary>Connection details</summary>
                  <p>{error}</p>
                </details>
                {allSites === false && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setMessage("");
                      requestAllSites()
                        .then((ok) => {
                          if (ok) void refresh();
                        })
                        .catch((error: unknown) =>
                          setMessage(
                            `Could not request access: ${error instanceof Error ? error.message : String(error)}`,
                          ),
                        );
                    }}
                  >
                    Allow on all sites
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                >
                  Try again
                </Button>
              </div>
            ) : loading && !connection ? (
              <div className="empty-state">
                <span className="spinner" />
                <p>Connecting to the page…</p>
              </div>
            ) : savedView ? (
              filteredSaved.length ? (
                <SavedRequestsList
                  requests={filteredSaved}
                  onLoad={loadRequest}
                  onDelete={(id) => {
                    void deleteRequest(id).catch((error) =>
                      setMessage(`Could not delete: ${String(error)}`),
                    );
                  }}
                />
              ) : (
                <div className="empty-state">
                  <Bookmark />
                  <h2>
                    {search ? "No matching requests" : "No saved requests yet"}
                  </h2>
                  <p>
                    Open a tool, enter its parameters, and click Save to keep a
                    request for this site.
                  </p>
                </div>
              )
            ) : connection?.api === "unavailable" ? (
              <div className="empty-state">
                <CircleAlert />
                <h2>WebMCP isn’t available</h2>
                <p>
                  This page or browser does not expose the WebMCP inspection
                  API.
                </p>
                <p className="hint">
                  For native WebMCP, enable “WebMCP for testing” in
                  chrome://flags and relaunch a compatible Chrome build.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                >
                  Check again
                </Button>
              </div>
            ) : filteredTools.length ? (
              <ToolsList
                tools={filteredTools}
                onToolSelect={(tool) => {
                  setMessage("");
                  setSelection({
                    name: tool.name,
                    documentId: connection!.documentId,
                  });
                }}
              />
            ) : (
              <div className="empty-state">
                <Wrench />
                <h2>{search ? "No matching tools" : "No tools available"}</h2>
                <p>
                  {search
                    ? "Try a different name or description."
                    : "Tools will appear here as soon as this page registers them."}
                </p>
                {!search && (
                  <span className="waiting">
                    <i />
                    Listening for tools
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {/* Kept mounted while hidden so the conversation survives tab switches. */}
      <section
        id="panel-chat"
        role="tabpanel"
        aria-labelledby="tab-chat"
        className="chat-panel"
        hidden={tab !== "chat"}
      >
        <ChatTab connection={connection} />
      </section>
      <footer>
        <span className="manufact-wordmark">
          <McpUseLogo size="sm" />
          <span>Manufact</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </footer>
    </div>
  );
}
