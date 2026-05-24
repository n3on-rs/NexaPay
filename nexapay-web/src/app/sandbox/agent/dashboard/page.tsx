"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet, TrendingUp, Users, ArrowLeftRight,
  ChevronRight, Loader2, Download, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, formatMillimes, relativeTime } from "./layout";
import { getGatewayBalance, getGatewayTransactions } from "@/lib/api";

interface Transaction {
  intent_id: string; amount: number; status: string; description?: string;
  created_at: string; customer_name?: string; customer_phone?: string; fee?: number;
}

export default function AgentOverviewPage() {
  const { agent, apiKey } = useAgent();
  const [loading, setLoading] = React.useState(true);
  const [balance, setBalance] = React.useState(0);
  const [totalVolume, setTotalVolume] = React.useState(0);
  const [payoutsTotal, setPayoutsTotal] = React.useState(0);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (m: string, t: "success"|"error"="success") => {
    setToast({ message: m, type: t });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async (silent = false) => {
    if (!apiKey) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        getGatewayBalance(apiKey),
        getGatewayTransactions(apiKey, 1, 50),
      ]);
      if (balRes.ok) {
        setBalance(Number(balRes.data.available) || 0);
        setTotalVolume(Number(balRes.data.gross) || 0);
        setPayoutsTotal(Number(balRes.data.payouts) || 0);
      }
      if (txRes.ok && Array.isArray(txRes.data.intents)) {
        const mapped: Transaction[] = (txRes.data.intents as any[]).map((i: any) => ({
          intent_id: String(i.id || ""), amount: Number(i.amount) || 0,
          status: String(i.status || ""), description: i.description,
          created_at: String(i.created_at || ""),
          customer_name: i.customer_name, customer_phone: i.customer_phone,
          fee: Number(i.fee) || 0,
        }));
        setTransactions(mapped);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { const id = setInterval(() => load(true), 10000); return () => clearInterval(id); }, [load]);

  const succeeded = transactions.filter(t => t.status === "succeeded" || t.status === "confirmed");
  const successRate = transactions.length > 0 ? Math.round((succeeded.length / transactions.length) * 100) : 0;
  const todayTotal = succeeded.filter(t => {
    const d = new Date(t.created_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).reduce((s, t) => s + t.amount, 0);

  const downloadTransactionsPDF = async () => {
    const rows = transactions.map(t => [
      t.intent_id.slice(0, 16),
      t.customer_name || "-",
      formatMillimes(t.amount),
      formatMillimes(t.fee || 0),
      t.status,
      new Date(t.created_at).toLocaleDateString(),
    ]);
    const csv = ["Intent ID,Customer,Amount,Fee,Status,Date"].concat(
      rows.map(r => r.join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nexapay-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="mt-1 text-sm text-[#888]">{agent?.business_name || "Your Business"}</p>
        </div>
        <button onClick={downloadTransactionsPDF} className="flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00d4aa]/10">
              <Wallet className="h-4 w-4 text-[#00d4aa]" />
            </div>
            <span className="text-xs text-[#888]">Available Balance</span>
          </div>
          <p className="text-xl font-bold text-white">{formatMillimes(balance)}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-xs text-[#888]">Total Volume</span>
          </div>
          <p className="text-xl font-bold text-white">{formatMillimes(totalVolume)}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10">
              <ArrowLeftRight className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-xs text-[#888]">Success Rate</span>
          </div>
          <p className="text-xl font-bold text-white">{successRate}%</p>
          <p className="text-xs text-[#888]">{succeeded.length}/{transactions.length} transactions</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <CreditCard className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-xs text-[#888]">Today</span>
          </div>
          <p className="text-xl font-bold text-white">{formatMillimes(todayTotal)}</p>
          <p className="text-xs text-[#888]">Withdrawn: {formatMillimes(payoutsTotal)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/agent/dashboard/payments" className="flex items-center gap-2 rounded-full bg-[#00d4aa] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#00d4aa]/90 transition-all">
          Create Payment Link
        </Link>
        <Link href="/agent/dashboard/transactions" className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-all">
          View Transactions <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Recent Transactions</h2>
          <Link href="/agent/dashboard/transactions" className="text-xs text-[#00d4aa] hover:underline">View all</Link>
        </div>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#555]">No transactions yet</p>
        ) : (
          <div className="space-y-1">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.intent_id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tx.status === "succeeded" || tx.status === "confirmed" ? "bg-[#00d4aa]/10" : "bg-red-500/10")}>
                    <TrendingUp className={cn("h-3.5 w-3.5", tx.status === "succeeded" || tx.status === "confirmed" ? "text-[#00d4aa]" : "text-red-400")} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tx.customer_name || tx.description || "Payment"}</p>
                    <p className="text-xs text-[#555]">{tx.intent_id.slice(0, 12)}... · {relativeTime(tx.created_at)}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#00d4aa] shrink-0 ml-3">{formatMillimes(tx.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 fade-in">
          <div className={cn("rounded-xl px-4 py-3 text-sm font-medium shadow-xl", toast.type === "success" ? "bg-[#00d4aa] text-black" : "bg-red-500 text-white")}>{toast.message}</div>
        </div>
      )}
    </div>
  );
}
