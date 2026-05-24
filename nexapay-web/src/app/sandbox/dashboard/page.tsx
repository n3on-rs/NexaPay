"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchAccountDetails,
  fetchAccountTransactions,
  fetchAccountNotifications,
  resolveSecurityAlert,
  type AccountDetails,
  type TransactionView,
  type AccountNotification,
  getAgentStatus,
} from "@/lib/api";
import { getSessionToken, getSessionAddress, getSessionFullName } from "@/lib/auth-utils";
import { connectSSE } from "@/lib/sse";
import { cn } from "@/lib/utils";
import { TransactionDetailModal } from "@/components/transaction-detail-modal";
import type { TransactionDetail } from "@/components/transaction-detail-modal";
import {
  ArrowUpRight,
  Plus,
  Clock,
  Bell,
  User,
  Home,
  LayoutDashboard,
  CreditCard,
  ChevronRight,
  Copy,
  Check,
  LogOut,
  Shield,
  Building2,
  Briefcase,
} from "lucide-react";

// ─── Utilities ───

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseTransactionMemo(memo: string): { label: string; isSystem: boolean } {
  if (!memo) return { label: "Transfer", isSystem: false };
  try {
    const parsed = JSON.parse(memo);
    const txType = parsed.type || parsed.payload?.type || "";
    switch (txType) {
      case "EsignAccount":
      case "esign_account":
        return { label: "Contract signed", isSystem: true };
      case "EsignTransfer":
      case "esign_transfer":
        return { label: "Transfer authorization", isSystem: true };
      case "InvoiceAnchor":
      case "invoice_anchor":
        return { label: "Invoice anchored", isSystem: true };
      default:
        return { label: memo, isSystem: false };
    }
  } catch {
    return { label: memo, isSystem: false };
  }
}

// ─── Skeleton Loader ───

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-white/[0.06]", className)} />
  );
}

// ─── Card Chip SVG ───

function CardChip() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x="0" y="0" width="36" height="28" rx="4" fill="url(#chipGrad)" />
      <rect x="2" y="6" width="14" height="16" rx="2" fill="url(#chipGrad2)" opacity="0.6" />
      <rect x="20" y="6" width="14" height="16" rx="2" fill="url(#chipGrad2)" opacity="0.4" />
      <defs>
        <linearGradient id="chipGrad" x1="0" y1="0" x2="36" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C8A84B" />
          <stop offset="1" stopColor="#E8D5A3" />
        </linearGradient>
        <linearGradient id="chipGrad2" x1="0" y1="0" x2="14" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4B76A" />
          <stop offset="1" stopColor="#A88B3D" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Balance Counter ───

function AnimatedBalance({ target, suffix }: { target: number; suffix: string }) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{formatMillimes(display)}</>;
}

// ─── Icons for contactless ───

function ContactlessIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6c1.5 2 1.5 6 0 8" />
      <path d="M7 4c2.5 3 2.5 9 0 12" />
      <path d="M11 2c3.5 4 3.5 12 0 16" />
      <path d="M15 5c2 2.5 2 7.5 0 10" />
    </svg>
  );
}

// ─── Main Dashboard ───

function DashboardInner() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [account, setAccount] = React.useState<AccountDetails | null>(null);
  const [transactions, setTransactions] = React.useState<TransactionView[]>([]);
  const [notifications, setNotifications] = React.useState<AccountNotification[]>([]);
  const [cardFlipped, setCardFlipped] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<"" | "rib" | "iban">("");
  const [selectedTx, setSelectedTx] = React.useState<TransactionDetail | null>(null);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "warning" | "error" } | null>(null);
  const prevNotifIdsRef = React.useRef<Set<string>>(new Set());
  const [securityAlert, setSecurityAlert] = React.useState<{ sessionId: string; message: string } | null>(null);
  const [agentApproved, setAgentApproved] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    const token = getSessionToken() || "";
    const address = getSessionAddress() || user?.address || "";
    if (!address) {
      if (!silent) { setError("Session expired. Please log in again."); setLoading(false); }
      return;
    }
    try {
      const [dRes, tRes, nRes] = await Promise.all([
        fetchAccountDetails(address, token),
        fetchAccountTransactions(address, token),
        fetchAccountNotifications(address, token),
      ]);
      if (dRes.ok && "full_name" in dRes.data) setAccount(dRes.data as AccountDetails);
      else if (!silent) setError("Failed to load account details");

      if (tRes.ok && "transactions" in tRes.data) setTransactions((tRes.data as any).transactions ?? []);

      // Check agent status
      try {
        const aRes = await getAgentStatus(address, token);
        if (aRes.ok && aRes.data.status === "APPROVED") {
          setAgentApproved(true);
        }
      } catch { /* ignore */ }

      if (nRes.ok && "notifications" in nRes.data) {
        const list = (nRes.data as any).notifications ?? [];
        // Show toast for any new unread notification
        const prevIds = prevNotifIdsRef.current;
        for (const n of list) {
          if (!prevIds.has(n.id) && !n.is_read) {
            const headline = n.type === "Transfer"
              ? `Received ${n.amount_display} from ${n.from_name || "someone"}`
              : n.memo || "New notification";
            setToast({ message: headline, type: "success" });
            setTimeout(() => setToast(null), 5000);
          }
        }
        prevNotifIdsRef.current = new Set(list.map((n: AccountNotification) => n.id));
        setNotifications(list);
      }
    } catch {
      if (!silent) setError("Failed to load account data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // SSE for real-time events (fetch-based for header auth)
  React.useEffect(() => {
    document.title = "Dashboard — NexaPay";
    load(false);
    const token = getSessionToken();
    const address = getSessionAddress();
    let closeSSE: (() => void) | null = null;
    if (token && address) {
      closeSSE = connectSSE(
        `/api/accounts/${address}/events`,
        token,
        (data) => {
          if (data.type === "transfer" && String(data.to) === address) {
            setToast({ message: `Received ${String(data.amount_display || "")} from ${String(data.from_name || String(data.from || "").slice(0, 8) + "...")}`, type: "success" });
            setTimeout(() => setToast(null), 5000);
            load(true);
          }
          if (data.type === "security_alert" && data.alert_type === "new_login") {
            setSecurityAlert({ sessionId: String(data.session_id || ""), message: String(data.message || "A new device just logged into your account. Is this you?") });
          }
        },
      );
    }
    // Fallback silent poll every 10s
    const interval = setInterval(() => load(true), 10_000);
    return () => {
      clearInterval(interval);
      if (closeSSE) closeSSE();
    };
  }, [load]);

  const handleCopy = async (text: string, key: "rib" | "iban") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayName = account?.full_name ?? user?.fullName ?? getSessionFullName() ?? "User";
  const initials = getInitials(displayName);
  const isEmpty = !loading && transactions.length === 0;

  // ─── Sidebar Nav Item ───
  const NavItem = ({
    icon: Icon,
    label,
    href,
    active,
    badge,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    active?: boolean;
    badge?: number;
  }) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-l-[10px] text-[13px] font-medium transition-colors",
        active
          ? "bg-[#00d4aa]/[0.08] text-[#00d4aa] border-r-2 border-r-[#00d4aa]"
          : "text-[#555555] hover:text-[#888] hover:bg-white/[0.03]"
      )}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );

  // ─── Mobile Bottom Tab ───
  const TabItem = ({
    icon: Icon,
    label,
    href,
    active,
    center,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    active?: boolean;
    center?: boolean;
  }) => (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1 transition-colors",
        center ? "relative -top-3" : ""
      )}
    >
      {center ? (
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]">
          <Icon className="w-5 h-5" />
        </div>
      ) : (
        <Icon className={cn("w-5 h-5", active ? "text-[#00d4aa]" : "text-[#555555]")} />
      )}
      {!center && <span className={cn("text-[10px]", active ? "text-[#00d4aa]" : "text-[#555555]")}>{label}</span>}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
      {/* ─── Mobile Top Bar ─── */}
      <div className="md:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0b0b0b]/90 px-4 backdrop-blur-xl">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00d4aa]">
          <span className="text-[10px] font-extrabold text-[#0b0b0b]">N</span>
        </div>
        <span className="font-display text-lg tracking-[0.08em] text-[#00d4aa]">NexaPay</span>
        <div className="flex items-center gap-3">
          <Link href="/notifications" className="relative">
            <Bell className="w-5 h-5 text-white/70" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </Link>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00d4aa] text-[10px] font-bold text-[#0b0b0b]">
            {initials}
          </div>
        </div>
      </div>

      <div className="flex">
        {/* ─── Desktop Sidebar ─── */}
        <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[240px] flex-col border-r border-white/[0.06] bg-[#0d0d0d] px-4 py-6 z-30">
          <div className="mb-10 flex items-center gap-3 px-2">
            <img src="/logo.png" alt="NexaPay" className="h-8 w-8 object-contain" />
            <span className="font-display text-lg tracking-[0.06em] text-[#00d4aa]">NexaPay</span>
          </div>

          <div className="flex flex-1 flex-col gap-1">
            <NavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" active />
            <NavItem icon={ArrowUpRight} label="Send Money" href="/send" />
            <NavItem icon={Plus} label="Fund Wallet" href="/fund" />
            <NavItem icon={Building2} label="Bank Transfer" href="/bank-transfer" />
            <NavItem icon={Clock} label="Transactions" href="/history" />
            <NavItem icon={Bell} label="Notifications" href="/notifications" badge={unreadCount || undefined} />
            <NavItem icon={CreditCard} label="Virtual Card" href="/card" />
            {agentApproved && (
              <NavItem icon={Briefcase} label="Agent Portal" href="/agent/dashboard" />
            )}
            <NavItem icon={User} label="Profile" href="/profile" />
          </div>

          <div className="mt-auto border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-3 px-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00d4aa] text-xs font-bold text-[#0b0b0b]">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-white">{displayName}</p>
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

        {/* ─── Main Content ─── */}
        <main className="flex-1 md:ml-[240px] px-4 pt-[72px] pb-24 md:pt-8 md:pb-8 md:px-8 lg:px-10 max-w-[900px] mx-auto">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={() => load(false)} className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/30">
                Retry
              </button>
            </div>
          )}

          {/* ─── Section 1: Balance Hero ─── */}
          <section className="relative mb-6 overflow-hidden rounded-[24px] border border-[#00d4aa]/15 bg-[#111111] p-7">
            <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#00d4aa]/10 blur-[60px]" />
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-6 w-32" />
              </div>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#888]">Total Balance</p>
                <div className="mt-2 font-space-grotesk text-[32px] font-extrabold text-white md:text-[42px]">
                  {account ? <AnimatedBalance target={account.balance} suffix="TND" /> : "0.000 TND"}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20">
                    Verified <Check className="h-3 w-3" />
                  </span>
                  <span className="text-sm text-[#888]">{displayName}</span>
                </div>
              </>
            )}
          </section>

          {/* Empty balance CTA */}
          {!loading && account && account.balance === 0 && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
              <p className="text-sm text-amber-400">Your wallet is empty. Add funds to get started.</p>
              <Link href="/fund" className="text-sm font-bold text-amber-400 hover:underline">→</Link>
            </div>
          )}

          {/* ─── Section 2: Quick Actions ─── */}
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: ArrowUpRight, label: "Send Money", href: "/send" },
              { icon: Plus, label: "Fund Wallet", href: "/fund" },
              { icon: Building2, label: "Bank Transfer", href: "/bank-transfer" },
              { icon: Clock, label: "History", href: "/history" },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#161616] p-5 transition-all hover:scale-[1.02] hover:border-[#00d4aa]/30"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00d4aa]/10">
                  <a.icon className="h-5 w-5 text-[#00d4aa]" />
                </div>
                <span className="text-[12px] font-medium text-white/80">{a.label}</span>
              </Link>
            ))}
          </section>

          {/* ─── Section 3: Virtual Card ─── */}
          <section className="mb-6 flex flex-col items-center">
            <div
              className="group relative w-full max-w-[380px] cursor-pointer"
              style={{ perspective: "1000px" }}
              onClick={() => setCardFlipped((f) => !f)}
            >
              <div
                className="relative aspect-[1.586] w-full transition-transform duration-700"
                style={{
                  transformStyle: "preserve-3d",
                  transform: cardFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 overflow-hidden rounded-2xl border border-white/[0.08] p-5 shadow-[0_20px_60px_rgba(0,255,136,0.1)]"
                  style={{
                    backfaceVisibility: "hidden",
                    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-60"
                    style={{
                      background: "radial-gradient(ellipse at 65% 35%, rgba(0,255,136,0.18) 0%, transparent 55%)",
                    }}
                  />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <img src="/logo.png" alt="NexaPay" className="h-7 object-contain" />
                      <ContactlessIcon />
                    </div>
                    <div className="flex items-center gap-3">
                      <CardChip />
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="font-mono text-[15px] tracking-[0.15em] text-white">
                          •••• •••• •••• {account?.card?.last4 ?? "----"}
                        </p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-[#888]">
                          {displayName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#888]">
                          VALID {account?.card?.expiry ?? "--/--"}
                        </p>
                        <p className="mt-1 font-serif text-lg font-bold italic text-white">
                          {account?.card?.type ?? "VISA"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] p-5 shadow-[0_20px_60px_rgba(0,255,136,0.1)]"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: "linear-gradient(135deg, #111 0%, #0b0b0b 100%)",
                  }}
                >
                  <div className="-mx-5 mt-2 h-10 bg-black" />
                  <div className="mt-6 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#888]">CVV</p>
                    <p className="mt-1 font-mono text-xl tracking-widest text-white">•••</p>
                  </div>
                  <p className="text-center text-[11px] text-[#555]">Tap front to flip back</p>
                </div>
              </div>
            </div>

            {/* Copy buttons */}
            {!loading && account && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(account.rib, "rib");
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-[#888] transition-colors hover:border-[#00d4aa]/30 hover:text-white"
                >
                  {copiedKey === "rib" ? <Check className="h-3.5 w-3.5 text-[#00d4aa]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === "rib" ? "Copied ✓" : "Copy RIB"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(account.iban, "iban");
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-[#888] transition-colors hover:border-[#00d4aa]/30 hover:text-white"
                >
                  {copiedKey === "iban" ? <Check className="h-3.5 w-3.5 text-[#00d4aa]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === "iban" ? "Copied ✓" : "Copy IBAN"}
                </button>
              </div>
            )}
          </section>

          {/* ─── Section 4: Recent Transactions ─── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Recent activity</h3>
              <Link href="/history" className="flex items-center gap-1 text-[13px] font-medium text-[#00d4aa] hover:underline">
                See all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111111] p-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-[#111111] py-12">
                <Clock className="h-12 w-12 text-[#333]" />
                <p className="mt-3 text-sm text-[#888]">No transactions yet</p>
                <Link href="/fund" className="mt-2 text-sm font-medium text-[#00d4aa] hover:underline">
                  Fund your wallet to get started →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.slice().reverse().slice(0, 5).map((tx) => {
                  const isCredit = tx.direction === "credit";
                  const counterpartyName = isCredit ? tx.from_name : tx.to_name;
                  const name = isCredit && tx.from === "chain" ? "NexaPay" : counterpartyName;
                  return (
                    <button
                      key={tx.id}
                      onClick={() => setSelectedTx(tx as unknown as TransactionDetail)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111111] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="relative">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold",
                            isCredit ? "bg-[#00d4aa]/15 text-[#00d4aa]" : "bg-white/[0.06] text-[#888]"
                          )}
                        >
                          {getInitials(name)}
                        </div>
                        <div
                          className={cn(
                            "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#111] text-[8px] font-bold",
                            isCredit ? "bg-[#00d4aa] text-[#0b0b0b]" : "bg-red-500 text-white"
                          )}
                        >
                          {isCredit ? "↓" : "↑"}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[14px] font-semibold text-white">{name}</p>
                        <p className="text-[12px] text-[#888]">{relativeTime(tx.timestamp)} · {parseTransactionMemo(tx.memo).label}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-[14px] font-semibold", isCredit ? "text-[#00d4aa]" : "text-red-400")}>
                          {isCredit ? "+" : "-"}{tx.amount_display}
                        </p>
                        <span className="mt-0.5 inline-block rounded-full bg-[#00d4aa]/10 px-2 py-0.5 text-[10px] font-bold text-[#00d4aa]">
                          Confirmed
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && transactions.length > 0 && (
              <div className="mt-4 text-center">
                <Link href="/history" className="text-[13px] font-medium text-[#00d4aa] hover:underline">
                  View all transactions →
                </Link>
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ─── Mobile Bottom Tab Nav ─── */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <TabItem icon={Home} label="Home" href="/dashboard" active />
        <TabItem icon={ArrowUpRight} label="Send" href="/send" />
        <TabItem icon={Plus} label="" href="/fund" center />
        <TabItem icon={Building2} label="Bank" href="/bank-transfer" />
        {agentApproved && (
          <TabItem icon={Briefcase} label="Agent" href="/agent/dashboard" />
        )}
        <TabItem icon={User} label="Profile" href="/profile" />
      </nav>
      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium shadow-lg transition-all",
          toast.type === "success" ? "border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]" :
          toast.type === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
          "border-red-500/30 bg-red-500/10 text-red-400"
        )}>
          {toast.message}
        </div>
      )}

      {/* Security Alert Modal */}
      {securityAlert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-[#FF4444]/20 bg-[#111] p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4444]/10">
              <Shield className="h-6 w-6 text-[#FF4444]" />
            </div>
            <h3 className="text-lg font-bold text-white">Security Alert</h3>
            <p className="mt-2 text-sm text-[#888]">{securityAlert.message}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  const token = getSessionToken();
                  if (token) {
                    await resolveSecurityAlert(token, securityAlert.sessionId, true);
                  }
                  setSecurityAlert(null);
                }}
                className="flex h-12 items-center justify-center rounded-full border border-white/[0.08] text-sm font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                Yes, it's me
              </button>
              <button
                onClick={async () => {
                  const token = getSessionToken();
                  if (token) {
                    await resolveSecurityAlert(token, securityAlert.sessionId, false);
                  }
                  setSecurityAlert(null);
                  router.push("/change-pin");
                }}
                className="flex h-12 items-center justify-center rounded-full bg-[#FF4444] text-sm font-bold text-white transition-colors hover:bg-[#FF4444]/90"
              >
                No, revoke access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardInner />
    </ProtectedRoute>
  );
}
