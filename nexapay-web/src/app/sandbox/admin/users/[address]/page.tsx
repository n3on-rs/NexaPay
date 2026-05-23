"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { getJson, postJson } from "@/lib/api";
import { ArrowLeft, Loader2, Lock, Unlock, Shield, CreditCard, Building } from "lucide-react";

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
    const body = user.is_frozen ? { reason: "Admin action" } : { reason: "Suspicious activity detected", legal_basis: "suspicious_activity" };
    const res = await postJson(`/admin/users/${address}/${endpoint}`, body, { "X-Admin-Token": token });
    setMsg(res.ok ? `User ${user.is_frozen ? "unfrozen" : "frozen"}` : String(res.data.error));
    setTimeout(() => { setMsg(""); if (res.ok) window.location.reload(); }, 1500);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]"><Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" /></div>;
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">User not found</div>;

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="border-b border-white/[0.06] bg-[#0b0b0b]/80 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <button onClick={() => router.push("/admin/users")} className="rounded-lg p-2 text-[#666] hover:bg-white/[0.04] hover:text-white"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-lg font-bold">{user.full_name}</h1>
            <p className="text-xs text-[#555] font-mono">{address?.slice(0, 24)}...</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {msg && <div className="mb-4 rounded-xl bg-[#00d4aa]/10 px-4 py-3 text-sm text-[#00d4aa]">{msg}</div>}

        {/* Overview */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Balance", value: user.balance_display, icon: CreditCard },
            { label: "Transactions", value: user.tx_count, icon: ArrowLeft },
{ label: "Public Key", value: user.public_key ? `${user.public_key.slice(0, 12)}...` : "None", icon: Lock },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#666]">{s.label}</span>
                <s.icon className="h-4 w-4 text-[#555]" />
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
              {[["Full Name", user.full_name], ["Phone", user.phone], ["Email", user.email], ["CIN", user.cin], ["Date of Birth", user.date_of_birth], ["Governorate", user.governorate], ["Address", user.address_line]].map(([k,v]) => (
                <div key={k} className="flex justify-between"><span className="text-[#666]">{k}</span><span className="text-white">{v || "—"}</span></div>
              ))}
            </dl>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">Bank & Card</h3>
              <dl className="space-y-3 text-sm">
                {[["IBAN", user.bank?.iban], ["RIB", user.bank?.rib], ["Account #", user.bank?.account_number], ["Card Last 4", user.card?.last4], ["Card Expiry", user.card?.expiry], ["Card Status", user.card?.frozen ? "Frozen" : user.card?.lost_reported ? "Lost" : "Active"]].map(([k,v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[#666]">{k}</span><span className="text-white font-mono">{v || "—"}</span></div>
                ))}
              </dl>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-[#111] p-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-400"><Lock className="h-4 w-4" />Account Control</h3>
              <p className="mb-4 text-xs text-[#666]">{user.is_frozen ? "This account is currently frozen." : "Freeze this account to prevent all transactions."}</p>
              <button onClick={toggleFreeze} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${user.is_frozen ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90" : "bg-red-500/10 text-red-400 hover:bg-red-500/20"}`}>
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
      </div>
    </div>
  );
}
