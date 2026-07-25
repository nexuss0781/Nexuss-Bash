import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexuss Bash",
  description: "Containerized Remote Execution Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0c0c14] text-[#e2e8f0] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
