import type { ReactNode } from "react";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#080808]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-15%,rgba(0,255,136,0.07),transparent_55%)]"
        aria-hidden
      />
      <div className="relative flex flex-1 flex-col px-4 py-10 sm:py-14">{children}</div>
      <p className="pb-8 text-center text-[11px] text-white/28">
        NexaPay — secure digital banking.
      </p>
    </div>
  );
}
