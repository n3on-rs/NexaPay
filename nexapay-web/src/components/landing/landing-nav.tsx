"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

export function LandingNav() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/[0.06] bg-[#0b0b0b]/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight text-white">NexaPay</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link href="#features" className="text-[13px] font-medium text-white/60 transition-colors hover:text-white">Features</Link>
          <Link href="#how-it-works" className="text-[13px] font-medium text-white/60 transition-colors hover:text-white">How it works</Link>
          <Link href="#agents" className="text-[13px] font-medium text-white/60 transition-colors hover:text-white">For Business</Link>
        </div>

        <div className="flex items-center gap-3">
          {!isLoading && isAuthenticated && user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-full bg-[#00d4aa] px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90"
              >
                Dashboard
              </Link>
              <button onClick={logout} className="text-[13px] font-medium text-white/40 transition-colors hover:text-white/70">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[13px] font-medium text-white/70 transition-colors hover:text-white">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-white/90"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
