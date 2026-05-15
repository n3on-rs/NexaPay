"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { fetchBankTransfers } from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, Home, ArrowUpRight, Plus, Clock, User, Building2 } from "lucide-react";
import Link from "next/link";

interface BankTransfer {
  id: string;
  rib: string;
  beneficiary_name: string;
  amount_display: string;
  amount: number;
  memo?: string;
  status: string;
  failure_reason?: string;
  created_at: string;
  updated_at?: string;
}

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

function statusBadge(status: string) {
  if (status === "completed" || status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#00FF88]/10 px-2 py-0.5 text-[10px] font-bold text-[#00FF88]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#00FF88]" /> Completed
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Pending
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-[#888]">
      {status}
    </span>
  );
}

function BankTransferHistoryInner() {
  const [loading, setLoading] = React.useState(true);
  const [transfers, setTransfers] = React.useState<BankTransfer[]>([]);

  React.useEffect(() => {
    document.title = "Bank Transfer History — NexaPay";
    const load = async () => {
      const token = getSessionToken();
      const address = getSessionAddress();
      if (!token || !address) { setLoading(false); return; }
      try {
        const res = await fetchBankTransfers(address, token);
        if (res.ok && Array.isArray(res.data)) {
          setTransfers(res.data as BankTransfer[]);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter selection:bg-[#00FF88] selection:text-black">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/bank-transfer" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Bank Transfers</h1>
            <p className="text-[13px] text-[#888]">{transfers.length} transfers</p>
          </div>
        </div>

        {/* Transfers list */}
        <div className="mt-6 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] p-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.06]" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-[#111] py-16">
              <Building2 className="h-12 w-12 text-[#333]" />
              <p className="mt-3 text-sm text-[#888]">No bank transfers yet</p>
              <Link href="/bank-transfer" className="mt-4 rounded-full bg-[#00FF88] px-5 py-2 text-sm font-bold text-[#080808] transition-all hover:bg-[#00FF88]/90">
                Make a Transfer
              </Link>
            </div>
          ) : (
            transfers.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-[#888]">
                  {tx.beneficiary_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[14px] font-semibold text-white">{tx.beneficiary_name}</p>
                  <p className="text-[12px] text-[#888]">{relativeTime(tx.created_at)} · {tx.rib.slice(0, 8)}...</p>
                  {tx.failure_reason && (
                    <p className="mt-0.5 text-[11px] text-red-400">{tx.failure_reason}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[14px] font-semibold text-red-400">-{tx.amount_display}</p>
                  <div className="mt-0.5">{statusBadge(tx.status)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00FF88] text-[#080808] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>
    </div>
  );
}

export default function BankTransferHistoryPage() {
  return (
    <ProtectedRoute>
      <BankTransferHistoryInner />
    </ProtectedRoute>
  );
}
