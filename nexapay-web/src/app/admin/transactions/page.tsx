"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { Shield, LogOut, Users, LayoutDashboard, Receipt, ScrollText, Loader2 } from "lucide-react";

export default function AdminTxPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [txs, setTxs] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const load = async (p: number) => {
    setLoading(true);
    const res = await getJson(`/admin/transactions?page=${p}&limit=30`, { "X-Admin-Token": token });
    if (res.ok) { setTxs((res.data as any).transactions || []); setTotal((res.data as any).total || 0); setPage(p); }
    setLoading(false);
  };

  React.useEffect(() => { if (!token) { router.push("/admin/login"); return; } load(1); }, [token]);

  const logout = () => { localStorage.removeItem("admin_token"); router.push("/admin/login"); };
  const nav = [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }, { label: "Users", href: "/admin/users", icon: Users }, { label: "Transactions", href: "/admin/transactions", icon: Receipt }, { label: "Audit Log", href: "/admin/audit", icon: ScrollText }];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="border-b border-white/[0.06] bg-[#0a0a0a]/80 px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-[#00FF88]" /><h1 className="text-lg font-bold">NexaPay Admin</h1></div><button onClick={logout} className="rounded-lg p-2 text-[#666] hover:bg-white/[0.04] hover:text-red-400"><LogOut className="h-4 w-4" /></button></div></div>
      <div className="border-b border-white/[0.04] bg-[#0a0a0a]/50 px-6"><div className="mx-auto flex max-w-6xl gap-1 py-2">{nav.map((n) => (<button key={n.href} onClick={() => router.push(n.href)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${n.label === "Transactions" ? "bg-white/[0.06] text-white" : "text-[#666] hover:text-white"}`}><n.icon className="h-4 w-4" />{n.label}</button>))}</div></div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-6 text-lg font-bold">Transaction Monitor</h2>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" /></div> : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm"><thead className="bg-[#0a0a0a]"><tr className="border-b border-white/[0.04] text-left text-xs font-medium text-[#666]"><th className="px-4 py-3">Hash</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Block</th></tr></thead>
            <tbody>{txs.map((tx: any, i: number) => (
              <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-xs text-[#00FF88]">{tx.hash?.slice(0, 12)}...</td>
                <td className="px-4 py-3"><span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#888]">{tx.type}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-[#888]">{tx.from === "SYSTEM" ? "SYSTEM" : tx.from?.slice(0, 10) + "..."}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#888]">{tx.to?.slice(0, 10)}...</td>
                <td className="px-4 py-3 font-mono text-xs text-white">{tx.amount_display}</td>
                <td className="px-4 py-3 text-xs text-[#555]">#{tx.block}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-[#666]"><span>{total} transactions</span><div className="flex gap-2"><button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Previous</button><button onClick={() => load(page + 1)} disabled={txs.length < 30} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Next</button></div></div>
      </div>
    </div>
  );
}
