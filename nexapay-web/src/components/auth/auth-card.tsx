import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[#101216] p-7 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] backdrop-blur-sm sm:p-9",
        className,
      )}
    >
      {children}
    </div>
  );
}
