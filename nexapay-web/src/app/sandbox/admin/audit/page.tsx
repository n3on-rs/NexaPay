"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { Loader2 } from "lucide-react";

export default function AdminAuditPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [entries, setEntries] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const load = async (p: number) => {
    setLoading(true);
    const res = await getJson(`/admin/audit?page=${p}&limit=30`, { "X-Admin-Token": token });
    if (res.ok) {
      setEntries((res.data as any).entries || []);
      setTotal((res.data as any).total || 0);
      setPage(p);
    }
    setLoading(false);
  };

  React.useEffect(() => { if (!token) { router.push("/admin/login"); return; } load(1); }, [token]);

  return (
    <AdminShell current="Audit Log">
      <h2 className="mb-6 text-lg font-bold">Audit Log</h2>
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" /></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0b0b]">
                <tr className="border-b border-white/[0.04] text-left text-xs font-medium text-[#666]">
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm text-white">{e.admin_username}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        e.action?.includes("freeze") ? "bg-red-500/10 text-red-400" :
                        e.action?.includes("approve") ? "bg-[#00d4aa]/10 text-[#00d4aa]" :
                        "bg-white/[0.04] text-[#888]"
                      }`}>{e.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#888]">{e.resource_type}{e.resource_id ? `: ${e.resource_id.slice(0, 8)}...` : ""}</td>
                    <td className="px-4 py-3 text-xs text-[#555] max-w-[200px] truncate">{e.details || "-"}</td>
                    <td className="px-4 py-3 text-xs text-[#555]">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[#555]">No audit entries</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-[#666]">
            <span>{total} entries</span>
            <div className="flex gap-2">
              <button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Previous</button>
              <button onClick={() => load(page + 1)} disabled={entries.length < 30} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Next</button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
