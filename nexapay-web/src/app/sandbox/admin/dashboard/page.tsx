"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import {
  Users, ArrowUpRight, Activity, Wallet, Lock, Shield,
  Receipt, Loader2, Coins,
} from "lucide-react";

interface DashboardData {
  total_users: number; active_users_today: number; total_transactions: number;
  pending_withdrawals: number; frozen_accounts: number; chain_height: number;
  validator_count: number; today_transactions: number; today_volume_millimes: number;
  revenue_balance_millimes: number; total_fees_collected: number; fee_brackets_count: number;
  revenue_address: string;
}

function formatTND(millimes: number) {
  return `${(millimes / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  React.useEffect(() => {
    if (!token) { router.push("/admin/login"); return; }
    const load = async () => {
      try {
        const res = await getJson("/admin/dashboard", { "X-Admin-Token": token });
        if (res.ok) setData(res.data as unknown as DashboardData);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [token, router]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]"><Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">Failed to load</div>;

  const stats = [
    { label: "Total Users", value: data.total_users.toLocaleString(), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Active Today", value: data.active_users_today.toLocaleString(), icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Frozen Accounts", value: data.frozen_accounts.toLocaleString(), icon: Lock, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Pending Withdrawals", value: data.pending_withdrawals.toLocaleString(), icon: Wallet, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Chain Height", value: data.chain_height.toLocaleString(), icon: Shield, color: "text-[#00d4aa]", bg: "bg-[#00d4aa]/10" },
    { label: "Total Transactions", value: data.total_transactions.toLocaleString(), icon: ArrowUpRight, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Today's Volume", value: formatTND(data.today_volume_millimes), icon: Receipt, color: "text-pink-400", bg: "bg-pink-500/10" },
    { label: "Revenue Balance", value: formatTND(data.revenue_balance_millimes), icon: Coins, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Total Fees", value: formatTND(data.total_fees_collected), icon: Coins, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Fee Brackets", value: data.fee_brackets_count.toLocaleString(), icon: Activity, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  return (
    <AdminShell current="Dashboard">
      {/* Validator badge */}
      <div className="mb-6 flex items-center gap-2">
        <span className="rounded-full bg-[#00d4aa]/10 px-3 py-1 text-xs font-medium text-[#00d4aa]">
          {data.validator_count > 1 ? `${data.validator_count} Validators — BFT Consensus` : 'Single Validator Mode'}
        </span>
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-[#666]">
          {data.fee_brackets_count} active fee brackets
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#111] p-4 lg:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] lg:text-xs font-medium text-[#666]">{s.label}</span>
              <div className={`flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-xl ${s.bg}`}>
                <s.icon className={`h-3.5 w-3.5 lg:h-4 lg:w-4 ${s.color}`} />
              </div>
            </div>
            <div className={`mt-2 lg:mt-3 text-lg lg:text-2xl font-bold font-mono ${s.color}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue address */}
      {data.revenue_address && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[#111] p-5">
          <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Revenue Wallet</p>
          <p className="font-mono text-sm text-[#00d4aa]">{data.revenue_address}</p>
          <p className="text-xs text-[#555] mt-1">All transaction fees are routed to this on-chain account. Fully auditable.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Users", href: "/admin/users", color: "border-blue-500/20 hover:border-blue-500/40" },
          { label: "Transactions", href: "/admin/transactions", color: "border-cyan-500/20 hover:border-cyan-500/40" },
          { label: "Validator Nodes", href: "/admin/nodes", color: "border-[#00d4aa]/20 hover:border-[#00d4aa]/40" },
          { label: "System Logs", href: "/admin/logs", color: "border-purple-500/20 hover:border-purple-500/40" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => router.push(a.href)}
            className={`rounded-2xl border bg-[#111] p-5 text-left transition-all ${a.color}`}
          >
            <h3 className="text-sm font-semibold text-white">{a.label}</h3>
            <p className="mt-1 text-xs text-[#666]">View details</p>
          </button>
        ))}
      </div>
    </AdminShell>
  );
}
