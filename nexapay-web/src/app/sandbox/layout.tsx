"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { SandboxBanner } from "@/components/sandbox-banner";

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <SandboxBanner />
      <div className="flex-1 relative" style={{ transform: "translateZ(0)" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </div>
    </div>
  );
}
