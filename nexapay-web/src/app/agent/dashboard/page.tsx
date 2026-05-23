"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  BarChart2,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, formatMillimes, relativeTime } from "./layout";
import {
  getGatewayBalance,
  getGatewayTransactions,
} from "@/lib/api";

interface Transaction {
  intent_id: string;
  amount: number;
  status: string;
  description?: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
}

export default function AgentOverviewPage() {
  const { agent, apiKey } = useAgent();
  const [loading, setLoading] = React.useState(true);
  const [balance, setBalance] = React.useState(0);
  const [monthlyUsed, setMonthlyUsed] = React.useState(0);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);
  const prevSucceededRef = React.useRef<Set<string>>(new Set());

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async (silent = false) => {
    if (!apiKey) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        getGatewayBalance(apiKey),
        getGatewayTransactions(apiKey, 1, 5),
      ]);
      if (balRes.ok) {
        setBalance(Number(balRes.data.available) || 0);
      }
      if (txRes.ok && Array.isArray(txRes.data.intents)) {
        const mapped: Transaction[] = (txRes.data.intents as any[]).map((i) => ({
          intent_id: String(i.id || ""),
          amount: Number(i.amount) || 0,
          status: String(i.status || ""),
          description: i.description,
          created_at: String(i.created_at || ""),
          customer_name: i.customer_name,
          customer_phone: i.customer_phone,
        }));
        setTransactions(mapped);
        let used = 0;
        for (const t of mapped) {
          if (t.status === "confirmed" || t.status === "succeeded") {
            used += t.amount;
          }
        }
        setMonthlyUsed(used);

        // Detect new succeeded payments for toast
        const currentSucceeded = new Set(mapped.filter(t => t.status === "succeeded").map(t => t.intent_id));
        const prevSet = prevSucceededRef.current;
        if (prevSet.size > 0) {
          for (const id of currentSucceeded) {
            if (!prevSet.has(id)) {
              const tx = mapped.find(t => t.intent_id === id);
              if (tx) {
                showToast(`Payment received: +${formatMillimes(tx.amount)}`, "success");
              }
            }
          }
        }
        prevSucceededRef.current = currentSucceeded;
      }
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
  }, [apiKey]);

  React.useEffect(() => {
    document.title = "Agent Portal — NexaPay";
    load();
  }, [load]);

  // Poll every 5 seconds for real-time updates
  React.useEffect(() => {
    if (!apiKey) return;
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [load]);

  const limit = agent?.monthly_volume_limit || 0;
  const pct = limit > 0 ? Math.min((monthlyUsed / limit) * 100, 100) : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-[#00d4aa]";

  const StatCard = ({
    icon: Icon,
    label,
    value,
    trend,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    trend?: string;
  }) => (
    <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00d4aa]/10">
          <Icon className="h-4 w-4 text-[#00d4aa]" />
        </div>
        <span className="text-[12px] font-medium uppercase tracking-wider text-[#888]">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="font-space-grotesk text-[24px] font-bold text-white">{value}</p>
        {trend && (
          <span className="mb-1 inline-flex items-center rounded-full bg-[#00d4aa]/10 px-2 py-0.5 text-[11px] font-medium text-[#00d4aa]">
            {trend}
          </span>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-space-grotesk text-[24px] font-bold text-white">Overview</h1>
        <p className="mt-1 text-[13px] text-[#888]">Welcome back, {agent?.business_name || "Agent"}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Wallet} label="Gateway Balance" value={formatMillimes(balance)} />
        <StatCard icon={TrendingUp} label="Monthly Volume" value={formatMillimes(monthlyUsed)} trend="+12%" />
        <StatCard icon={BarChart2} label="Volume Limit" value={limit > 0 ? `${formatMillimes(monthlyUsed)} / ${formatMillimes(limit)}` : formatMillimes(monthlyUsed)} />
      </div>

      {/* Volume Limit Progress */}
      {limit > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white">Monthly Volume Usage</span>
            <span className="text-[12px] text-[#888]">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn("h-full rounded-full transition-all duration-500", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[12px] text-[#555]">
            <span>Used: {formatMillimes(monthlyUsed)}</span>
            <span>Limit: {formatMillimes(limit)}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#555]">Resets on the 1st of each month</p>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-space-grotesk text-[18px] font-bold text-white">Recent Transactions</h2>
          <Link
            href="/agent/dashboard/transactions"
            className="flex items-center gap-1 text-[13px] font-medium text-[#00d4aa] transition-colors hover:text-[#00e67a]"
          >
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-8 text-center">
            <p className="text-[14px] text-[#555]">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.intent_id}
                className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111] p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-white">
                    {tx.customer_name || tx.description || "Direct payment"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#888]">
                    {tx.intent_id.slice(0, 12)}... · {relativeTime(tx.created_at)}
                  </p>
                  {tx.customer_phone && (
                    <p className="mt-0.5 text-[11px] text-[#666]">{tx.customer_phone}</p>
                  )}
                </div>
                <div className="ml-4 flex flex-col items-end">
                  <span className="text-[14px] font-semibold text-[#00d4aa]">+{formatMillimes(tx.amount)}</span>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                      tx.status === "confirmed" || tx.status === "succeeded"
                        ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                        : tx.status === "pending"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                    )}
                  >
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl",
              toast.type === "success"
                ? "border-[#00d4aa]/20 bg-[#00d4aa]/10 text-[#00d4aa]"
                : "border-red-500/20 bg-red-500/10 text-red-400"
            )}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" />
            )}
            <span className="text-[13px] font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
