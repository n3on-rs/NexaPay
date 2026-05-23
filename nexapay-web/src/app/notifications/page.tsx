"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  fetchAccountNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AccountNotification,
} from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Home,
  ArrowUpRight,
  Plus,
  Clock,
  User,
  Bell,
  ArrowDownLeft,
  ArrowUpLeft,
  Trash2,
  CheckCheck,
} from "lucide-react";
import Link from "next/link";

// ─── Utilities ───
function relativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NotificationInner() {
  const [loading, setLoading] = React.useState(true);
  const [notifications, setNotifications] = React.useState<AccountNotification[]>([]);

  const load = React.useCallback(async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setLoading(false); return; }
    try {
      const res = await fetchAccountNotifications(address, token);
      if (res.ok && "notifications" in res.data) {
        const list = (res.data as any).notifications ?? [];
        setNotifications(list);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    document.title = "Notifications — NexaPay";
    load();
    // Poll every 10s for real-time updates
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleMarkRead = async (id: string) => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) return;
    // Optimistically update UI
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await markNotificationRead(address, token, id);
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead(address, token);
    } catch { /* ignore */ }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Notifications</h1>
              <p className="text-[13px] text-[#888]">{unreadCount} unread</p>
            </div>
          </div>
          {notifications.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-[#888] transition-all hover:border-[#00d4aa]/20 hover:text-white"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        {/* Notifications */}
        <div className="mt-6 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] p-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.06]" />
                </div>
              </div>
            ))
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-[#111] py-16">
              <Bell className="h-12 w-12 text-[#333]" />
              <p className="mt-3 text-sm text-[#888]">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => {
              const isCredit = n.type === "receive" || n.amount > 0;
              return (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all",
                    n.is_read
                      ? "border-white/[0.04] bg-[#111] opacity-60"
                      : "border-[#00d4aa]/10 bg-[#00d4aa]/[0.03] hover:bg-[#00d4aa]/[0.05]"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      isCredit ? "bg-[#00d4aa]/10 text-[#00d4aa]" : "bg-white/[0.05] text-[#888]"
                    )}
                  >
                    {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpLeft className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white">
                      {isCredit ? "Money received" : "Money sent"} — {n.amount_display}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#888]">
                      From {n.from_name || n.from_address.slice(0, 8) + "..."} · {relativeTime(n.created_at)}
                    </p>
                    {n.memo && <p className="mt-1 text-[12px] text-[#666]">{n.memo}</p>}
                  </div>
                  {!n.is_read && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#00d4aa]" />}
                </button>
              );
            })
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationInner />
    </ProtectedRoute>
  );
}
