"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#agents", label: "For Agents" },
];

export function LandingNav() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/75 backdrop-blur-xl">
      <nav className="mx-auto grid h-16 max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:h-[72px] lg:px-10">
        {/* Left */}
        <div className="flex min-w-0 items-center">
          <ul className="hidden items-center gap-8 text-[13px] font-medium tracking-wide text-white/80 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Center */}
        <Link
          href="/"
          className="font-display shrink-0 text-xl tracking-[0.08em] text-[#00ff88] sm:text-2xl"
        >
          NexaPay
        </Link>

        {/* Right */}
        <div className="flex min-w-0 justify-end gap-2 sm:gap-3 items-center">
          {!isLoading && isAuthenticated && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden md:inline text-[13px] text-white/70 font-medium truncate max-w-[140px]">
                <span className="text-white">{user.fullName}</span>
              </span>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/dashboard" />}
                className="h-8 sm:h-9 shrink-0 rounded-full px-3 sm:px-4 text-[12px] sm:text-[13px] font-bold text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/20 hover:bg-[#00ff88]/20 hover:text-[#00ff88]"
              >
                <span className="hidden sm:inline">Enter App</span>
                <span className="sm:hidden">App</span>
                <span className="ml-1">→</span>
              </Button>
              <button
                onClick={logout}
                className="hidden sm:block text-[11px] text-white/40 hover:text-white/70 transition-colors uppercase tracking-wider font-bold"
              >
                Log out
              </button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/login" />}
                className="h-8 sm:h-9 shrink-0 rounded-full px-3 text-[12px] sm:text-[13px] font-medium text-white/90 hover:bg-white/10 hover:text-white"
              >
                Login
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/register" />}
                className="h-8 sm:h-9 shrink-0 rounded-full border-white/80 bg-transparent px-3 text-[11px] sm:text-[13px] font-medium text-white shadow-none hover:bg-white/10"
              >
                <span className="hidden sm:inline">Register</span>
                <span className="sm:hidden">Join</span>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
