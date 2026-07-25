"use client";

import { useState, useCallback } from "react";

export interface Session {
  id: string;
  name?: string;
  status: string;
  created_at: string;
}

interface SidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  creating: boolean;
}

export default function Sidebar({ sessions, activeId, onSelect, onCreate, onDelete, creating }: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a] border-r border-[#1e1e2e] w-56 min-w-[14rem]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e2e]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Sessions</span>
        <button
          onClick={onCreate}
          disabled={creating}
          className="text-[#22d3ee] hover:text-[#06b6d4] text-lg leading-none font-bold disabled:opacity-40"
          title="New session"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-[#475569]">
            No sessions
            <br />
            <span className="text-[#22d3ee] cursor-pointer hover:underline" onClick={onCreate}>
              create one
            </span>
          </div>
        )}

        {sessions.map((s) => {
          const active = s.id === activeId;
          const hovered = s.id === hoveredId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                active
                  ? "border-l-[#22d3ee] bg-[#1a1a2e] text-[#e2e8f0]"
                  : "border-l-transparent hover:bg-[#14142a] text-[#94a3b8]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                s.status === "active" ? "bg-[#22c55e]" : "bg-[#475569]"
              }`} />
              <span className="flex-1 text-[12px] font-mono truncate">
                {s.name || s.id.slice(0, 18)}
              </span>
              {hovered && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  className="text-[#475569] hover:text-[#ef4444] text-[14px] leading-none flex-shrink-0"
                  title="Close session"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
