import { NexaLogoMark } from "@/components/auth/nexa-logo-mark";
import { cn } from "@/lib/utils";

export function AuthBrand({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex items-center gap-3">
        <NexaLogoMark className="!mx-0 size-12 rounded-xl sm:size-14" />
        <span className="font-display text-3xl tracking-[0.14em] text-white sm:text-[2rem]">
          NexaPay
        </span>
      </div>
      <p className="mt-1 text-[11px] text-white/20">
        A <a href="https://backendglitch.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#00d4aa]/60 transition-colors">Glitch Inc</a> / BackendGlitch Division Product
      </p>
    </div>
  );
}
