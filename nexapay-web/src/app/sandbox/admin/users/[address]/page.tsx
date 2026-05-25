"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { getJson, postJson } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { ArrowLeft, Loader2, Lock, Unlock, CreditCard, Building, Key, Shield, User } from "lucide-react";

export default function UserDetailPage() {
  const router = useRouter();
  const { address } = useParams<{ address: string }>();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") || undefined : "";
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    if (!token) { router.push("/admin/login"); return; }
    getJson(`/admin/users/${address}`, { "X-Admin-Token": token }).then((res) => {
      if (res.ok) setUser(res.data);
      setLoading(false);
    });
  }, [address, token]);

  const toggleFreeze = async () => {
    const endpoint = user.is_frozen ? "unfreeze" : "freeze";
    const body = user.is_frozen
      ? { reason: "Admin action" }
      : { reason: "Suspicious activity detected", legal_basis: "suspicious_activity" };
    const res = await postJson(`/admin/users/${address}/${endpoint}`, body, { "X-Admin-Token": token });
    setMsg(res.ok ? `User ${user.is_frozen ? "unfrozen" : "frozen"}` : String((res.data as any)?.error));
    setTimeout(() => { setMsg(""); if (res.ok) window.location.reload(); }, 1500);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]"><Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" /></div>;
  if (!user) return <AdminShell current="Users"><div className="text-center py-20 text-[#555]">User not found</div></AdminShell>;

  return (
    <AdminShell current="Users">
      <button onClick={() => router.push("/admin/users")} className="mb-4 flex items-center gap-1.5 text-sm text-[#666] hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
          <User className="h-7 w-7 text-[#00d4aa]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{user.full_name || "Unnamed"}</h1>
          <p className="text-xs text-[#555] font-mono">{address}</p>
        </div>
        <div className="ml-auto">
          {user.is_frozen ? (
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">Frozen</span>
          ) : (
            <span className="rounded-full bg-[#00d4aa]/10 px-3 py-1 text-xs font-medium text-[#00d4aa]">Active</span>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 rounded-xl bg-[#00d4aa]/10 px-4 py-3 text-sm text-[#00d4aa]">{msg}</div>}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: "Balance", value: user.balance_display || "0 TND", icon: CreditCard },
          { label: "Transactions", value: (user.tx_count || 0).toLocaleString(), icon: ArrowLeft },
          { label: "Has PIN", value: user.has_pin ? "Yes" : "No", icon: Key },
          { label: "KYC", value: user.kyc_status || "Unverified", icon: Shield },
          { label: "Joined", value: user.created_at ? new Date(user.created_at).toLocaleDateString() : "-", icon: User },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#666]">{s.label}</span>
              <s.icon className="h-3.5 w-3.5 text-[#555]" />
            </div>
            <div className="mt-2 text-lg font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Details grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Personal Info</h3>
          <dl className="space-y-3 text-sm">
            {[
              ["Full Name", user.full_name],
              ["Phone", user.phone],
              ["Email", user.email],
              ["CIN", user.cin],
              ["Date of Birth", user.date_of_birth],
              ["Governorate", user.governorate],
              ["Address", user.address_line],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between">
                <span className="text-[#666]">{k}</span>
                <span className="text-white">{v || "—"}</span>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
            <h3 className="mb-4 text-sm font-semibold text-white">Bank & Card</h3>
            <dl className="space-y-3 text-sm">
              {[
                ["IBAN", user.bank?.iban],
                ["RIB", user.bank?.rib],
                ["Account #", user.bank?.account_number],
                ["Card Last 4", user.card?.last4],
                ["Card Expiry", user.card?.expiry],
                ["Card Status", user.card?.frozen ? "Frozen" : user.card?.lost_reported ? "Lost" : "Active"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <span className="text-[#666]">{k}</span>
                  <span className="text-white font-mono text-xs">{v || "—"}</span>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-[#111] p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-400">
              <Lock className="h-4 w-4" /> Account Control
            </h3>
            <p className="mb-4 text-xs text-[#666]">
              {user.is_frozen ? "This account is currently frozen." : "Freeze this account to prevent all transactions."}
            </p>
            <button
              onClick={toggleFreeze}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                user.is_frozen
                  ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
                  : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
              }`}
            >
              {user.is_frozen ? <><Unlock className="h-4 w-4" /> Unfreeze Account</> : <><Lock className="h-4 w-4" /> Freeze Account</>}
            </button>
          </div>
        </div>
      </div>

      {/* Freeze History */}
      {user.freeze_history?.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Freeze History</h3>
          <div className="space-y-2">
            {user.freeze_history.map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-[#0b0b0b] px-4 py-3 text-xs">
                <div>
                  <span className="text-white">{f.reason}</span>
                  <span className="ml-2 text-[#555]">({f.legal_basis})</span>
                </div>
                <div className="text-[#666]">
                  {f.admin} — {new Date(f.frozen_at).toLocaleDateString()}
                  {f.unfrozen_at && <span className="ml-2 text-[#00d4aa]">Unfrozen</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
