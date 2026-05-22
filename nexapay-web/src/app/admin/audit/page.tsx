"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { Shield, LogOut, Users, LayoutDashboard, Receipt, ScrollText, Loader2 } from "lucide-react";

export default function AdminAuditPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [entries, setEntries] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const load = async (p: number) => {
    setLoading(true);
    const res = await getJson(`/admin/audit?page=${p}&limit=50`, { "X-Admin-Token": token });
    if (res.ok) { setEntries((res.data as any).entries || []); setTotal((res.data as any).total || 0); setPage(p); }
    setLoading(false);
  };

  React.useEffect(() => { if (!token) { router.push("/admin/login"); return; } load(1); }, [token]);
  const logout = () => { localStorage.removeItem("admin_token"); router.push("/admin/login"); };
  const nav = [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }, { label: "Users", href: "/admin/users", icon: Users }, { label: "Transactions", href: "/admin/transactions", icon: Receipt }, { label: "Audit Log", href: "/admin/audit", icon: ScrollText }];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="border-b border-white/[0.06] bg-[#0a0a0a]/80 px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-[#00FF88]" /><h1 className="text-lg font-bold">NexaPay Admin</h1></div><button onClick={logout} className="rounded-lg p-2 text-[#666] hover:bg-white/[0.04] hover:text-red-400"><LogOut className="h-4 w-4" /></button></div></div>
      <div className="border-b border-white/[0.04] bg-[#0a0a0a]/50 px-6"><div className="mx-auto flex max-w-6xl gap-1 py-2">{nav.map((n) => (<button key={n.href} onClick={() => router.push(n.href)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${n.label === "Audit Log" ? "bg-white/[0.06] text-white" : "text-[#666] hover:text-white"}`}><n.icon className="h-4 w-4" />{n.label}</button>))}</div></div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-6 text-lg font-bold">Admin Audit Trail</h2>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" /></div> : (
          <div className="space-y-2">
            {entries.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-[#111] px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold ${e.action === "login" ? "bg-blue-500/10 text-blue-400" : e.action.includes("freeze") ? "bg-red-500/10 text-red-400" : e.action.includes("view") ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.04] text-[#666]"}`}>{e.action.slice(0, 4).toUpperCase()}</div>
                  <div>
                    <div className="text-sm font-medium text-white">{e.admin_username || "System"}</div>
                    <div className="text-xs text-[#555]">{e.action} {e.resource_type && `→ ${e.resource_type}`} {e.resource_id && `#${e.resource_id.slice(0, 8)}`}</div>
                  </div>
                </div>
                <div className="text-xs text-[#555]">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-[#666]"><span>{total} entries</span><div className="flex gap-2"><button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Previous</button><button onClick={() => load(page + 1)} disabled={entries.length < 50} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Next</button></div></div>
      </div>
    </div>
  );
}
