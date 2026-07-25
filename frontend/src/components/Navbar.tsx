"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();

  return (
    <nav className="glass-strong sticky top-0 z-50 border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold transition-colors hover:text-primary-light"
        >
          <span className="text-xl">&#9889;</span>
          <span className="gradient-text">Nexuss Bash</span>
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                pathname === link.href
                  ? "bg-primary/10 text-primary-light"
                  : "text-text-muted hover:bg-surface-hover hover:text-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
                <span className="text-xs text-text-muted">Connected</span>
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-all duration-200 hover:border-danger/50 hover:text-danger"
              >
                Disconnect
              </button>
            </>
          )}
          {!isAuthenticated && (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary-hover"
            >
              Get Started
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
