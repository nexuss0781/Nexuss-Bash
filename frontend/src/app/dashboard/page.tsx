"use client";

import { useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import { AuthProvider } from "@/lib/auth-context";
import { apiPost, apiGet } from "@/lib/api";
import Sidebar, { Session } from "@/components/Sidebar";
import Terminal, { TermLine } from "@/components/Terminal";
import SystemPanel from "@/components/SystemPanel";

let lineId = 0;
function nextId() { return ++lineId; }

function DashboardContent() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [termLines, setTermLines] = useState<TermLine[]>([
    { id: nextId(), type: "system", content: "Nexuss Bash v1.1.0 — Containerized Remote Execution" },
    { id: nextId(), type: "system", content: 'Type "help" for available commands.\n' },
  ]);
  const [running, setRunning] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(true);

  const appendLine = useCallback((line: TermLine) => {
    setTermLines((prev) => [...prev, line]);
  }, []);

  const appendLines = useCallback((lines: TermLine[]) => {
    setTermLines((prev) => [...prev, ...lines]);
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await apiGet<{ data: Session[]; total: number }>("/sessions");
      setSessions(res.data || []);
    } catch {}
  }, []);

  const handleCreateSession = useCallback(async () => {
    setCreating(true);
    try {
      const res = await apiPost<{ data: Session }>("/sessions");
      const newSession = res.data;
      setSessions((prev) => [...prev, newSession]);
      setActiveSession(newSession.id);
      appendLine({ id: nextId(), type: "system", content: `Session ${newSession.id.slice(0, 12)} created.` });
    } catch (err) {
      appendLine({ id: nextId(), type: "error", content: `Failed to create session: ${err instanceof Error ? err.message : "unknown error"}` });
    }
    setCreating(false);
  }, [appendLine]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await apiPost(`/sessions/${id}/exec`, { command: "exit" }).catch(() => {});
      const { apiDelete } = await import("@/lib/api");
      await apiDelete(`/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession === id) setActiveSession(null);
      appendLine({ id: nextId(), type: "system", content: `Session ${id.slice(0, 12)} closed.` });
    } catch {}
  }, [activeSession, appendLine]);

  const handleRun = useCallback(async (cmd: string) => {
    appendLine({ id: nextId(), type: "command", content: cmd });

    if (cmd.trim() === "help") {
      appendLines([
        { id: nextId(), type: "stdout", content: "Available commands:" },
        { id: nextId(), type: "stdout", content: "  help              Show this help" },
        { id: nextId(), type: "stdout", content: "  clear             Clear terminal" },
        { id: nextId(), type: "stdout", content: "  <shell command>   Execute any shell command" },
        { id: nextId(), type: "stdout", content: "  sys               Open system panel" },
        { id: nextId(), type: "stdout", content: "" },
        { id: nextId(), type: "stdout", content: "Ctrl+C  Cancel input | Ctrl+L  Clear" },
      ]);
      return;
    }

    if (cmd.trim() === "clear") {
      setTermLines([]);
      return;
    }

    if (cmd.trim() === "sys") {
      setPanelCollapsed(false);
      return;
    }

    setRunning(true);
    try {
      const res = await apiPost<{ data: { results: Array<{ status: string; stdout: string; stderr: string; exit_code: number }> } }>("/run", {
        commands: [cmd],
      });
      const results = res.data.results || [];
      for (const r of results) {
        if (r.stdout) {
          appendLine({ id: nextId(), type: "stdout", content: r.stdout });
        }
        if (r.stderr) {
          appendLine({ id: nextId(), type: "stderr", content: r.stderr });
        }
        if (r.exit_code !== 0 && r.status !== "completed") {
          appendLine({ id: nextId(), type: "error", content: `exit code: ${r.exit_code}` });
        }
      }
    } catch (err) {
      appendLine({ id: nextId(), type: "error", content: err instanceof Error ? err.message : "Request failed" });
    }
    setRunning(false);
  }, [appendLine, appendLines]);

  return (
    <div className="flex flex-col h-screen bg-[#0c0c14] overflow-hidden">
      <AuthGuard>
        <div className="flex flex-1 min-h-0">
          <Sidebar
            sessions={sessions}
            activeId={activeSession}
            onSelect={setActiveSession}
            onCreate={handleCreateSession}
            onDelete={handleDeleteSession}
            creating={creating}
          />
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center h-8 bg-[#0f0f1a] border-b border-[#1e1e2e] px-3 flex-shrink-0 select-none">
              <span className="text-[11px] text-[#64748b]">
                {activeSession ? `session: ${activeSession.slice(0, 12)}` : "no session"}
              </span>
              <span className="ml-auto text-[11px] text-[#475569]">
                nexuss-bash ~ /workspace
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <Terminal
                lines={termLines}
                onRun={handleRun}
                running={running}
              />
            </div>
          </div>
        </div>
        <SystemPanel
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed((p) => !p)}
        />
      </AuthGuard>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
