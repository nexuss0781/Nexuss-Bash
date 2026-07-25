"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiPost, apiDelete } from "@/lib/api";

interface TerminalProps {
  sessionId: string;
  onClose?: () => void;
}

export default function Terminal({ sessionId, onClose }: TerminalProps) {
  const { token } = useAuth();
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [output, scrollToBottom]);

  const handleExec = useCallback(
    async (command: string) => {
      if (!command.trim() || !connected) return;

      setRunning(true);
      setOutput((prev) => prev + `$ ${command}\n`);

      try {
        const res = await apiPost<{ data: { stdout: string; stderr: string; exit_code: number } }>(
          `/sessions/${sessionId}/exec`,
          { command }
        );

        if (res.data.stdout) {
          setOutput((prev) => prev + res.data.stdout);
        }
        if (res.data.stderr) {
          setOutput((prev) => prev + `\x1b[31m${res.data.stderr}\x1b[0m`);
        }
        if (res.data.exit_code !== 0) {
          setOutput(
            (prev) =>
              prev + `\n[exit code: ${res.data.exit_code}]\n`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Command failed";
        setOutput((prev) => prev + `Error: ${msg}\n`);
      } finally {
        setRunning(false);
        if (inputRef.current) {
          inputRef.current.value = "";
          inputRef.current.focus();
        }
      }
    },
    [sessionId, connected]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const value = inputRef.current?.value || "";
        if (value.trim()) {
          handleExec(value.trim());
        }
      }
    },
    [handleExec]
  );

  const handleDisconnect = useCallback(async () => {
    try {
      await apiDelete(`/sessions/${sessionId}`);
    } catch {
      // session may already be closed
    }
    setConnected(false);
    onClose?.();
  }, [sessionId, onClose]);

  return (
    <div className="glass flex flex-col overflow-hidden rounded-xl">
      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-danger/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
          </div>
          <span className="font-mono text-xs text-text-dim">
            session: {sessionId.slice(0, 8)}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-success animate-pulse" : "bg-danger"
              }`}
            />
            <span className="text-xs text-text-dim">
              {connected ? "active" : "closed"}
            </span>
          </span>
        </div>
        <button
          onClick={handleDisconnect}
          className="rounded px-3 py-1 text-xs font-medium text-danger/80 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          Disconnect
        </button>
      </div>

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto bg-bg p-4 font-mono text-sm leading-relaxed"
        style={{ minHeight: "300px", maxHeight: "500px" }}
      >
        {output ? (
          <pre className="whitespace-pre-wrap break-all text-text">{output}</pre>
        ) : (
          <div className="flex h-full items-center justify-center text-text-dim">
            <p>Session ready. Type a command below.</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-primary-light">$</span>
          <textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Enter command..." : "Session closed"}
            disabled={!connected || running}
            rows={1}
            className="flex-1 resize-none bg-transparent font-mono text-sm text-text placeholder-text-dim focus:outline-none"
          />
          <button
            onClick={() => {
              const value = inputRef.current?.value || "";
              if (value.trim()) handleExec(value.trim());
            }}
            disabled={!connected || running}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-all duration-200 hover:bg-primary-hover disabled:opacity-50"
          >
            {running ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
