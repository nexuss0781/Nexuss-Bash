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
    <div className="flex items-center justify-center min-h-screen bg-[#0c0c14]">
      <div className="w-full max-w-sm border border-[#1e1e2e] rounded bg-[#0f0f1a] p-6">
        <div className="mb-6 text-center">
          <div className="text-2xl font-mono text-[#22d3ee] font-bold mb-1">nexuss@bash</div>
          <div className="text-[11px] text-[#475569] font-mono">authentication required</div>
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="block text-[11px] text-[#64748b] mb-1 font-mono">API_KEY</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="enter your api key"
              required
              className="w-full bg-[#1a1a2e] border border-[#1e1e2e] text-[#e2e8f0] text-[13px] font-mono rounded px-3 py-2 outline-none focus:border-[#22d3ee] placeholder-[#475569]"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-[12px] text-[#f87171] font-mono">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full py-2 bg-[#22d3ee]/10 border border-[#22d3ee]/30 text-[#22d3ee] text-[12px] font-mono rounded hover:bg-[#22d3ee]/20 disabled:opacity-40"
          >
            {loading ? "connecting..." : "connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
