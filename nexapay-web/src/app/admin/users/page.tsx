"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getJson, postJson } from "@/lib/api";
import { Search, Shield, LogOut, Users, LayoutDashboard, Receipt, ScrollText, Loader2, ChevronRight, Lock, Unlock } from "lucide-react";

interface UserItem {
  address: string; full_name: string; phone: string; email: string;
  balance: number; balance_display: string;
  is_frozen: boolean; created_at: string;
}

function AdminShell({ children, current }: { children: React.ReactNode; current: string }) {
  const router = useRouter();
  const logout = () => { localStorage.removeItem("admin_token"); router.push("/admin/login"); };
  const nav = [
    { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Transactions", href: "/admin/transactions", icon: Receipt },
    { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
  ];
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="border-b border-white/[0.06] bg-[#0b0b0b]/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#00d4aa]" />
            <h1 className="text-lg font-bold">NexaPay Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={logout} className="rounded-lg p-2 text-[#666] transition-colors hover:bg-white/[0.04] hover:text-red-400">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="border-b border-white/[0.04] bg-[#0b0b0b]/50 px-6">
        <div className="mx-auto flex max-w-6xl gap-1 py-2">
          {nav.map((n) => (
            <button key={n.href} onClick={() => router.push(n.href)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${current === n.label ? "bg-white/[0.06] text-white" : "text-[#666] hover:text-white"}`}>
              <n.icon className="h-4 w-4" />{n.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [users, setUsers] = React.useState<UserItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [actionMsg, setActionMsg] = React.useState("");

  const loadUsers = async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await getJson(`/admin/users?page=${p}&limit=20&search=${encodeURIComponent(q)}`, { "X-Admin-Token": token });
      if (res.ok) {
        setUsers((res.data as any).users || []);
        setTotal((res.data as any).total || 0);
        setPage((res.data as any).page || 1);
      }
    } catch {}
    setLoading(false);
  };

  React.useEffect(() => { if (!token) { router.push("/admin/login"); return; } loadUsers(1, ""); }, [token]);

  const toggleFreeze = async (addr: string, frozen: boolean) => {
    const endpoint = frozen ? "unfreeze" : "freeze";
    const body = frozen ? { reason: "Admin override" } : { reason: "Suspicious activity", legal_basis: "suspicious_activity" };
    try {
      const res = await postJson(`/admin/users/${addr}/${endpoint}`, body, { "X-Admin-Token": token });
      setActionMsg(res.ok ? `User ${frozen ? "unfrozen" : "frozen"} successfully` : String(res.data.error || "Failed"));
      setTimeout(() => setActionMsg(""), 3000);
      loadUsers(page, search);
    } catch { setActionMsg("Network error"); }
  };

  return (
    <AdminShell current="Users">
      {actionMsg && <div className="mb-4 rounded-xl bg-[#00d4aa]/10 px-4 py-3 text-sm text-[#00d4aa]">{actionMsg}</div>}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUsers(1, search)}
            className="w-full rounded-xl border border-white/[0.06] bg-[#111] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder-[#444] focus:border-[#00d4aa]/50"
            placeholder="Search by name, phone, email..." />
        </div>
        <button onClick={() => loadUsers(1, search)} className="rounded-xl bg-[#00d4aa] px-5 py-3 text-sm font-semibold text-black transition-all hover:bg-[#00d4aa]/90">Search</button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" /></div> : (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0b0b]">
                <tr className="border-b border-white/[0.04] text-left text-xs font-medium text-[#666]">
                  <th className="px-4 py-3">User</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.address} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/admin/users/${u.address}`)} className="text-left hover:text-[#00d4aa]">
                        <div className="font-medium text-white">{u.full_name}</div>
                        <div className="text-xs text-[#555]">{u.address.slice(0, 16)}...</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[#888]">{u.phone}</td>
                    <td className="px-4 py-3 font-mono text-sm text-white">{u.balance_display}</td>
                    <td className="px-4 py-3">
                      {u.is_frozen ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">Frozen</span> : <span className="text-xs text-[#555]">Active</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => router.push(`/admin/users/${u.address}`)} className="rounded-lg p-2 text-[#555] transition-colors hover:bg-white/[0.04] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                        <button onClick={() => toggleFreeze(u.address, u.is_frozen)} className={`rounded-lg p-2 transition-colors hover:bg-white/[0.04] ${u.is_frozen ? "text-[#00d4aa]" : "text-red-400"}`}>
                          {u.is_frozen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-[#666]">
            <span>{total} users</span>
            <div className="flex gap-2">
              <button onClick={() => loadUsers(page - 1, search)} disabled={page <= 1} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Previous</button>
              <button onClick={() => loadUsers(page + 1, search)} disabled={users.length < 20} className="rounded-lg border border-white/[0.06] px-4 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-30">Next</button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
