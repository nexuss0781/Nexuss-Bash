"use client";

import Link from "next/link";
import { AuthProvider } from "@/lib/auth-context";

function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0c0c14] px-4">
      <div className="max-w-xl text-center">
        <div className="mb-6 text-5xl font-mono text-[#22d3ee] font-bold tracking-tight">
          nexuss<span className="text-[#64748b]">@</span>bash<span className="text-[#22d3ee]">_</span>
        </div>
        <p className="text-[#94a3b8] text-sm mb-1 font-mono">
          Containerized Remote Execution Platform
        </p>
        <p className="text-[#475569] text-xs mb-8 font-mono">
          Shell access &middot; YAML pipelines &middot; Package management &middot; REST API
        </p>

        <div className="mb-8 overflow-hidden rounded border border-[#1e1e2e] text-left">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-[#0f0f1a] border-b border-[#1e1e2e]">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]/60" />
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]/60" />
            <span className="w-2 h-2 rounded-full bg-[#22c55e]/60" />
            <span className="ml-2 text-[10px] text-[#475569] font-mono">terminal</span>
          </div>
          <pre className="px-4 py-3 bg-[#0c0c14] text-[12px] font-mono leading-relaxed">
            <code>
              <span className="text-[#22d3ee]">root@nexuss</span>
              <span className="text-[#64748b]">:</span>
              <span className="text-[#a78bfa]">~</span>
              <span className="text-[#64748b]">$ </span>
              <span className="text-[#e2e8f0]">curl -s https://nexuss-bash.onrender.com/health</span>
              {"\n"}
              <span className="text-[#d4d4d8]">{'{ "status": "ok", "version": "1.1.0" }'}</span>
              {"\n\n"}
              <span className="text-[#22d3ee]">root@nexuss</span>
              <span className="text-[#64748b]">:</span>
              <span className="text-[#a78bfa]">~</span>
              <span className="text-[#64748b]">$ </span>
              <span className="text-[#e2e8f0]">pip install parad && parad run "echo hello"</span>
            </code>
          </pre>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-[#22d3ee] text-[#0c0c14] text-sm font-semibold rounded hover:bg-[#06b6d4] transition-colors"
          >
            Open Terminal
          </Link>
          <a
            href="https://github.com/nexuss0781/Nexuss-Bash"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 border border-[#1e1e2e] text-[#94a3b8] text-sm rounded hover:border-[#334155] hover:text-[#d4d4d8] transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <LandingPage />
    </AuthProvider>
  );
}
