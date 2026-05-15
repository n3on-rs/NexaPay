"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchAccountDetails,
  updateProfile,
  uploadAvatar,
  getAgentStatus,
  type AccountDetails,
  type AgentApplicationStatus,
} from "@/lib/api";
import { getSessionToken, getSessionAddress, getSessionFullName, getSessionPhone } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import {
  Home,
  ArrowUpRight,
  Plus,
  Clock,
  User,
  LogOut,
  ArrowLeft,
  Copy,
  Check,
  Phone,
  CreditCard,
  Bell,
  ChevronRight,
  MapPin,
  Camera,
  X,
  Pencil,
  Info,
  Headphones,
  ToggleLeft,
  ToggleRight,
  Shield,
  Briefcase,
} from "lucide-react";
import Link from "next/link";

// ─── Utilities ───
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "****";
  return "***" + phone.slice(-4);
}

// ─── Types ───
interface Municipality {
  Name: string;
  NameAr: string;
  Value: string;
  Delegations: Array<{
    Name: string;
    NameAr: string;
    Value: string;
    PostalCode: string;
    Latitude: number;
    Longitude: number;
  }>;
}

// ─── Toggle Switch ───
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-3"
    >
      <span className="text-[14px] text-white">{label}</span>
      {checked ? (
        <ToggleRight className="h-6 w-6 text-[#00FF88]" />
      ) : (
        <ToggleLeft className="h-6 w-6 text-[#555]" />
      )}
    </button>
  );
}

// ─── Profile Page ───
function ProfileInner() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [account, setAccount] = React.useState<AccountDetails | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copiedKey, setCopiedKey] = React.useState("");
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showNotifModal, setShowNotifModal] = React.useState(false);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [agentStatus, setAgentStatus] = React.useState<AgentApplicationStatus | null>(null);
  const [agentLoading, setAgentLoading] = React.useState(true);
  const [showRejectModal, setShowRejectModal] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Notification settings stored in localStorage
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [txAlerts, setTxAlerts] = React.useState(true);
  const [marketingNotifs, setMarketingNotifs] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setPushEnabled(localStorage.getItem("nexapay_push_notifs") === "true");
      setTxAlerts(localStorage.getItem("nexapay_tx_alerts") !== "false");
      setMarketingNotifs(localStorage.getItem("nexapay_marketing") === "true");
    }
  }, []);

  const saveNotifSetting = (key: string, value: boolean) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, String(value));
    }
  };

  React.useEffect(() => {
    document.title = "Profile — NexaPay";
    const load = async () => {
      const token = getSessionToken();
      const address = getSessionAddress();
      if (!token || !address) { setLoading(false); setAgentLoading(false); return; }
      try {
        const res = await fetchAccountDetails(address, token);
        if (res.ok && "full_name" in res.data) {
          setAccount(res.data as AccountDetails);
        }
      } catch { /* ignore */ }
      setLoading(false);
      try {
        const agentRes = await getAgentStatus(address, token);
        if (agentRes.ok) {
          setAgentStatus(agentRes.data);
        }
      } catch { /* ignore */ }
      setAgentLoading(false);
    };
    load();
  }, []);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch { /* ignore */ }
  };

  const fullName = account?.full_name || user?.fullName || getSessionFullName() || "User";
  const address = getSessionAddress();
  const phone = user?.phone || getSessionPhone() || "";

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getSessionToken();
    const addr = getSessionAddress();
    if (!token || !addr) return;
    setAvatarUploading(true);
    try {
      const res = await uploadAvatar(addr, token, file);
      if (res.ok && res.data.avatar_url) {
        setAccount((prev) => prev ? { ...prev, avatar_url: String(res.data.avatar_url) } : prev);
        setToast("Avatar updated");
        setTimeout(() => setToast(""), 3000);
      } else {
        setToast("Upload failed");
        setTimeout(() => setToast(""), 3000);
      }
    } catch {
      setToast("Upload failed");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter selection:bg-[#00FF88] selection:text-black">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Profile</h1>
        </div>

        {/* Profile Card */}
        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={handleAvatarClick}
            disabled={avatarUploading}
            className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/[0.08] bg-[#111] overflow-hidden transition-all hover:ring-2 hover:ring-[#00FF88]/30 disabled:opacity-60"
          >
            {account?.avatar_url ? (
              <img src={account.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[#00FF88] text-[28px] font-extrabold">{getInitials(fullName)}</span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <h2 className="mt-4 font-space-grotesk text-[20px] font-bold text-white">{fullName}</h2>
          <p className="mt-1 text-[13px] text-[#888]">{account?.account_type === "company" ? "Company Account" : "Personal Account"}</p>
          <div className="mt-3 flex items-center gap-2 rounded-full border border-[#00FF88]/20 bg-[#00FF88]/10 px-4 py-1.5">
            <div className="h-2 w-2 rounded-full bg-[#00FF88]" />
            <span className="text-[12px] font-medium text-[#00FF88]">Verified</span>
          </div>
        </div>

        {/* CIN */}
        <div className="mt-6 rounded-2xl border border-white/[0.04] bg-[#111] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#888]">CIN Number</p>
              <p className="mt-1 text-[14px] font-medium text-white">{account?.cin || "---"}</p>
            </div>
            <Info className="h-4 w-4 text-[#555]" />
          </div>
        </div>

        {/* Location / Address */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Location</p>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1 text-[12px] text-[#00FF88] hover:underline"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-white/[0.04] bg-[#111] overflow-hidden">
            {[
              {
                label: "Address",
                value: account?.address_line || "Not set",
                icon: MapPin,
              },
              {
                label: "Delegation",
                value: account?.delegation || "Not set",
                icon: MapPin,
              },
              {
                label: "Governorate",
                value: account?.governorate || "Not set",
                icon: MapPin,
              },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5",
                  i < arr.length - 1 && "border-b border-white/[0.04]"
                )}
              >
                <row.icon className="h-5 w-5 shrink-0 text-[#888]" />
                <div className="flex-1">
                  <p className="text-[13px] text-[#888]">{row.label}</p>
                  <p className={cn("text-[14px] font-medium", row.value === "Not set" ? "text-[#555]" : "text-white")}>{row.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Card */}
        <section className="mt-6">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Card</p>
          <Link
            href="/card"
            className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
          >
            <CreditCard className="h-5 w-5 shrink-0 text-[#888]" />
            <div className="flex-1">
              <p className="text-[13px] text-[#888]">Virtual Card</p>
              <p className="text-[14px] font-medium text-white">
                {account?.card ? `•••• ${account.card.last4}` : "No card"}
                {account?.card_frozen && (
                  <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">Frozen</span>
                )}
                {account?.card_lost_reported && (
                  <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">Lost</span>
                )}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#555]" />
          </Link>
        </section>

        {/* Security */}
        <section className="mt-6">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Security</p>
          <Link
            href="/change-pin"
            className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
          >
            <Shield className="h-5 w-5 shrink-0 text-[#888]" />
            <div className="flex-1">
              <p className="text-[14px] text-white">Change PIN</p>
              <p className="text-[12px] text-[#555]">Update your 6-digit PIN</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#555]" />
          </Link>
        </section>

        {/* Become Agent */}
        <section className="mt-6">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Agent</p>
          {(() => {
            const status = agentStatus?.status;
            const isPending = status === "PENDING" || status === "UNDER_REVIEW";
            const isRejected = status === "REJECTED";
            const isApproved = status === "APPROVED";
            if (isApproved) {
              return (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5">
                  <Briefcase className="h-5 w-5 shrink-0 text-[#00FF88]" />
                  <div className="flex-1">
                    <p className="text-[14px] text-white">Agent Account</p>
                    <p className="text-[12px] text-[#00FF88]">Approved</p>
                  </div>
                </div>
              );
            }
            if (isPending) {
              return (
                <button
                  disabled
                  className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 text-left transition-colors opacity-60 cursor-not-allowed"
                >
                  <Briefcase className="h-5 w-5 shrink-0 text-[#888]" />
                  <div className="flex-1">
                    <p className="text-[14px] text-white">Become an Agent</p>
                    <p className="text-[12px] text-amber-400">Application {status?.toLowerCase().replace("_", " ")}</p>
                  </div>
                </button>
              );
            }
            return (
              <button
                onClick={() => {
                  if (isRejected) setShowRejectModal(true);
                  else router.push("/agent");
                }}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <Briefcase className="h-5 w-5 shrink-0 text-[#888]" />
                <div className="flex-1">
                  <p className="text-[14px] text-white">Become an Agent</p>
                  <p className="text-[12px] text-[#555]">
                    {isRejected ? "View rejection reason and re-apply" : "Submit your agent application"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#555]" />
              </button>
            );
          })()}
        </section>

        {/* Notifications */}
        <section className="mt-6">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Preferences</p>
          <button
            onClick={() => setShowNotifModal(true)}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
          >
            <Bell className="h-5 w-5 shrink-0 text-[#888]" />
            <span className="flex-1 text-[14px] text-white">Notifications</span>
            <ChevronRight className="h-4 w-4 text-[#555]" />
          </button>
        </section>

        {/* Support */}
        <section className="mt-6">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Support</p>
          <a
            href="tel:+21631335500"
            className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-[#111] px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
          >
            <Headphones className="h-5 w-5 shrink-0 text-[#888]" />
            <div className="flex-1">
              <p className="text-[13px] text-[#888]">Contact Support</p>
              <p className="text-[14px] font-medium text-white">+216 31 335 500</p>
            </div>
            <Phone className="h-4 w-4 text-[#00FF88]" />
          </a>
        </section>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 py-3.5 text-[14px] font-semibold text-red-400 transition-all hover:bg-red-500/15"
        >
          <LogOut className="h-4 w-4" /> Log Out
        </button>

        {/* Version */}
        <p className="mt-8 text-center text-[11px] text-[#333]">NexaPay v1.0 · Built in Tunisia</p>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center">
          <div className="rounded-full bg-[#111] border border-white/[0.08] px-5 py-2.5 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <EditProfileModal
          account={account}
          onClose={() => setShowEditModal(false)}
          onUpdate={(updated) => setAccount((prev) => prev ? { ...prev, ...updated } : prev)}
        />
      )}

      {/* Notification Settings Modal */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-[#111] p-6 md:rounded-3xl md:border md:border-white/[0.08]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-white">Notifications</h3>
              <button onClick={() => setShowNotifModal(false)} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <Toggle
                checked={pushEnabled}
                onChange={(v) => { setPushEnabled(v); saveNotifSetting("nexapay_push_notifs", v); if (v && typeof window !== "undefined") { Notification.requestPermission(); } }}
                label="Allow background notifications"
              />
              <div className="h-px bg-white/[0.04]" />
              <Toggle
                checked={txAlerts}
                onChange={(v) => { setTxAlerts(v); saveNotifSetting("nexapay_tx_alerts", v); }}
                label="Transaction alerts"
              />
              <div className="h-px bg-white/[0.04]" />
              <Toggle
                checked={marketingNotifs}
                onChange={(v) => { setMarketingNotifs(v); saveNotifSetting("nexapay_marketing", v); }}
                label="Marketing notifications"
              />
            </div>
            <button
              onClick={() => setShowNotifModal(false)}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-white/[0.06] text-white font-semibold transition-all hover:bg-white/[0.10]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Rejected Agent Modal */}
      {showRejectModal && agentStatus && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-[#111] p-6 md:rounded-3xl md:border md:border-white/[0.08]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-white">Application Rejected</h3>
              <button onClick={() => setShowRejectModal(false)} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-[13px] text-[#aaa]">
              {agentStatus.rejection_reason && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Reason</p>
                  <p className="mt-1 text-white">{agentStatus.rejection_reason}</p>
                </div>
              )}
              {agentStatus.reviewer_notes && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Reviewer Notes</p>
                  <p className="mt-1 text-white">{agentStatus.reviewer_notes}</p>
                </div>
              )}
              {agentStatus.tax_document_path && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Submitted Business License</p>
                  <p className="mt-1 truncate text-[#00FF88]">{agentStatus.tax_document_path}</p>
                </div>
              )}
              {agentStatus.rne_document_path && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Submitted RNE Document</p>
                  <p className="mt-1 truncate text-[#00FF88]">{agentStatus.rne_document_path}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setShowRejectModal(false);
                router.push("/agent");
              }}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#00FF88] text-[14px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a]"
            >
              File New Application
            </button>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00FF88] text-[#080808] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <div className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#00FF88]" /><span className="text-[10px] text-[#00FF88]">Profile</span></div>
      </nav>
    </div>
  );
}

// ─── Edit Profile Modal ───
function EditProfileModal({
  account,
  onClose,
  onUpdate,
}: {
  account: AccountDetails | null;
  onClose: () => void;
  onUpdate: (fields: Partial<AccountDetails>) => void;
}) {
  const [addressLine, setAddressLine] = React.useState(account?.address_line || "");
  const [delegation, setDelegation] = React.useState(account?.delegation || "");
  const [governorate, setGovernorate] = React.useState(account?.governorate || "");
  const [loading, setLoading] = React.useState(false);
  const [municipalities, setMunicipalities] = React.useState<Municipality[]>([]);
  const [govLoading, setGovLoading] = React.useState(false);

  React.useEffect(() => {
    const loadGovs = async () => {
      setGovLoading(true);
      try {
        const res = await fetch("/api/municipalities");
        if (res.ok) {
          const data = await res.json();
          setMunicipalities(data as Municipality[]);
        }
      } catch { /* ignore */ }
      setGovLoading(false);
    };
    loadGovs();
  }, []);

  const selectedGov = municipalities.find((m) => m.Value === governorate);
  const delegations = selectedGov?.Delegations.map((d) => d.Value) || [];

  const handleSave = async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) return;
    setLoading(true);
    try {
      const res = await updateProfile(address, token, {
        address_line: addressLine || undefined,
        delegation: delegation || undefined,
        governorate: governorate || undefined,
      });
      if (res.ok) {
        onUpdate({
          address_line: addressLine || null,
          delegation: delegation || null,
          governorate: governorate || null,
        });
        onClose();
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
      <div className="flex h-[85vh] w-full max-w-sm flex-col rounded-t-3xl bg-[#111] md:h-auto md:rounded-3xl md:border md:border-white/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h3 className="text-[20px] font-bold text-white">Edit Profile</h3>
          <button onClick={onClose} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {/* Readonly section */}
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Identity (Read-only)</p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-[12px] text-[#888]">Full Name</label>
              <input readOnly value={account?.full_name || ""} className="mt-1 h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-[14px] text-[#888] outline-none" />
            </div>
            <div>
              <label className="text-[12px] text-[#888]">CIN</label>
              <input readOnly value={account?.cin || ""} className="mt-1 h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-[14px] text-[#888] outline-none" />
            </div>
            <div>
              <label className="text-[12px] text-[#888]">Phone</label>
              <input readOnly value={account?.phone || maskPhone(userPhone())} className="mt-1 h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-[14px] text-[#888] outline-none" />
            </div>
            <div>
              <label className="text-[12px] text-[#888]">Email</label>
              <input readOnly value={account?.email || "---"} className="mt-1 h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-[14px] text-[#888] outline-none" />
            </div>
            <div>
              <label className="text-[12px] text-[#888]">KYC Status</label>
              <input readOnly value={account?.kyc_status === "verified" ? "Verified" : "Pending"} className="mt-1 h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-[14px] text-[#888] outline-none" />
            </div>
          </div>

          {/* Editable section */}
          <p className="mt-6 text-[12px] font-bold uppercase tracking-widest text-[#00FF88]">Location (Editable)</p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-[12px] text-[#888]">Address Line</label>
              <input
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Street, building, apartment..."
                className="mt-1 h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white outline-none transition-all focus:border-[#00FF88]/30 focus:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="text-[12px] text-[#888]">Governorate</label>
              <div className="relative mt-1">
                <select
                  value={governorate}
                  onChange={(e) => { setGovernorate(e.target.value); setDelegation(""); }}
                  disabled={govLoading}
                  className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-10 text-[14px] text-white outline-none transition-all focus:border-[#00FF88]/30 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111] text-white">Select governorate</option>
                  {municipalities.map((m) => (
                    <option key={m.Value} value={m.Value} className="bg-[#111] text-white">{m.Name}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#888]" />
              </div>
            </div>
            <div>
              <label className="text-[12px] text-[#888]">Delegation</label>
              <div className="relative mt-1">
                <select
                  value={delegation}
                  onChange={(e) => setDelegation(e.target.value)}
                  disabled={!governorate}
                  className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-10 text-[14px] text-white outline-none transition-all focus:border-[#00FF88]/30 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111] text-white">Select delegation</option>
                  {delegations.map((d, idx) => (
                    <option key={`${idx}-${d}`} value={d} className="bg-[#111] text-white">{d}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#888]" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex h-14 w-full items-center justify-center rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all disabled:opacity-40"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function userPhone(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_phone") || "";
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileInner />
    </ProtectedRoute>
  );
}
