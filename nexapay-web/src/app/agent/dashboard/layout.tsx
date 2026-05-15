"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Zap,
  Key,
  ArrowLeftRight,
  BookOpen,
  ArrowLeft,
  LogOut,
  Menu,
  X,
  Loader2,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { getSessionToken, getSessionAddress, getSessionFullName } from "@/lib/auth-utils";
import { getAgentStatus, createApiKey, type AgentApplicationStatus } from "@/lib/api";

const AGENT_API_KEY_STORAGE = "nexapay_agent_api_key";

interface AgentContextValue {
  agent: AgentApplicationStatus | null;
  apiKey: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setApiKey: (key: string | null) => void;
}

const AgentContext = React.createContext<AgentContextValue>({
  agent: null,
  apiKey: null,
  loading: true,
  refresh: async () => {},
  setApiKey: () => {},
});

export function useAgent() {
  return React.useContext(AgentContext);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMillimes(value: number): string {
  const tnd = (value / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${tnd} TND`;
}

function relativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < 172800) return "Yesterday";
  return `${Math.floor(diffSec / 86400)} days ago`;
}

export { formatMillimes, relativeTime, getInitials };

export default function AgentDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [agent, setAgent] = React.useState<AgentApplicationStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [genKeyLoading, setGenKeyLoading] = React.useState(false);

  const loadAgent = React.useCallback(async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) {
      router.push("/login");
      return;
    }
    const res = await getAgentStatus(address, token);
    if (res.ok && res.data.status === "APPROVED") {
      setAgent(res.data);
    } else {
      router.push("/agent");
    }
    setLoading(false);
  }, [router]);

  const handleGenerateKey = React.useCallback(async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) return;
    setGenKeyLoading(true);
    try {
      const res = await createApiKey(address, token, {
        name: "Dashboard Key",
        permissions: {
          payment: true,
          refund: true,
          payout: true,
          webhook: true,
          balance: true,
          transaction: true,
        },
      });
      if (res.ok) {
        const key = String((res.data as any).api_key || "");
        if (key && typeof window !== "undefined") {
          localStorage.setItem(AGENT_API_KEY_STORAGE, key);
          setApiKey(key);
        }
      }
    } catch { /* ignore */ }
    setGenKeyLoading(false);
  }, []);

  React.useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  const [apiKey, setApiKey] = React.useState<string | null>(null);
  const [env, setEnv] = React.useState<string>("sandbox");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(AGENT_API_KEY_STORAGE);
    if (raw && raw.startsWith("REVEALED_ONCE_")) {
      localStorage.removeItem(AGENT_API_KEY_STORAGE);
      setApiKey(null);
    } else {
      setApiKey(raw);
    }
  }, []);

  const handleSetApiKey = React.useCallback((key: string | null) => {
    setApiKey(key);
    if (typeof window !== "undefined") {
      if (key) {
        localStorage.setItem(AGENT_API_KEY_STORAGE, key);
      } else {
        localStorage.removeItem(AGENT_API_KEY_STORAGE);
      }
    }
  }, []);

  React.useEffect(() => {
    fetch("/api/gateway/v1/environment")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setEnv(String(data.environment || "sandbox"));
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#080808]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
      </div>
    );
  }

  const fullName = user?.fullName || getSessionFullName() || "Agent";
  const initials = getInitials(fullName);

  const navItems = [
    { icon: LayoutDashboard, label: "Overview", href: "/agent/dashboard" },
    { icon: Zap, label: "Payments", href: "/agent/dashboard/payments" },
    { icon: Key, label: "API Keys", href: "/agent/dashboard/api-keys" },
    { icon: ArrowLeftRight, label: "Transactions", href: "/agent/dashboard/transactions" },
    { icon: Settings, label: "Settings", href: "/agent/dashboard/settings" },
    { icon: BookOpen, label: "Docs", href: "https://nexapay.space/docs", external: true },
    { icon: ArrowLeft, label: "Back to wallet", href: "/dashboard" },
  ];

  const isActive = (href: string) => {
    if (href === "/agent/dashboard") return pathname === "/agent/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <AgentContext.Provider value={{ agent, apiKey, loading, refresh: loadAgent, setApiKey: handleSetApiKey }}>
      <div className="min-h-screen bg-[#080808] text-white font-inter">
        {/* Mobile Top Bar */}
        <div className="md:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a]/90 px-4 backdrop-blur-xl">
          <button onClick={() => setDrawerOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/70">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="NexaPay" className="h-6 w-6 object-contain" />
            <span className="font-display text-base tracking-[0.06em] text-[#00FF88]">NexaPay</span>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00FF88] text-[10px] font-bold text-[#080808]">
            {initials}
          </div>
        </div>

        <div className="flex">
          {/* Desktop Sidebar */}
          <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[240px] flex-col border-r border-white/[0.06] bg-[#0d0d0d] px-4 py-6 z-30">
            <div className="mb-2 flex items-center gap-3 px-2">
              <img src="/logo.png" alt="NexaPay" className="h-7 w-7 object-contain" />
              <span className="font-display text-lg tracking-[0.06em] text-[#00FF88]">NexaPay</span>
            </div>
            <div className="mb-6 px-2">
              <p className="text-[14px] font-semibold text-[#00FF88]">{agent?.business_name || "Agent"}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-[rgba(0,255,136,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#00FF88]">
                  Agent Portal
                </span>
                {env === "sandbox" ? (
                  <span className="inline-flex items-center rounded-full border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.15)] px-2 py-0.5 text-[10px] font-medium text-[#FFB800]">
                    SANDBOX
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#00FF88]">
                    LIVE
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              {navItems.map((item) =>
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-l-[10px] text-[13px] font-medium text-[#555555] transition-colors hover:text-[#888] hover:bg-white/[0.03]"
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-l-[10px] text-[13px] font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-[#00FF88]/[0.08] text-[#00FF88] border-r-2 border-r-[#00FF88]"
                        : "text-[#555555] hover:text-[#888] hover:bg-white/[0.03]"
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              )}
            </div>

            <div className="mt-auto border-t border-white/[0.06] pt-4">
              <div className="mb-3 flex items-center gap-3 px-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00FF88] text-xs font-bold text-[#080808]">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-white">{fullName}</p>
                  <span className="inline-flex items-center rounded-full bg-[rgba(0,255,136,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#00FF88]">
                    Agent
                  </span>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 md:ml-[240px] px-4 pt-[72px] pb-8 md:pt-8 md:px-8 lg:px-10 max-w-[1100px] mx-auto">
            {!apiKey && (
              <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 flex items-center justify-between gap-4">
                <p className="text-sm text-amber-400">API key not found. Generate a new key to enable dashboard features.</p>
                <button
                  onClick={handleGenerateKey}
                  disabled={genKeyLoading}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#00FF88] px-4 py-2 text-[13px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a] disabled:opacity-50"
                >
                  {genKeyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Generate Key
                </button>
              </div>
            )}
            {children}
          </main>
        </div>

        {/* Mobile Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[260px] bg-[#0d0d0d] border-r border-white/[0.06] px-4 py-6">
              <div className="mb-4 flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="NexaPay" className="h-6 w-6 object-contain" />
                  <span className="font-display text-base tracking-[0.06em] text-[#00FF88]">NexaPay</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="rounded-full p-2 text-white/50 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mb-4 px-2">
                <p className="text-[14px] font-semibold text-[#00FF88]">{agent?.business_name || "Agent"}</p>
                <span className="mt-1 inline-flex items-center rounded-full bg-[rgba(0,255,136,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#00FF88]">
                  Agent Portal
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {navItems.map((item) =>
                  item.external ? (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-[#555555] transition-colors hover:text-[#888] hover:bg-white/[0.03]"
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-[#00FF88]/[0.08] text-[#00FF88]"
                          : "text-[#555555] hover:text-[#888] hover:bg-white/[0.03]"
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] p-4">
                <div className="mb-3 flex items-center gap-3 px-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00FF88] text-xs font-bold text-[#080808]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-white">{fullName}</p>
                    <span className="inline-flex items-center rounded-full bg-[rgba(0,255,136,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#00FF88]">
                      Agent
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => { setDrawerOpen(false); logout(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentContext.Provider>
  );
}
