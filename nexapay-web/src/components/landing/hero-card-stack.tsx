function CardChip() {
  return (
    <div className="flex gap-1">
      <div className="h-7 w-10 rounded bg-gradient-to-br from-amber-200/90 via-amber-100/80 to-amber-300/70 shadow-inner" />
      <div className="h-7 w-6 rounded-sm bg-gradient-to-br from-white/30 to-white/5" />
    </div>
  );
}

export function HeroCardStack() {
  return (
    <div className="relative mx-auto flex h-[320px] w-full max-w-[400px] items-center justify-center sm:h-[380px] lg:h-[420px]">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 scale-110 bg-[radial-gradient(closest-side,rgba(0,255,136,0.35)_0%,transparent_70%)] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -inset-10 bg-[radial-gradient(ellipse_at_center,rgba(0,255,136,0.12)_0%,transparent_65%)]"
        aria-hidden
      />

      {/* Back card — electric green */}
      <div className="animate-float-slow absolute left-[8%] top-[18%] z-[1] w-[min(100%,280px)] will-change-transform">
        <div
          className="aspect-[1.586/1] w-full rounded-2xl border border-white/10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85),0_0_60px_-10px_rgba(0,255,136,0.45)]"
          style={{ transform: "rotate(-14deg)" }}
        >
          <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-[#00ff88] via-[#00c96a] to-[#006b3d] p-5">
            <div className="flex items-start justify-between">
              <span className="font-display text-lg text-black/80">NexaPay</span>
              <div className="h-8 w-8 rounded-full overflow-hidden bg-black/10 border border-black/20">
                <img src="/logo.png" alt="NexaPay" className="w-full h-full object-contain opacity-70" />
              </div>
            </div>
            <p className="font-mono text-sm tracking-[0.35em] text-black/70">
              •••• •••• •••• 8842
            </p>
          </div>
        </div>
      </div>

      {/* Middle card — matte dark */}
      <div className="animate-float-mid absolute left-[22%] top-[28%] z-[2] w-[min(100%,280px)] will-change-transform">
        <div
          className="aspect-[1.586/1] w-full rounded-2xl border border-white/[0.12] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.9)]"
          style={{ transform: "rotate(-5deg)" }}
        >
          <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-950 to-black p-5 ring-1 ring-inset ring-white/[0.06]">
            <div className="flex items-start justify-between">
              <CardChip />
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Debit
              </span>
            </div>
            <p className="font-mono text-sm tracking-[0.35em] text-white/35">
              •••• •••• •••• 9011
            </p>
          </div>
        </div>
      </div>

      {/* Front card — glass */}
      <div className="animate-float-fast absolute left-[34%] top-[12%] z-[3] w-[min(100%,290px)] will-change-transform">
        <div
          className="aspect-[1.586/1] w-full rounded-2xl border border-white/25 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.95),0_0_40px_-10px_rgba(0,255,136,0.2)]"
          style={{ transform: "rotate(10deg)" }}
        >
          <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-white/[0.07] p-5 backdrop-blur-xl">
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-[#00ff88]/10"
              aria-hidden
            />
            <div className="relative flex items-start justify-between">
              <span className="font-display text-xl text-white">NexaPay</span>
              <div className="flex h-9 w-12 items-center justify-center rounded-md bg-gradient-to-br from-amber-200/90 to-amber-400/80 shadow-md">
                <span className="text-[10px] font-bold text-amber-950">EMV</span>
              </div>
            </div>
            <div className="relative space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest text-white/45">
                Card holder
              </p>
              <p className="font-display text-2xl tracking-wide text-white">
                folan el folani
              </p>
              <p className="font-mono text-sm tracking-[0.35em] text-white/55">
                •••• •••• •••• 4420
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating CTA */}
      <a
        href="/register"
        className="absolute bottom-[8%] right-[-4%] z-20 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/95 px-5 py-2.5 text-[13px] font-semibold text-[#00ff88] shadow-[0_12px_40px_-12px_rgba(0,255,136,0.5)] backdrop-blur-md transition hover:border-[#00ff88]/40 hover:bg-zinc-900 sm:bottom-[14%] sm:right-0 md:right-[-8%] lg:bottom-[20%]"
      >
        Get Started <span aria-hidden>↗</span>
      </a>
    </div>
  );
}
