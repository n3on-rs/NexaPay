import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroCardStack } from "./hero-card-stack";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 md:pb-28 md:pt-36">
      {/* Subtle grid overlay */}
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00d4aa]/20 bg-[#00d4aa]/5 px-4 py-1.5 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00d4aa] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00d4aa]" />
            </span>
            <span className="text-[12px] font-medium text-[#00d4aa]">Live in Tunisia</span>
          </div>

          <h1 className="max-w-[800px] font-display text-[clamp(3rem,8vw,5.5rem)] leading-[0.95] tracking-tight">
            Banking that moves at your speed
          </h1>

          <p className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-white/50 md:text-base">
            Open a full bank account in minutes. Virtual card, Tunisian IBAN, instant transfers. No branches, no paperwork, no hidden fees.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Link
              href="https://auth.nexapay.space/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-6 py-3 text-[14px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90 hover:gap-3"
            >
              Open free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-6 py-3 text-[14px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
            >
              How it works
            </Link>
          </div>
        </div>

        {/* Card stack — kept as-is per spec */}
        <div className="mt-16 md:mt-20">
          <HeroCardStack />
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { value: "2 min", label: "Account opening" },
            { value: "0 TND", label: "Internal transfers" },
            { value: "24/7", label: "Available" },
            { value: "3 nodes", label: "BFT consensus" },
          ].map((s) => (
            <div key={s.value} className="rounded-2xl border border-white/[0.06] bg-[#141414] p-5 text-center">
              <p className="text-xl font-bold text-white md:text-2xl">{s.value}</p>
              <p className="mt-1 text-[12px] text-white/40">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
