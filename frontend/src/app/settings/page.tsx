"use client";

import { useState, useCallback, useEffect } from "react";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { apiGet, BASE_URL } from "@/lib/api";

function SettingsContent() {
  const { token, login, logout } = useAuth();
  const [newToken, setNewToken] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [apiUrl, setApiUrl] = useState(BASE_URL);
  const [showToken, setShowToken] = useState(false);

  const testConnection = useCallback(async () => {
    setConnectionStatus("testing");
    setStatusMessage("");

    try {
      const res = await apiGet<{ data: { status: string; version: string } }>(
        "/health"
      );
      setConnectionStatus("ok");
      setStatusMessage(
        `Connected — v${res.data.version}, status: ${res.data.status}`
      );
    } catch (err: unknown) {
      setConnectionStatus("error");
      setStatusMessage(
        err instanceof Error ? err.message : "Connection failed"
      );
    }
  }, []);

  useEffect(() => {
    if (token) testConnection();
  }, [token, testConnection]);

  const handleSaveToken = useCallback(() => {
    if (!newToken.trim()) return;
    login(newToken.trim());
    setNewToken("");
  }, [newToken, login]);

  const handleClearData = useCallback(() => {
    localStorage.clear();
    logout();
  }, [logout]);

  const maskedToken = token
    ? token.slice(0, 6) + "..." + token.slice(-4)
    : "Not set";

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <AuthGuard>
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="mt-1 text-sm text-text-muted">
                Manage your connection and preferences
              </p>
            </div>

            {/* Connection Status */}
            <div className="glass rounded-xl p-6">
              <h2 className="mb-4 text-lg font-semibold">Connection Status</h2>
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    connectionStatus === "ok"
                      ? "bg-success animate-pulse-glow"
                      : connectionStatus === "error"
                        ? "bg-danger"
                        : connectionStatus === "testing"
                          ? "bg-warning animate-pulse"
                          : "bg-text-dim"
                  }`}
                />
                <span className="text-sm text-text-muted">
                  {connectionStatus === "idle" && "Not tested yet"}
                  {connectionStatus === "testing" && "Testing..."}
                  {connectionStatus === "ok" && statusMessage}
                  {connectionStatus === "error" && statusMessage}
                </span>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-text-muted">
                  API Base URL
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <button
                    onClick={testConnection}
                    disabled={connectionStatus === "testing"}
                    className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text disabled:opacity-50"
                  >
                    Test Connection
                  </button>
                </div>
              </div>
            </div>

            {/* Current Token */}
            <div className="glass rounded-xl p-6">
              <h2 className="mb-4 text-lg font-semibold">API Key</h2>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-text-muted">
                  Current Key
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text-dim">
                    {showToken ? token : maskedToken}
                  </div>
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs font-medium text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-muted">
                  Update Key
                </label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="Enter new API key"
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text placeholder-text-dim transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <button
                    onClick={handleSaveToken}
                    disabled={!newToken.trim()}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary-hover disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="glass rounded-xl border-danger/20 p-6">
              <h2 className="mb-2 text-lg font-semibold text-danger">
                Danger Zone
              </h2>
              <p className="mb-4 text-sm text-text-muted">
                Clear all local data and disconnect from the server.
              </p>
              <button
                onClick={handleClearData}
                className="rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger transition-all duration-200 hover:bg-danger/10"
              >
                Clear Data & Disconnect
              </button>
            </div>
          </div>
        </AuthGuard>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthProvider>
      <SettingsContent />
    </AuthProvider>
  );
}
