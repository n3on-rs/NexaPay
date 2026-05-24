"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { SandboxBanner } from "@/components/sandbox-banner";

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SandboxBanner />
      {children}
    </AuthProvider>
  );
}
