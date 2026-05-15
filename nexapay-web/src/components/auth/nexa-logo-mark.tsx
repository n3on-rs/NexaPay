import { cn } from "@/lib/utils";

export function NexaLogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#00FF88] shadow-[0_0_40px_-8px_rgba(0,255,136,0.55)]",
        className,
      )}
      aria-hidden
    >
      <span className="font-display text-3xl leading-none text-[#080808]">N</span>
    </div>
  );
}
