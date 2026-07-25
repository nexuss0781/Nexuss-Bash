"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";

export interface TermLine {
  id: number;
  type: "command" | "stdout" | "stderr" | "system" | "error";
  content: string;
}

interface TerminalProps {
  lines: TermLine[];
  onRun: (cmd: string) => Promise<void>;
  running: boolean;
  prompt?: string;
}

export default function Terminal({ lines, onRun, running, prompt }: TerminalProps) {
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const user = prompt || "root@nexuss";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const focus = () => inputRef.current?.focus();

  const handleSubmit = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setInput("");
    setCmdHistory((p) => [...p, cmd]);
    setHistIdx(-1);
    await onRun(cmd);
  }, [input, running, onRun]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistIdx((prev) => {
        const next = prev + 1;
        if (next < cmdHistory.length) {
          setInput(cmdHistory[cmdHistory.length - 1 - next]);
          return next;
        }
        return prev;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistIdx((prev) => {
        const next = prev - 1;
        if (next >= 0) {
          setInput(cmdHistory[cmdHistory.length - 1 - next]);
          return next;
        }
        setInput("");
        return -1;
      });
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
    }
  }, [cmdHistory, histIdx, handleSubmit]);

  return (
    <div className="flex flex-col h-full bg-[#0c0c14] font-mono text-[13px] leading-[1.35] select-text" onClick={focus}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {lines.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap break-words">
            {line.type === "command" && (
              <span>
                <span className="text-[#22d3ee] font-bold">{user}</span>
                <span className="text-[#64748b]">:</span>
                <span className="text-[#a78bfa]">~</span>
                <span className="text-[#64748b]">$ </span>
                <span className="text-[#e2e8f0]">{line.content}</span>
              </span>
            )}
            {line.type === "stdout" && (
              <span className="text-[#d4d4d8]">{line.content}</span>
            )}
            {line.type === "stderr" && (
              <span className="text-[#f87171]">{line.content}</span>
            )}
            {line.type === "error" && (
              <span className="text-[#fbbf24]">{line.content}</span>
            )}
            {line.type === "system" && (
              <span className="text-[#64748b] italic">{line.content}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 flex items-center border-t border-[#1e1e2e] bg-[#0c0c14] px-3 py-1.5" onClick={focus}>
        <span className="text-[#22d3ee] font-bold whitespace-nowrap">{user}</span>
        <span className="text-[#64748b]">:</span>
        <span className="text-[#a78bfa]">~</span>
        <span className="text-[#64748b]">$ </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={running}
          className="flex-1 bg-transparent text-[#e2e8f0] outline-none font-mono caret-[#22d3ee]"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
        {running && (
          <span className="ml-2 text-[#22d3ee] animate-pulse">exec</span>
        )}
      </div>
    </div>
  );
}
