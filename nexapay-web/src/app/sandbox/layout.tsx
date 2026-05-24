"use client";

import * as React from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { SandboxBanner } from "@/components/sandbox-banner";

function BannerPadding() {
  const [isSandbox, setIsSandbox] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSandbox(window.location.hostname.startsWith("sandbox."));
    }
  }, []);
  // Push content down below the fixed banner
  return isSandbox ? <div className="h-9" /> : null;
}

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SandboxBanner />
      <BannerPadding />
      {children}
    </AuthProvider>
  );
}
