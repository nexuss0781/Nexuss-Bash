"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

interface ResourceData {
  memory: { total_mb: number; used_mb: number; pct: number };
  disk: { total_mb: number; used_mb: number; pct: number };
  load_avg: number[];
  status: string;
  sessions_active: number;
  jobs_running: number;
}

interface PackageEntry {
  name: string;
  manager: string;
  installed_at: string;
}

interface HealthData {
  status: string;
  version: string;
  uptime_sec: number;
}

type Tab = "sys" | "pkgs" | "env";

interface SystemPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function SystemPanel({ collapsed, onToggle }: SystemPanelProps) {
  const [tab, setTab] = useState<Tab>("sys");
  const [resources, setResources] = useState<ResourceData | null>(null);
  const [packages, setPackages] = useState<PackageEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgMgr, setPkgMgr] = useState("apt");
  const [installing, setInstalling] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [r, p, h] = await Promise.all([
        apiGet<{ data: ResourceData }>("/resources"),
        apiGet<{ data: PackageEntry[]; total: number }>("/packages"),
        apiGet<{ data: HealthData }>("/health"),
      ]);
      setResources(r.data);
      setPackages(p.data || []);
      setHealth(h.data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!collapsed) {
      refresh();
      const iv = setInterval(refresh, 8000);
      return () => clearInterval(iv);
    }
  }, [collapsed, refresh]);

  useEffect(() => {
    const saved = localStorage.getItem("nexuss_bash_token") || "";
    setToken(saved);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!pkgName.trim()) return;
    setInstalling(true);
    try {
      await apiPost("/packages/install", { name: pkgName.trim(), manager: pkgMgr });
      setPkgName("");
      refresh();
    } catch {}
    setInstalling(false);
  }, [pkgName, pkgMgr, refresh]);

  const handleRemove = useCallback(async (name: string) => {
    try {
      await apiDelete(`/packages/${name}`);
      refresh();
    } catch {}
  }, [refresh]);

  const handleSaveToken = useCallback(() => {
    localStorage.setItem("nexuss_bash_token", token);
  }, [token]);

  if (collapsed) {
    return (
      <div className="flex items-center h-8 bg-[#0f0f1a] border-t border-[#1e1e2e] px-3 cursor-pointer select-none" onClick={onToggle}>
        <span className="text-[11px] text-[#64748b] mr-3">▲ system</span>
        {resources && (
          <>
            <BarMini label="RAM" pct={resources.memory.pct} />
            <BarMini label="DSK" pct={resources.disk.pct} />
            <span className="ml-2 text-[10px] text-[#475569]">load {resources.load_avg?.[0]?.toFixed(1) || "0"}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#0f0f1a] border-t border-[#1e1e2e] h-52 min-h-[13rem]">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] px-3 h-8 flex-shrink-0">
        <div className="flex items-center gap-0">
          {([
            { key: "sys" as Tab, label: "System" },
            { key: "pkgs" as Tab, label: "Packages" },
            { key: "env" as Tab, label: "Environment" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                tab === t.key
                  ? "text-[#22d3ee] border-b border-[#22d3ee]"
                  : "text-[#64748b] hover:text-[#94a3b8]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[#475569] cursor-pointer hover:text-[#94a3b8]" onClick={onToggle}>▼</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 text-[12px]">
        {tab === "sys" && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            {resources && (
              <>
                <StatRow label="Memory" value={`${resources.memory.used_mb}MB / ${resources.memory.total_mb}MB`} pct={resources.memory.pct} />
                <StatRow label="Disk" value={`${resources.disk.used_mb}MB / ${resources.disk.total_mb}MB`} pct={resources.disk.pct} />
                <StatRow label="Load Avg" value={resources.load_avg?.map((l) => l.toFixed(2)).join("  ") || "—"} />
                <StatRow label="Status" value={resources.status} color={resources.status === "ok" ? "#22c55e" : "#ef4444"} />
                <StatRow label="Sessions" value={`${resources.sessions_active} active`} />
                <StatRow label="Jobs" value={`${resources.jobs_running} running`} />
              </>
            )}
            {health && (
              <>
                <StatRow label="Version" value={health.version || "—"} />
                <StatRow label="Uptime" value={formatUptime(health.uptime_sec)} />
                <StatRow label="Health" value={health.status} color={health.status === "ok" ? "#22c55e" : "#f59e0b"} />
              </>
            )}
            {!resources && !health && (
              <span className="text-[#475569] col-span-2">Loading...</span>
            )}
          </div>
        )}

        {tab === "pkgs" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={pkgMgr}
                onChange={(e) => setPkgMgr(e.target.value)}
                className="bg-[#1a1a2e] border border-[#1e1e2e] text-[#94a3b8] text-[11px] rounded px-2 py-1 outline-none"
              >
                <option value="apt">apt</option>
                <option value="pip">pip</option>
                <option value="npm">npm</option>
                <option value="composer">composer</option>
              </select>
              <input
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                placeholder="package name"
                className="flex-1 bg-[#1a1a2e] border border-[#1e1e2e] text-[#e2e8f0] text-[11px] rounded px-2 py-1 outline-none focus:border-[#22d3ee]"
              />
              <button
                onClick={handleInstall}
                disabled={installing || !pkgName.trim()}
                className="px-3 py-1 bg-[#22d3ee]/10 text-[#22d3ee] text-[11px] rounded hover:bg-[#22d3ee]/20 disabled:opacity-40"
              >
                {installing ? "..." : "install"}
              </button>
            </div>
            <div className="max-h-24 overflow-y-auto">
              {packages.length === 0 && (
                <span className="text-[#475569]">No packages installed</span>
              )}
              {packages.map((p) => (
                <div key={`${p.name}-${p.manager}`} className="flex items-center justify-between py-0.5 group">
                  <span className="text-[#94a3b8]">
                    <span className="text-[#a78bfa]">{p.manager}</span>
                    <span className="text-[#475569]">/</span>
                    {p.name}
                  </span>
                  <button
                    onClick={() => handleRemove(p.name)}
                    className="text-[#475569] hover:text-[#ef4444] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    rm
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "env" && (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[#64748b] w-20 text-right">API_KEY</span>
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="flex-1 bg-[#1a1a2e] border border-[#1e1e2e] text-[#e2e8f0] text-[11px] font-mono rounded px-2 py-1 outline-none focus:border-[#22d3ee]"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="px-2 py-1 text-[10px] text-[#64748b] hover:text-[#94a3b8] border border-[#1e1e2e] rounded"
                >
                  {showToken ? "hide" : "show"}
                </button>
                <button
                  onClick={handleSaveToken}
                  className="px-2 py-1 text-[10px] text-[#22d3ee] hover:bg-[#22d3ee]/10 border border-[#22d3ee]/30 rounded"
                >
                  save
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#64748b] w-20 text-right">API_URL</span>
                <span className="text-[#94a3b8] text-[11px] font-mono">
                  https://nexuss-bash.onrender.com
                </span>
              </div>
            </div>
            <div className="text-[10px] text-[#475569] pt-1">
              Token is stored in browser localStorage. Changes apply to all API requests.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, pct, color }: { label: string; value: string; pct?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#64748b] w-20 text-right">{label}</span>
      {pct !== undefined && (
        <div className="w-24 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: pct > 80 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e",
            }}
          />
        </div>
      )}
      <span className="text-[#d4d4d8] font-mono" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

function BarMini({ label, pct }: { label: string; pct: number }) {
  return (
    <span className="flex items-center gap-1.5 ml-3">
      <span className="text-[10px] text-[#475569]">{label}</span>
      <span className="w-12 h-1 bg-[#1e1e2e] rounded-full overflow-hidden inline-block">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: pct > 80 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e",
          }}
        />
      </span>
      <span className="text-[10px] text-[#64748b]">{Math.round(pct)}%</span>
    </span>
  );
}

function formatUptime(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
