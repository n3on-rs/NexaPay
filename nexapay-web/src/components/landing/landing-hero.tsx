import Link from "next/link";

import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";

import { HeroCardStack } from "./hero-card-stack";

const stats = [
  { value: "2 min", label: "Instant account opening" },
  { value: "0 TND", label: "Zero-fee internal transfers" },
];

export function LandingHero() {
  return (
    <section
      id="features"
      className="relative overflow-hidden pb-16 pt-24 md:pb-24 md:pt-28 lg:pt-32"
    >
      <div className="bg-plus-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-[#00ff88]/[0.07] to-transparent" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <h1 className="font-display text-glitch-display mx-auto max-w-[1100px] text-center text-[clamp(3.25rem,11vw,7.25rem)] leading-[0.9]">
          <span className="block text-white">New era of</span>
          <span className="mt-1 block text-[#00ff88]">Banking.</span>
        </h1>

        <div className="mt-14 flex flex-col gap-12 lg:mt-20 lg:flex-row lg:items-start lg:justify-between lg:gap-6 xl:gap-10">
          {/* Left column */}
          <div
            id="how-it-works"
            className="flex max-w-md flex-col gap-8 lg:max-w-[340px] lg:pt-6 xl:max-w-[380px]"
          >
            <div className="flex gap-4">
              <div className="mt-2 h-px w-10 shrink-0 bg-[#00ff88]" />
              <p className="text-[15px] leading-relaxed text-white/65">
                Open a full bank account in minutes. No branches. No paperwork.
                Fully managed from your phone.
              </p>
            </div>

            <Button
              nativeButton={false}
              render={<Link href="#how-it-works" />}
              className="group relative flex h-auto min-h-[56px] w-full items-center justify-between gap-3 rounded-full border border-white/[0.08] bg-zinc-900/90 py-1.5 pr-1.5 pl-6 text-left shadow-[0_20px_50px_-28px_rgba(0,0,0,0.9)] hover:bg-zinc-800/90"
            >
              <span className="text-[14px] font-medium leading-snug text-white">
                <span className="text-white/90">How NexaPay works</span>
                <span className="text-white/40"> / </span>
                <span className="text-white/55">In 3 simple steps</span>
              </span>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#00ff88] text-black transition group-hover:scale-105">
                <Play className="size-5 fill-current" aria-hidden />
              </span>
            </Button>
          </div>

          {/* Center — cards */}
          <div className="flex flex-1 justify-center lg:px-4">
            <HeroCardStack />
          </div>

          {/* Stats — top right */}
          <div className="flex flex-row justify-end gap-3 sm:gap-4 lg:w-52 lg:flex-col lg:justify-start lg:pt-2">
            {stats.map((s) => (
              <div
                key={s.value}
                className="w-full max-w-[200px] flex-1 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-sm sm:max-w-[220px] lg:max-w-none lg:flex-none"
              >
                <p className="font-display text-glitch-display text-[clamp(2rem,5vw,2.75rem)] text-white">
                  {s.value}
                </p>
                <p className="mt-3 text-[12px] leading-snug text-white/45 sm:text-[13px]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
