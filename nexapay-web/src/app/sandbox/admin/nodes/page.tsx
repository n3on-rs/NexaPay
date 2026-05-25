"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { Loader2, Circle, CheckCircle2, XCircle, Server } from "lucide-react";

export default function AdminNodesPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getJson("/admin/nodes", { "X-Admin-Token": token });
    if (res.ok) setData(res.data as any);
    setLoading(false);
  };

  React.useEffect(() => {
    if (!token) { router.push("/admin/login"); return; }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const formatBalance = (m: number) =>
    (m / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " TND";

  return (
    <AdminShell current="Nodes">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Validator Nodes</h2>
        <button onClick={load} className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-[#888] hover:text-white transition-colors">
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" /></div>
      ) : data ? (
        <>
          {/* Status cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <p className="text-xs text-[#666] uppercase tracking-wider">Mode</p>
              <p className="mt-1 text-lg font-bold text-white">{data.is_multi_validator ? "Multi-Validator" : "Single-Validator"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <p className="text-xs text-[#666] uppercase tracking-wider">Chain Height</p>
              <p className="mt-1 text-lg font-bold text-white font-mono">#{data.chain_height?.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <p className="text-xs text-[#666] uppercase tracking-wider">Mempool</p>
              <p className="mt-1 text-lg font-bold text-white">{data.mempool_size} tx</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-5">
              <p className="text-xs text-[#666] uppercase tracking-wider">Revenue</p>
              <p className="mt-1 text-lg font-bold text-[#00d4aa] font-mono">{formatBalance(data.revenue_balance_millimes || 0)}</p>
            </div>
          </div>

          {/* Validator list */}
          <h3 className="mb-4 text-sm font-semibold text-[#888] uppercase tracking-wider">
            Validators ({data.validators?.length || 0})
          </h3>
          <div className="space-y-3">
            {(data.validators || []).map((v: any, i: number) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-[#111] p-4 flex items-center gap-4">
                <div className={`h-3 w-3 rounded-full ${v.is_active ? "bg-[#00d4aa]" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    Validator #{i}
                    {v.is_active ? (
                      <span className="rounded-full bg-[#00d4aa]/10 px-2 py-0.5 text-[10px] text-[#00d4aa]">Active</span>
                    ) : (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">Inactive</span>
                    )}
                  </p>
                  <p className="text-xs text-[#555] font-mono mt-0.5">{v.address}</p>
                  {v.url && <p className="text-xs text-[#555] mt-0.5">{v.url}</p>}
                </div>
                <div className="text-right text-xs text-[#555]">
                  <p>Joined</p>
                  <p className="text-[#888]">{v.joined_at ? new Date(v.joined_at * 1000).toLocaleDateString() : "N/A"}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chain overview */}
          <h3 className="mb-4 mt-8 text-sm font-semibold text-[#888] uppercase tracking-wider">Chain Overview</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-[#111] p-4">
              <p className="text-xs text-[#666]">Total Accounts</p>
              <p className="mt-1 text-xl font-bold text-white">{data.total_accounts?.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#111] p-4">
              <p className="text-xs text-[#666]">Peers Configured</p>
              <p className="mt-1 text-xl font-bold text-white">{data.peers_configured}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#111] p-4">
              <p className="text-xs text-[#666]">Consensus</p>
              <p className="mt-1 text-xl font-bold text-[#00d4aa]">BFT</p>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-[#555]">Failed to load node data</div>
      )}
    </AdminShell>
  );
}
