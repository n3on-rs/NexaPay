"use client";

import { useEffect, useState, useRef } from "react";

const HEALTH_URL = "/api/health";
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_WAIT = 120_000; // 2 minutes before giving up

type State = "checking" | "waking" | "ready" | "timeout";

export default function BackendGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [elapsed, setElapsed] = useState(0);
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
      } catch {
        // backend not reachable yet
      }

      if (!mountedRef.current) return;

      attempts++;
      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(secs);

      if (secs > 120) {
        setState("timeout");
        if (timer) clearInterval(timer);
        return;
      }

      // Show "waking" after first failure
      if (attempts === 1) {
        setState("waking");
      }
    };

    // First check immediately
    check();

    // Then poll
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
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        {/* Animated logo/dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 w-3 rounded-full bg-indigo-500 animate-bounce"
              style={{
                animationDelay: `${i * 0.16}s`,
                animationDuration: "0.8s",
              }}
            />
          ))}
        </div>

        {state === "checking" && (
          <p className="text-lg font-medium text-gray-300">Connecting to NexaPay...</p>
        )}

        {state === "waking" && (
          <div className="space-y-2">
            <p className="text-lg font-medium text-gray-200">Waking up the server</p>
            <p className="text-sm text-gray-500">
              Free hosting takes a moment to spin up. Thanks for your patience!
            </p>
            <p className="text-xs text-gray-600 tabular-nums">
              waiting {elapsed}s...
            </p>
          </div>
        )}

        {state === "timeout" && (
          <div className="space-y-3">
            <p className="text-lg font-medium text-amber-400">Taking longer than expected</p>
            <p className="text-sm text-gray-400 max-w-md">
              The server might be experiencing high demand. Please refresh the page
              to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Subtle progress bar */}
        <div className="mt-4 h-0.5 w-48 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min((elapsed / 60) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
