import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexuss Bash - Containerized Remote Execution",
  description:
    "One-liner command execution, YAML pipelines, file uploads, and runtime package management through a clean REST API.",
  keywords: [
    "remote execution",
    "container",
    "bash",
    "API",
    "DevOps",
    "CLI",
    "pipelines",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
