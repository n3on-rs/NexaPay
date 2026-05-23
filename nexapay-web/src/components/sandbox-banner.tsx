"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

export function useSandbox() {
  const [isSandbox, setIsSandbox] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSandbox(window.location.hostname.startsWith("sandbox."));
    }
  }, []);
  return isSandbox;
}

export function SandboxBanner() {
  const isSandbox = useSandbox();
  if (!isSandbox) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-[12px] font-medium text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>This is a sandbox environment. All transactions and balances here are simulated — no real money is involved.</span>
    </div>
  );
}
