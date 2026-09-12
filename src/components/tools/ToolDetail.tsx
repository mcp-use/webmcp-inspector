import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Code2,
  Copy,
  Play,
  Save,
  Check,
  RotateCcw,
  Maximize,
  Minimize,
  Terminal,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ToolInputForm } from "./ToolInputForm";
import { Modal } from "../Modal";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../ui/resizable";
import { executionArgs, initialArgs, validateArgs } from "../../lib/arguments";
import { execute } from "../../lib/bridge";
import { saveRequest } from "../../lib/saved-requests";
import type {
  Connection,
  Execution,
  SavedRequest,
  Tool,
} from "../../lib/types";

export function ToolDetail({
  connection,
  tool,
  saved,
  onBack,
}: {
  connection: Connection;
  tool: Tool;
  saved?: SavedRequest;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => saved?.args ?? initialArgs(tool.inputSchema),
  );
  const [empty, setEmpty] = useState(
    () =>
      new Set(
        Object.entries(saved?.args ?? {})
          .filter(([, value]) => value === "")
          .map(([key]) => key),
      ),
  );
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Execution | null>(null);
  const [dialog, setDialog] = useState<"metadata" | "save" | null>(null);
  const [name, setName] = useState(saved?.name ?? tool.name);
  const [notice, setNotice] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  function readArgs() {
    const args =
      mode === "json"
        ? JSON.parse(json)
        : executionArgs(tool.inputSchema, values, empty);
    const errors = validateArgs(tool.inputSchema, args);
    if (errors.length) {
      setErrors(errors);
      return null;
    }
    setErrors([]);
    return args as Record<string, unknown>;
  }
  function checkedArgs() {
    try {
      return readArgs();
    } catch (error) {
      setErrors([`Invalid JSON: ${String(error)}`]);
      return null;
    }
  }
  async function run() {
    if (busy.current) return;
    const args = checkedArgs();
    if (!args) return;
    busy.current = true;
    setRunning(true);
    setResult(null);
    const started = performance.now();
    try {
      const next = await execute(connection, tool, args);
      if (alive.current) setResult(next);
    } catch (error) {
      if (alive.current)
        setResult({
          value: error instanceof Error ? error.message : String(error),
          elapsed: performance.now() - started,
          isError: true,
        });
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  }
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        void runRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  async function copy(value: unknown) {
    try {
      await navigator.clipboard.writeText(
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      );
      setNotice("Copied to clipboard");
    } catch {
      setErrors(["Could not copy. Select and copy the JSON directly."]);
    }
  }
  function switchMode() {
    if (mode === "form") {
      setJson(
        JSON.stringify(executionArgs(tool.inputSchema, values, empty), null, 2),
      );
      setMode("json");
    } else {
      try {
        const next = JSON.parse(json);
        if (!next || typeof next !== "object" || Array.isArray(next))
          throw new Error("Use a JSON object.");
        setValues(next);
        setEmpty(new Set(Object.keys(next).filter((key) => next[key] === "")));
        setMode("form");
        setErrors([]);
      } catch {
        setErrors(["Enter a valid JSON object before switching to the form."]);
      }
    }
  }
  async function save() {
    const args = checkedArgs();
    if (!args || !name.trim()) return;
    try {
      await saveRequest({
        id: crypto.randomUUID(),
        name: name.trim(),
        toolName: tool.name,
        args,
        origin: new URL(connection.url).origin,
        savedAt: Date.now(),
      });
      setDialog(null);
      setNotice("Request saved");
    } catch (error) {
      setErrors([`Could not save request: ${String(error)}`]);
    }
  }
  const resultPanel = (
    <div className="results" aria-live="polite" aria-busy={running}>
      <div className="results-heading">
        <h2>
          <Terminal size={14} />
          Result
        </h2>
        {result && (
          <div className="flex items-center gap-2">
            <span className={result.isError ? "error-text" : "success-text"}>
              {result.isError ? "Error" : "Success"}
            </span>
            <span>{Math.round(result.elapsed)} ms</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy result"
              title="Copy result"
              onClick={() => void copy(result.value)}
            >
              <Copy />
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            fullscreen ? "Exit fullscreen results" : "Fullscreen results"
          }
          title={fullscreen ? "Exit fullscreen" : "Fullscreen results"}
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
      </div>
      {running ? (
        <div className="result-placeholder">
          <span className="spinner" />
          <p>Executing {tool.name}…</p>
          <small>Waiting for the page to return a result.</small>
        </div>
      ) : result ? (
        <pre
          className={result.isError ? "result-json error-text" : "result-json"}
        >
          {result.value === null
            ? "The tool returned no result (it may have navigated the page)."
            : typeof result.value === "string"
              ? result.value
              : JSON.stringify(result.value, null, 2)}
        </pre>
      ) : (
        <div className="result-placeholder">
          <Terminal size={25} strokeWidth={1} />
          <p>No results yet</p>
          <small>Execute the tool to see its response.</small>
        </div>
      )}
    </div>
  );
  return (
    <section className="detail">
      <ResizablePanelGroup orientation="vertical" id="tool-layout">
        <ResizablePanel id="parameters" defaultSize="60%" minSize="20%">
          <div className="parameters-pane">
            <div className="detail-heading">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Back to tools"
                aria-label="Back to tools"
                onClick={onBack}
              >
                <ArrowLeft />
              </Button>
              <h1 title={tool.name}>{tool.name}</h1>
            </div>
            <div className="detail-actions">
              <Button
                variant="outline"
                size="sm"
                title="View tool metadata"
                onClick={() => setDialog("metadata")}
              >
                <Code2 />
                Metadata
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Copy payload as JSON"
                onClick={() => {
                  const args = checkedArgs();
                  if (args) void copy({ name: tool.name, arguments: args });
                }}
              >
                <Copy />
                Payload
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Save request"
                onClick={() => {
                  if (checkedArgs()) setDialog("save");
                }}
              >
                <Save />
                Save
              </Button>
              <Button
                size="sm"
                onClick={() => void run()}
                disabled={running}
                loading={running}
                title="Execute tool (⌘/Ctrl + Enter)"
              >
                <Play />
                Execute
              </Button>
            </div>
            <div className="detail-body">
              {tool.description && (
                <p className="tool-description">{tool.description}</p>
              )}
              <div className="parameters-heading">
                <h2>Parameters</h2>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Reset parameters"
                    aria-label="Reset parameters"
                    onClick={() => {
                      const next = initialArgs(tool.inputSchema);
                      setValues(next);
                      setEmpty(new Set());
                      setJson(JSON.stringify(next, null, 2));
                      setErrors([]);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={switchMode}>
                    {mode === "form" ? "{ } JSON" : "Form"}
                  </Button>
                </div>
              </div>
              {mode === "json" ? (
                <Textarea
                  aria-label="JSON arguments"
                  className="json-input"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  spellCheck={false}
                />
              ) : (
                <ToolInputForm
                  selectedTool={tool}
                  toolArgs={values}
                  onArgChange={(key, value) =>
                    setValues((previous) => ({ ...previous, [key]: value }))
                  }
                  sendEmptyFields={empty}
                  onToggleEmpty={(key, type, enabled) => {
                    setEmpty((previous) => {
                      const next = new Set(previous);
                      enabled ? next.add(key) : next.delete(key);
                      return next;
                    });
                    setValues((previous) => ({
                      ...previous,
                      [key]: enabled
                        ? type === "array"
                          ? []
                          : type === "object"
                            ? {}
                            : ""
                        : undefined,
                    }));
                  }}
                />
              )}
              {errors.length > 0 && (
                <div role="alert" className="error-box">
                  {errors.map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="Resize results" />
        <ResizablePanel id="results" defaultSize="40%" minSize="15%">
          {!fullscreen && resultPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
      {fullscreen && (
        <Modal title="Result" fullscreen onClose={() => setFullscreen(false)}>
          {resultPanel}
        </Modal>
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={14} />
          {notice}
        </div>
      )}
      {dialog === "metadata" && (
        <Modal title="Tool definition" onClose={() => setDialog(null)}>
          <pre className="metadata-json">{JSON.stringify(tool, null, 2)}</pre>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void copy(tool)}
          >
            <Copy />
            Copy JSON
          </Button>
        </Modal>
      )}
      {dialog === "save" && (
        <Modal title="Save request" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label htmlFor="request-name" className="block mb-2 text-sm">
              Request name
            </label>
            <Input
              id="request-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-3 mb-5">
              Saves these parameters locally for{" "}
              {new URL(connection.url).hostname}.
            </p>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              <Save />
              Save request
            </Button>
            {errors.length > 0 && (
              <p role="alert" className="error-text mt-3 text-xs">
                {errors.join(" ")}
              </p>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}
