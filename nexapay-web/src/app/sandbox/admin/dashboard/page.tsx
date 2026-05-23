"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import {
  Users, ArrowUpRight, Shield, Activity, AlertTriangle,
  Wallet, Lock, FileText, Clock, Loader2, LogOut, LayoutDashboard,
  UserCheck, Receipt, ScrollText,
} from "lucide-react";

interface DashboardData {
  total_users: number;
  active_users_today: number;
  total_transactions: number;
  pending_withdrawals: number;
  frozen_accounts: number;
  chain_height: number;
  validator_count: number;
  today_transactions: number;
  today_volume_millimes: number;
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

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_username");
    router.push("/admin/login");
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]"><Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">Failed to load</div>;

  const stats = [
    { label: "Total Users", value: data.total_users, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Active Today", value: data.active_users_today, icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
{ label: "Frozen Accounts", value: data.frozen_accounts, icon: Lock, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Pending Withdrawals", value: data.pending_withdrawals, icon: Wallet, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Chain Height", value: data.chain_height, icon: Shield, color: "text-[#00d4aa]", bg: "bg-[#00d4aa]/10" },
    { label: "Total Transactions", value: data.total_transactions, icon: ArrowUpRight, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Today's Volume", value: formatTND(data.today_volume_millimes), icon: Receipt, color: "text-pink-400", bg: "bg-pink-500/10", isString: true },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0b0b0b]/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#00d4aa]" />
            <h1 className="text-lg font-bold">NexaPay Admin</h1>
            <span className="rounded-full bg-[#00d4aa]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#00d4aa]">
              {data.validator_count > 1 ? `${data.validator_count} validators` : 'Single Node'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#666]">
              {typeof window !== "undefined" ? localStorage.getItem("admin_username") : ""}
            </span>
            <button onClick={logout} className="rounded-lg p-2 text-[#666] transition-colors hover:bg-white/[0.04] hover:text-red-400">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="border-b border-white/[0.04] bg-[#0b0b0b]/50 px-6">
        <div className="mx-auto flex max-w-6xl gap-1 py-2">
          {[
            { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
            { label: "Users", href: "/admin/users", icon: Users },
            { label: "Transactions", href: "/admin/transactions", icon: Receipt },
            { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
          ].map((nav) => (
            <button
              key={nav.href}
              onClick={() => router.push(nav.href)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                window.location.pathname === nav.href
                  ? "bg-white/[0.06] text-white"
                  : "text-[#666] hover:text-white"
              }`}
            >
              <nav.icon className="h-4 w-4" />
              {nav.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#666]">{s.label}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </div>
              <div className={`mt-3 text-2xl font-bold ${s.color}`}>
                {(s as any).isString ? s.value : (s.value as number).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          {[
            { label: "View All Users", desc: "Manage accounts", href: "/admin/users", color: "border-blue-500/20 hover:border-blue-500/40" },
            { label: "Monitor Transactions", desc: "Real-time transaction feed", href: "/admin/transactions", color: "border-cyan-500/20 hover:border-cyan-500/40" },
            { label: "Audit Trail", desc: "All admin actions logged", href: "/admin/audit", color: "border-purple-500/20 hover:border-purple-500/40" },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => router.push(a.href)}
              className={`rounded-2xl border bg-[#111] p-5 text-left transition-all ${a.color}`}
            >
              <h3 className="text-sm font-semibold text-white">{a.label}</h3>
              <p className="mt-1 text-xs text-[#666]">{a.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
