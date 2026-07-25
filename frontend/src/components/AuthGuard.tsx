"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiGet } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, login } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        localStorage.setItem("nexuss_bash_token", apiKey);
        await apiGet("/health");
        login(apiKey);
      } catch {
        localStorage.removeItem("nexuss_bash_token");
        setError("Invalid API key or connection failed");
      } finally {
        setLoading(false);
      }
    },
    [apiKey, login]
  );

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <span className="text-3xl">&#9889;</span>
          </div>
          <h2 className="text-2xl font-bold text-text">Connect to Nexuss Bash</h2>
          <p className="mt-2 text-sm text-text-muted">
            Enter your API key to access the dashboard
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label
              htmlFor="api-key"
              className="mb-2 block text-sm font-medium text-text-muted"
            >
              API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              required
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm text-text placeholder-text-dim transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Testing connection...
              </span>
            ) : (
              "Connect"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-dim">
          Find your API key in the server configuration or environment variables.
        </p>
      </div>
    </div>
  );
}
