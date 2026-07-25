"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/lib/auth-context";

function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              v1.1.0 — Now with PTY Sessions
            </div>

            <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl">
              <span className="gradient-text">&#9889; Nexuss Bash</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-text-muted sm:text-xl">
              Containerized Remote Execution Platform
            </p>

            <p className="mx-auto mt-4 max-w-xl text-sm text-text-dim">
              One-liner command execution, YAML pipelines, file uploads, and
              runtime package management — all through a clean REST API.
            </p>

            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="glow-hover rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary-hover"
              >
                Get Started
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-border bg-surface px-8 py-3 text-sm font-semibold text-text-muted transition-all duration-200 hover:border-border-light hover:text-text"
              >
                View Docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-bg py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Everything you need</h2>
            <p className="mt-3 text-text-muted">
              A complete remote execution toolkit
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Command Runner",
                desc: "Send a list of commands, get structured results back. Each command runs to completion with full stdout/stderr capture.",
                icon: ">_",
              },
              {
                title: "Pipelines",
                desc: "Define multi-step workflows in YAML with dependencies, parallel steps, and conditional logic.",
                icon: "{}",
              },
              {
                title: "PTY Sessions",
                desc: "Interactive bash shells with full terminal emulation. Create, execute, and manage persistent sessions.",
                icon: "#",
              },
              {
                title: "Multi-Language",
                desc: "Execute Python, Node.js, Bash, or PHP scripts. Write in any language, run on the server.",
                icon: "</>",
              },
              {
                title: "Package Management",
                desc: "Install apt, pip, npm, or composer packages at runtime. Dependencies are handled for you.",
                icon: "+",
              },
              {
                title: "Resource Monitoring",
                desc: "Real-time RAM, disk, and CPU tracking with automatic throttling to keep things stable.",
                icon: "~",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="glass glow-hover rounded-xl p-6 transition-all duration-300 hover:border-primary/20"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 font-mono text-lg text-primary-light">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-text">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-text-muted">
              Three steps to remote execution
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Write commands",
                desc: "Define your commands as a JSON array or YAML file. Each command runs sequentially.",
              },
              {
                step: "02",
                title: "Send one request",
                desc: "POST to /run with your commands. One API call starts the entire execution.",
              },
              {
                step: "03",
                title: "Get results",
                desc: "Receive structured results with stdout, stderr, exit codes, and timing for every command.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface font-mono text-2xl font-bold text-primary-light">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-text">{item.title}</h3>
                <p className="mt-3 text-sm text-text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Example */}
      <section className="border-t border-border bg-bg py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Clean API</h2>
            <p className="mt-3 text-text-muted">
              One endpoint, one response, zero complexity
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-danger/60" />
              <span className="h-3 w-3 rounded-full bg-warning/60" />
              <span className="h-3 w-3 rounded-full bg-success/60" />
              <span className="ml-4 font-mono text-xs text-text-dim">
                terminal
              </span>
            </div>
            <pre className="!m-0 !rounded-none !border-0 !bg-bg p-6">
              <code>{`curl -X POST https://nexuss-bash.onrender.com/run \\
  -H "Authorization: Bearer your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "commands": [
      "echo Hello from Nexuss Bash",
      "python3 -c \\"import sys; print(sys.version)\\"",
      "ls -la /workspace"
    ]
  }'`}</code>
            </pre>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-surface px-4 py-3">
              <span className="font-mono text-xs text-text-dim">response</span>
            </div>
            <pre className="!m-0 !rounded-none !border-0 !bg-bg p-6">
              <code>{`{
  "data": {
    "run_id": "a1b2c3d4",
    "status": "completed",
    "results": [
      {
        "index": 0,
        "status": "PASS",
        "stdout": "Hello from Nexuss Bash",
        "stderr": "",
        "exit_code": 0,
        "duration_ms": 12
      },
      {
        "index": 1,
        "status": "PASS",
        "stdout": "3.11.0 (main, ...)",
        "stderr": "",
        "exit_code": 0,
        "duration_ms": 45
      }
    ]
  }
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span>&#9889;</span>
              <span>Nexuss Bash</span>
              <span className="text-text-dim">|</span>
              <span className="text-text-dim">MIT License</span>
            </div>
            <a
              href="https://github.com/nexuss0781/Nexuss-Bash"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-text-muted transition-colors duration-200 hover:text-text"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
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
