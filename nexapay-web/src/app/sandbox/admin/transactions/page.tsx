"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { Loader2, Search } from "lucide-react";

export default function AdminTxPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [txs, setTxs] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("");

  const load = async (p: number) => {
    setLoading(true);
    const q = filter ? `&search=${encodeURIComponent(filter)}` : "";
    const res = await getJson(`/admin/transactions?page=${p}&limit=30${q}`, { "X-Admin-Token": token });
    if (res.ok) {
      setTxs((res.data as any).transactions || []);
      setTotal((res.data as any).total || 0);
      setPage(p);
    }
    setLoading(false);
  };

  React.useEffect(() => { if (!token) { router.push("/admin/login"); return; } load(1); }, [token]);

  const formatAmount = (tx: any) => {
    const amt = tx.amount ?? 0;
    const fee = tx.fee ?? 0;
    const tnd = (amt / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    if (fee > 0) {
      const feeTnd = (fee / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      return <span>{tnd} TND <span className="text-[#00d4aa]">(+{feeTnd} fee)</span></span>;
    }
    return <span>{tnd} TND</span>;
  };

  return (
    <AdminShell current="Transactions">
      <h2 className="mb-6 text-lg font-bold">Transaction Monitor</h2>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(1)}
            className="w-full rounded-xl border border-white/[0.06] bg-[#111] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder-[#444] focus:border-[#00d4aa]/50"
            placeholder="Search by hash, address, or memo..."
          />
        </div>
        <button onClick={() => load(1)} className="rounded-xl bg-[#00d4aa] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#00d4aa]/90">Search</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" /></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0b0b]">
                <tr className="border-b border-white/[0.04] text-left text-xs font-medium text-[#666]">
                  <th className="px-4 py-3">Hash</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Memo</th>
                  <th className="px-4 py-3">Block</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-[#00d4aa]">{tx.hash?.slice(0, 14)}...</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        tx.type === "Transfer" ? "bg-[#00d4aa]/10 text-[#00d4aa]" :
                        tx.type === "AccountCreate" ? "bg-blue-500/10 text-blue-400" :
                        "bg-white/[0.04] text-[#888]"
                      }`}>{tx.type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#888]">
                      {tx.from === "SYSTEM" ? <span className="text-[#555]">SYSTEM</span> : tx.from?.slice(0, 10) + "..."}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#888]">{tx.to?.slice(0, 10)}...</td>
                    <td className="px-4 py-3 font-mono text-xs text-white">{formatAmount(tx)}</td>
                    <td className="px-4 py-3 text-xs text-[#555] hidden lg:table-cell max-w-[120px] truncate">{tx.memo || "-"}</td>
                    <td className="px-4 py-3 text-xs text-[#555]">#{tx.block}</td>
                  </tr>
                ))}
                {txs.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[#555]">No transactions found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-[#666]">
            <span>{total} transactions</span>
            <div className="flex gap-2">
              <button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Previous</button>
              <button onClick={() => load(page + 1)} disabled={txs.length < 30} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Next</button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
