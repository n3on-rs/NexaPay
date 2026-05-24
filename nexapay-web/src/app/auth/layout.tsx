"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    // Check if we have a session by calling /auth/me
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.full_name) {
          // Already logged in — redirect to sandbox
          window.location.href = "https://sandbox.nexapay.space";
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" />
          <p className="text-sm text-white/40">Checking session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
