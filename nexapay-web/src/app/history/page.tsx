"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { fetchAccountTransactions, type TransactionView } from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { TransactionDetailModal } from "@/components/transaction-detail-modal";
import type { TransactionDetail } from "@/components/transaction-detail-modal";
import {
  ArrowLeft,
  Home,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Clock,
  User,
  Filter,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";

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
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type FilterType = "all" | "sent" | "received";

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

function HistoryInner() {
  const [loading, setLoading] = React.useState(true);
  const [transactions, setTransactions] = React.useState<TransactionView[]>([]);
  const [filter, setFilter] = React.useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [selectedTx, setSelectedTx] = React.useState<TransactionDetail | null>(null);

  React.useEffect(() => {
    document.title = "History — NexaPay";
    const load = async () => {
      const token = getSessionToken();
      const address = getSessionAddress();
      if (!token || !address) { setLoading(false); return; }
      try {
        const res = await fetchAccountTransactions(address, token);
        if (res.ok && "transactions" in res.data) {
          setTransactions((res.data as any).transactions ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    // Poll every 10s for real-time updates
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = React.useMemo(() => {
    let list = transactions;
    if (filter === "sent") list = list.filter((t) => t.direction === "debit");
    if (filter === "received") list = list.filter((t) => t.direction === "credit");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.to.toLowerCase().includes(q) ||
        t.from.toLowerCase().includes(q) ||
        t.memo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, filter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">History</h1>
            <p className="text-[13px] text-[#888]">{filtered.length} transactions</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mt-6">
          <div className="relative flex h-14 items-center rounded-full border border-white/10 bg-white/5 px-5 transition-all focus-within:border-[#00d4aa] focus-within:ring-[3px] focus-within:ring-[#00d4aa]/10">
            <Search className="h-[18px] w-[18px] shrink-0 text-[#888]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="ml-3 h-full w-full bg-transparent text-base text-white outline-none placeholder:text-white/20"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="ml-2 text-[#888] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-2">
          {(["all", "sent", "received"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
                filter === f
                  ? "border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]"
                  : "border-white/[0.06] bg-white/[0.02] text-[#888] hover:border-white/[0.10]"
              )}
            >
              {f === "all" ? "All" : f === "sent" ? "Sent" : "Received"}
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div className="mt-6 space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] p-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.06]" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-[#111] py-16">
              <Clock className="h-12 w-12 text-[#333]" />
              <p className="mt-3 text-sm text-[#888]">No transactions found</p>
            </div>
          ) : (
            filtered.map((tx) => {
              const isCredit = tx.direction === "credit";
              const counterpartyName = isCredit ? tx.from_name : tx.to_name;
              const name = isCredit && tx.from === "chain" ? "NexaPay" : counterpartyName;
              return (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTx(tx as unknown as TransactionDetail)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
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
            })
          )}
        </div>
      </main>
      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <div className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#00d4aa]" /><span className="text-[10px] text-[#00d4aa]">History</span></div>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <ProtectedRoute>
      <HistoryInner />
    </ProtectedRoute>
  );
}
