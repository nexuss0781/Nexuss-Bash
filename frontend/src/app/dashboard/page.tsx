"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { AuthProvider } from "@/lib/auth-context";
import { apiPost, apiGet, apiUpload } from "@/lib/api";

interface RunResult {
  index: number;
  status: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

interface RunEntry {
  run_id: string;
  status: string;
  started_at: string;
  completed_at: string;
  results: RunResult[];
}

function DashboardContent() {
  const [commands, setCommands] = useState("");
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<RunEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiGet<{ data: RunEntry[]; total: number }>("/run");
      setHistory((res.data || []).slice(0, 20));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRun = useCallback(async () => {
    if (!commands.trim()) return;
    setRunning(true);
    setError("");
    setResults(null);

    try {
      const cmds = commands
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await apiPost<{ data: RunEntry }>("/run", {
        commands: cmds,
      });
      setResults(res.data.results);
      setRunId(res.data.run_id);
      fetchHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }, [commands, fetchHistory]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError("");
      setResults(null);

      try {
        const res = await apiUpload<{ data: RunEntry }>("/run", file);
        setResults(res.data.results);
        setRunId(res.data.run_id);
        fetchHistory();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [fetchHistory]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml") || file.name.endsWith(".json"))) {
        handleFileUpload(file);
      } else {
        setError("Only .yaml, .yml, or .json files are accepted");
      }
    },
    [handleFileUpload]
  );

  const runQuick = useCallback(async (cmd: string) => {
    setRunning(true);
    setError("");
    setResults(null);
    setCommands(cmd);

    try {
      const res = await apiPost<{ data: RunEntry }>("/run", {
        commands: [cmd],
      });
      setResults(res.data.results);
      setRunId(res.data.run_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AuthGuard>
          {/* Quick Actions */}
          <div className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-dim">
              Quick Actions
            </h2>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Health Check", cmd: "curl -s http://localhost:3000/health" },
                { label: "List Packages", cmd: "apt list --installed 2>/dev/null | head -20" },
                { label: "System Info", cmd: "uname -a && uptime && df -h /workspace" },
                { label: "Disk Usage", cmd: "du -sh /workspace/* 2>/dev/null || echo 'empty'" },
                { label: "Environment", cmd: "env | sort" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => runQuick(item.cmd)}
                  disabled={running}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Command Input */}
            <div className="lg:col-span-2">
              <div className="glass rounded-xl p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Command Runner</h2>
                  {runId && (
                    <span className="rounded-md bg-surface px-2 py-1 font-mono text-xs text-text-dim">
                      {runId}
                    </span>
                  )}
                </div>

                <textarea
                  value={commands}
                  onChange={(e) => setCommands(e.target.value)}
                  placeholder="Enter commands, one per line...&#10;echo Hello&#10;whoami&#10;ls -la"
                  rows={8}
                  className="w-full rounded-lg border border-border bg-bg p-4 font-mono text-sm text-text placeholder-text-dim transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleRun}
                    disabled={running || !commands.trim()}
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Running...
                      </>
                    ) : (
                      "Run"
                    )}
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text disabled:opacity-50"
                  >
                    {uploading ? "Uploading..." : "Upload YAML"}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".yaml,.yml,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="hidden"
                  />
                </div>

                {/* YAML Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`drop-zone mt-4 rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border-light"
                  }`}
                >
                  <p className="text-sm text-text-dim">
                    Drag and drop a .yaml or .json file here
                  </p>
                </div>

                {error && (
                  <div className="mt-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                    {error}
                  </div>
                )}

                {/* Results */}
                {results && results.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="text-sm font-semibold text-text-muted">
                      Results ({results.length} commands)
                    </h3>
                    {results.map((result) => (
                      <div
                        key={result.index}
                        className="rounded-lg border border-border bg-bg p-4"
                      >
                        <div className="mb-2 flex items-center gap-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              result.status === "PASS"
                                ? "bg-success/10 text-success"
                                : result.status === "FAIL"
                                  ? "bg-danger/10 text-danger"
                                  : "bg-warning/10 text-warning"
                            }`}
                          >
                            {result.status}
                          </span>
                          <span className="font-mono text-xs text-text-dim">
                            exit {result.exit_code} | {result.duration_ms}ms
                          </span>
                        </div>

                        {result.stdout && (
                          <pre className="mb-2 whitespace-pre-wrap break-all rounded bg-surface p-3 font-mono text-xs text-text">
                            {result.stdout}
                          </pre>
                        )}

                        {result.stderr && (
                          <pre className="whitespace-pre-wrap break-all rounded bg-danger/5 p-3 font-mono text-xs text-danger/80">
                            {result.stderr}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* History Sidebar */}
            <div>
              <div className="glass rounded-xl p-6">
                <h2 className="mb-4 text-lg font-semibold">History</h2>

                {history.length === 0 ? (
                  <p className="text-sm text-text-dim">No runs yet</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((entry) => (
                      <button
                        key={entry.run_id}
                        onClick={() => {
                          setResults(entry.results);
                          setRunId(entry.run_id);
                        }}
                        className="w-full rounded-lg border border-border bg-surface p-3 text-left transition-all duration-200 hover:border-primary/20"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-text-muted">
                            {entry.run_id.slice(0, 8)}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              entry.status === "completed"
                                ? "text-success"
                                : entry.status === "failed"
                                  ? "text-danger"
                                  : "text-warning"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-text-dim">
                          {entry.results?.length || 0} commands
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </AuthGuard>
      </div>
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
