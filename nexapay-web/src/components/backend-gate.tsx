"use client";

import { useEffect, useState, useRef } from "react";

const HEALTH_URL = "/api/health";
const POLL_INTERVAL = 3000;
const MAX_WAIT = 120_000;

type State = "checking" | "waking" | "ready" | "timeout";

const JOKES = [
  "Our server went to get chicha. Back soon.",
  "A cat unplugged the server. We're looking for the cat.",
  "The backend took a lunch break. Lablabi break, actually.",
  "Server's on café time. Tunisian servers run on espresso.",
  "Someone tripped over the Ethernet cable in the data center.",
  "Backend's loading like Tunisian bureaucracy — patience, inshallah.",
  "The server's stuck in traffic on the A1. Happens to everyone.",
  "Our hamsters need a break. They are unionized.",
  "Za3ma the server will be back soon. Trust.",
  "Backend went to recharge its 3abiya. Give it a moment.",
  "Server is currently in a deep philosophical debate about why it crashed.",
  "Even servers need a siesta. This one took one without asking.",
  "Backend went to buy pain au chocolat. Hope it brings enough for everyone.",
];

export default function BackendGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [elapsed, setElapsed] = useState(0);
  const [joke] = useState(() => JOKES[Math.floor(Math.random() * JOKES.length)]);
  const startRef = useRef(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    startRef.current = Date.now();

    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(HEALTH_URL, {
          signal: controller.signal,
          credentials: "omit",
        });
        clearTimeout(timeout);

        if (res.ok && mountedRef.current) {
          setState("ready");
          if (timer) clearInterval(timer);
          return;
        }
      } catch {}

      if (!mountedRef.current) return;

      attempts++;
      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(secs);

      if (secs > 120) {
        setState("timeout");
        if (timer) clearInterval(timer);
        return;
      }

      if (attempts === 1) setState("waking");
    };

    check();
    timer = setInterval(check, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (state === "ready") {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0b0b0b] text-white">
      {/* Glitch container */}
      <div className="flex flex-col items-center gap-8 px-6">
        {/* Logo + NexaPay with glitch */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/logo.png"
            alt="NexaPay"
            className="h-14 w-14 object-contain animate-pulse"
          />

          <div className="relative">
            {/* Glitch layers */}
            <h1
              className="glitch-text text-4xl font-bold tracking-[0.15em] text-[#00d4aa] select-none"
              data-text="NexaPay"
            >
              NexaPay
            </h1>
          </div>
        </div>

        {/* Status messages */}
        {state === "checking" && (
          <p className="text-sm text-white/40 animate-pulse">Connecting...</p>
        )}

        {state === "waking" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-white/50">
              Waking up the server
              <span className="inline-block ml-1 animate-pulse">.</span>
              <span className="inline-block animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
              <span className="inline-block animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
            </p>
            <p className="text-[11px] text-white/25 tabular-nums">
              {elapsed}s elapsed
            </p>
          </div>
        )}

        {state === "timeout" && (
          <div className="flex flex-col items-center gap-4 max-w-sm">
            <p className="text-[15px] text-amber-300/80 leading-relaxed text-center italic">
              &ldquo;{joke}&rdquo;
            </p>
            <p className="text-[11px] text-white/25">
              Backend is down for the moment. Try refreshing.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[#00d4aa]/10 border border-[#00d4aa]/30 px-5 py-2 text-[13px] font-medium text-[#00d4aa] hover:bg-[#00d4aa]/20 transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#00d4aa]/60 to-[#00d4aa] transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min((elapsed / 60) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <p className="fixed bottom-8 text-[11px] text-white/[0.12] tracking-wide">
        Powered by{" "}
        <a
          href="https://backendglitch.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white/25 transition-colors"
        >
          BackendGlitch
        </a>
      </p>

      {/* Glitch CSS */}
      <style jsx>{`
        .glitch-text {
          position: relative;
          animation: glitch-skew 4s infinite linear alternate-reverse;
        }
        .glitch-text::before,
        .glitch-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        .glitch-text::before {
          left: 2px;
          text-shadow: -2px 0 #ff00c1;
          clip: rect(44px, 450px, 56px, 0);
          animation: glitch-anim-1 5s infinite linear alternate-reverse;
        }
        .glitch-text::after {
          left: -2px;
          text-shadow: -2px 0 #00fff9, 2px 2px #ff00c1;
          clip: rect(24px, 450px, 36px, 0);
          animation: glitch-anim-2 4s infinite linear alternate-reverse;
        }

        @keyframes glitch-anim-1 {
          0% { clip: rect(10px, 9999px, 32px, 0); }
          5% { clip: rect(85px, 9999px, 98px, 0); }
          10% { clip: rect(42px, 9999px, 12px, 0); }
          15% { clip: rect(2px, 9999px, 56px, 0); }
          20% { clip: rect(23px, 9999px, 78px, 0); }
          25% { clip: rect(65px, 9999px, 44px, 0); }
          30% { clip: rect(5px, 9999px, 72px, 0); }
          35% { clip: rect(90px, 9999px, 18px, 0); }
          40% { clip: rect(15px, 9999px, 60px, 0); }
          45% { clip: rect(33px, 9999px, 88px, 0); }
          50% { clip: rect(70px, 9999px, 22px, 0); }
          55% { clip: rect(48px, 9999px, 40px, 0); }
          60% { clip: rect(12px, 9999px, 82px, 0); }
          65% { clip: rect(55px, 9999px, 28px, 0); }
          70% { clip: rect(38px, 9999px, 68px, 0); }
          75% { clip: rect(76px, 9999px, 14px, 0); }
          80% { clip: rect(20px, 9999px, 52px, 0); }
          85% { clip: rect(62px, 9999px, 34px, 0); }
          90% { clip: rect(8px, 9999px, 46px, 0); }
          95% { clip: rect(80px, 9999px, 26px, 0); }
          100% { clip: rect(0px, 9999px, 0px, 0); }
        }
        @keyframes glitch-anim-2 {
          0% { clip: rect(65px, 9999px, 78px, 0); }
          5% { clip: rect(12px, 9999px, 44px, 0); }
          10% { clip: rect(52px, 9999px, 18px, 0); }
          15% { clip: rect(28px, 9999px, 88px, 0); }
          20% { clip: rect(90px, 9999px, 38px, 0); }
          25% { clip: rect(8px, 9999px, 56px, 0); }
          30% { clip: rect(72px, 9999px, 24px, 0); }
          35% { clip: rect(34px, 9999px, 62px, 0); }
          40% { clip: rect(18px, 9999px, 82px, 0); }
          45% { clip: rect(46px, 9999px, 14px, 0); }
          50% { clip: rect(82px, 9999px, 48px, 0); }
          55% { clip: rect(25px, 9999px, 68px, 0); }
          60% { clip: rect(58px, 9999px, 32px, 0); }
          65% { clip: rect(40px, 9999px, 74px, 0); }
          70% { clip: rect(16px, 9999px, 52px, 0); }
          75% { clip: rect(88px, 9999px, 22px, 0); }
          80% { clip: rect(54px, 9999px, 42px, 0); }
          85% { clip: rect(30px, 9999px, 64px, 0); }
          90% { clip: rect(76px, 9999px, 10px, 0); }
          95% { clip: rect(6px, 9999px, 36px, 0); }
          100% { clip: rect(0px, 9999px, 0px, 0); }
        }
        @keyframes glitch-skew {
          0% { transform: skew(0deg); }
          10% { transform: skew(0deg); }
          11% { transform: skew(-1deg); }
          12% { transform: skew(1deg); }
          13% { transform: skew(0deg); }
          50% { transform: skew(0deg); }
          51% { transform: skew(0.5deg); }
          52% { transform: skew(0deg); }
          80% { transform: skew(0deg); }
          81% { transform: skew(-0.5deg); }
          82% { transform: skew(0.5deg); }
          83% { transform: skew(0deg); }
          100% { transform: skew(0deg); }
        }
      `}</style>
    </div>
  );
}
