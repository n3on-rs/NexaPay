"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { Loader2, Pause, Play, Download } from "lucide-react";

export default function AdminLogsPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [entries, setEntries] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [paused, setPaused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await getJson("/admin/logs", { "X-Admin-Token": token });
    if (res.ok) {
      setEntries((res.data as any).entries || []);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    if (!token) { router.push("/admin/login"); return; }
    load();
    const interval = setInterval(() => { if (!paused) load(); }, 5000);
    return () => clearInterval(interval);
  }, [token, paused]);

  const exportLogs = () => {
    const text = entries.map((e) => `[${e.timestamp}] [${e.source}] ${e.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexapay-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell current="Logs">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold">System Logs</h2>
          <p className="text-xs text-[#555] mt-1">Live feed — updates every 5 seconds</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              paused ? "bg-[#00d4aa]/10 text-[#00d4aa]" : "bg-white/[0.04] text-[#888] hover:text-white"
            }`}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button onClick={load} className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-[#888] hover:text-white transition-colors">
            Refresh
          </button>
          <button onClick={exportLogs} className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-[#888] hover:text-white transition-colors">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-[#555]">No log entries yet</div>
      ) : (
        <div ref={containerRef} className="overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm font-mono">
              <thead className="bg-[#0b0b0b] sticky top-0">
                <tr className="border-b border-white/[0.04] text-left text-[10px] font-medium text-[#666] uppercase tracking-wider">
                  <th className="px-4 py-2.5 w-[180px]">Timestamp</th>
                  <th className="px-4 py-2.5 w-[80px]">Source</th>
                  <th className="px-4 py-2.5">Message</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any, i: number) => (
                  <tr
                    key={i}
                    className={`border-b border-white/[0.02] transition-colors hover:bg-white/[0.01] ${
                      e.source === "chain" ? "bg-[#00d4aa]/[0.01]" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-[10px] text-[#555] whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                          e.source === "chain"
                            ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                            : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {e.source}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-[#ccc]">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
