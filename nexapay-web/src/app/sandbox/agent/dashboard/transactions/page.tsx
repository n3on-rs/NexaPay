"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Loader2,
  Copy,
  ChevronRight,
  X,
  Wallet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, formatMillimes, relativeTime } from "../layout";
import {
  getGatewayTransactions,
  getGatewayBalance,
  createRefund,
} from "@/lib/api";
import { postJson } from "@/lib/api";
import { getSessionAddress, getSessionToken } from "@/lib/auth-utils";

interface GatewayTransaction {
  intent_id: string;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  amount: number;
  fee: number;
  status: string;
  created_at: string;
}

const FILTERS = ["All", "Confirmed", "Pending", "Refunded", "Failed"];

export default function TransactionsPage() {
  const { apiKey } = useAgent();
  const [txs, setTxs] = React.useState<GatewayTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("All");
  const [balance, setBalance] = React.useState(0);
  const [showRefund, setShowRefund] = React.useState<GatewayTransaction | null>(null);
  const [showPayout, setShowPayout] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState("");
  const [refundReason, setRefundReason] = React.useState("");
  const [payoutAmount, setPayoutAmount] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);
  const prevSucceededRef = React.useRef<Set<string>>(new Set());

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = React.useCallback(async (silent = false) => {
    if (!apiKey) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const status = filter === "All" ? undefined : filter.toLowerCase();
      const [txRes, balRes] = await Promise.all([
        getGatewayTransactions(apiKey, 1, 20, status),
        getGatewayBalance(apiKey),
      ]);
      if (txRes.ok && Array.isArray(txRes.data.intents)) {
        const mapped: GatewayTransaction[] = (txRes.data.intents as any[]).map((i) => ({
          intent_id: String(i.id || ""),
          customer_name: i.customer_name,
          customer_phone: i.customer_phone,
          amount: Number(i.amount) || 0,
          fee: Number(i.fee) || 0,
          status: String(i.status || ""),
          created_at: String(i.created_at || ""),
        }));
        setTxs(mapped);

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
      if (balRes.ok) {
        setBalance(Number(balRes.data.available) || 0);
      }
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
  }, [apiKey, filter]);

  React.useEffect(() => {
    document.title = "Transactions — NexaPay Agent";
    loadData();
  }, [loadData]);

  // Poll every 5 seconds for real-time updates
  React.useEffect(() => {
    if (!apiKey) return;
    const id = setInterval(() => loadData(true), 5000);
    return () => clearInterval(id);
  }, [loadData]);

  const handleRefund = async () => {
    if (!showRefund || !apiKey) return;
    const amount = Math.round(parseFloat(refundAmount) * 1000);
    if (!amount || amount > showRefund.amount || !refundReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await createRefund(apiKey, {
        intent_id: showRefund.intent_id,
        amount,
        reason: refundReason.trim(),
      });
      if (res.ok) {
        setShowRefund(null);
        setRefundAmount(""); setRefundReason("");
        loadData();
      }
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handlePayout = async () => {
    const address = getSessionAddress();
    const token = getSessionToken();
    if (!address || !token) return;
    const amount = Math.round(parseFloat(payoutAmount) * 1000);
    if (!amount || amount <= 0) return;
    setActionLoading(true);
    try {
      const { ok, data } = await postJson(
        `/accounts/${address}/company/withdraw`,
        { amount },
        { "X-Account-Token": token }
      );
      if (ok) {
        setShowPayout(false);
        setPayoutAmount("");
        loadData();
      } else {
        const err = String((data as any)?.error || "Withdraw failed");
        console.error("Withdraw failed:", err);
      }
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-space-grotesk text-[24px] font-bold text-white">Transactions</h1>
          <p className="mt-1 text-[13px] text-[#888]">Gateway payment intents and refunds</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#111] px-4 py-3">
          <Wallet className="h-4 w-4 text-[#00d4aa]" />
          <span className="text-[13px] text-[#888]">Balance:</span>
          <span className="text-[14px] font-semibold text-white">{formatMillimes(balance)}</span>
          <button
            onClick={() => setShowPayout(true)}
            className="ml-2 rounded-full bg-[#00d4aa] px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition-all hover:bg-[#00e67a]"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors",
              filter === f
                ? "bg-[#00d4aa] text-[#0b0b0b]"
                : "bg-white/[0.04] text-[#555] hover:bg-white/[0.08] hover:text-[#aaa]"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" />
        </div>
      ) : txs.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-10 text-center">
          <ArrowLeftRight className="mx-auto h-12 w-12 text-[#333]" />
          <p className="mt-4 text-[16px] font-medium text-white">No transactions</p>
          <p className="mt-1 text-[13px] text-[#555]">Transactions will appear here once payments start flowing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111] md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#555]">
                  <th className="px-5 py-3 font-medium">Intent ID</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Fee</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={tx.intent_id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[12px] text-[#aaa]">{tx.intent_id.slice(0, 12)}...</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(tx.intent_id)}
                          className="rounded p-1 text-[#555] hover:text-white"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#aaa]">
                      {tx.customer_name || tx.customer_email || "—"}
                      {tx.customer_phone && <span className="block text-[11px] text-[#666]">{tx.customer_phone}</span>}
                    </td>
                    <td className="px-5 py-3 font-medium text-[#00d4aa]">+{formatMillimes(tx.amount)}</td>
                    <td className="px-5 py-3 text-[#888]">{formatMillimes(tx.fee)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-5 py-3 text-[#555]">{relativeTime(tx.created_at)}</td>
                    <td className="px-5 py-3">
                      {tx.status === "confirmed" || tx.status === "succeeded" ? (
                        <button
                          onClick={() => {
                            setShowRefund(tx);
                            setRefundAmount((tx.amount / 1000).toFixed(3));
                          }}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
                        >
                          Refund
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#333]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {txs.map((tx) => (
              <div key={tx.intent_id} className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[12px] text-[#aaa]">{tx.intent_id.slice(0, 10)}...</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(tx.intent_id)}
                      className="rounded p-1 text-[#555] hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
                <p className="mt-2 text-[13px] text-[#aaa]">
                  {tx.customer_name || tx.customer_email || "—"}
                  {tx.customer_phone && <span className="block text-[11px] text-[#666]">{tx.customer_phone}</span>}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-[#00d4aa]">+{formatMillimes(tx.amount)}</span>
                  <span className="text-[12px] text-[#555]">{relativeTime(tx.created_at)}</span>
                </div>
                {tx.status === "confirmed" || tx.status === "succeeded" ? (
                  <button
                    onClick={() => {
                      setShowRefund(tx);
                      setRefundAmount((tx.amount / 1000).toFixed(3));
                    }}
                    className="mt-3 w-full rounded-lg bg-red-500/10 py-2 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  >
                    Refund
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-[#111] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-white">Create Refund</h3>
              <button onClick={() => setShowRefund(null)} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-[#888]">Amount (TND)</label>
                <input
                  type="number"
                  step="0.001"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white outline-none focus:border-[#00d4aa]/40"
                />
                <p className="mt-1 text-[11px] text-[#555]">
                  Max: {formatMillimes(showRefund.amount)}
                </p>
              </div>
              <div>
                <label className="text-[12px] text-[#888]">Reason <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Customer request"
                  className="mt-1 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00d4aa]/40"
                />
              </div>
              <button
                onClick={handleRefund}
                disabled={!refundAmount || !refundReason.trim() || actionLoading}
                className="flex h-14 w-full items-center justify-center rounded-full bg-red-500 text-[14px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Issue Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Payout Modal */}
      {showPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-[#111] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-white">Withdraw to Wallet</h3>
              <button onClick={() => setShowPayout(false)} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-4 rounded-xl bg-white/[0.03] p-4">
              <p className="text-[12px] text-[#555]">Available</p>
              <p className="mt-1 text-[18px] font-bold text-white">{formatMillimes(balance)}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-[#888]">Amount (TND)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="0.000"
                  className="mt-1 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00d4aa]/40"
                />
              </div>
              <button
                onClick={handlePayout}
                disabled={!payoutAmount || actionLoading}
                className="flex h-14 w-full items-center justify-center rounded-full bg-[#00d4aa] text-[14px] font-semibold text-[#0b0b0b] transition-all hover:bg-[#00e67a] disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "confirmed" || status === "succeeded"
      ? "bg-[#00d4aa]/10 text-[#00d4aa]"
      : status === "pending"
      ? "bg-amber-500/10 text-amber-400"
      : status === "refunded"
      ? "bg-blue-500/10 text-blue-400"
      : "bg-red-500/10 text-red-400";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", color)}>
      {status}
    </span>
  );
}
