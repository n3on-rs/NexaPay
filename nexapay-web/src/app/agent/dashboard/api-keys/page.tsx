"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Key,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  MoreVertical,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent } from "../layout";
import {
  getCompanyDashboard,
  createApiKey,
  revokeApiKey,
} from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";

interface ApiKeyItem {
  key_prefix: string;
  name: string;
  status: string;
  permissions: Record<string, boolean>;
  created_at: string;
  last_used_at?: string | null;
  is_primary?: boolean;
}

const ALL_PERMISSIONS = [
  { key: "payment_intents", label: "Payment Intents", desc: "Create and confirm payments" },
  { key: "refunds", label: "Refunds", desc: "Issue refunds on payments" },
  { key: "payouts", label: "Payouts", desc: "Withdraw balance" },
  { key: "webhooks", label: "Webhooks", desc: "Create and manage webhooks" },
  { key: "balance", label: "Balance", desc: "View gateway balance" },
  { key: "transactions", label: "Transactions", desc: "View transaction history" },
];

export default function ApiKeysPage() {
  const { apiKey } = useAgent();
  const router = useRouter();
  const [keys, setKeys] = React.useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [showRevoke, setShowRevoke] = React.useState<ApiKeyItem | null>(null);
  const [newKeyValue, setNewKeyValue] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [revokeLoading, setRevokeLoading] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createPerms, setCreatePerms] = React.useState<Record<string, boolean>>(
    ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {})
  );
  const [env, setEnv] = React.useState<string>("sandbox");

  React.useEffect(() => {
    document.title = "API Keys — NexaPay Agent";
    loadKeys();
    fetch("/api/gateway/v1/environment")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setEnv(String(data.environment || "sandbox"));
      })
      .catch(() => {});
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setLoading(false); return; }
    try {
      const res = await getCompanyDashboard(address, token);
      if (res.ok && Array.isArray(res.data.api_keys)) {
        setKeys(res.data.api_keys as ApiKeyItem[]);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreateLoading(true);
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setCreateLoading(false); return; }
    try {
      const res = await createApiKey(address, token, { name: createName.trim(), permissions: createPerms });
      if (res.ok) {
        const createdKey = String((res.data as any).api_key || "");
        setNewKeyValue(createdKey);
        // Auto-save to localStorage so gateway calls work immediately
        if (createdKey && typeof window !== "undefined") {
          localStorage.setItem("nexapay_agent_api_key", createdKey);
          const listRaw = localStorage.getItem("nexapay_agent_api_keys_list");
          const list: string[] = listRaw ? JSON.parse(listRaw) : [];
          if (!list.includes(createdKey)) {
            list.push(createdKey);
            localStorage.setItem("nexapay_agent_api_keys_list", JSON.stringify(list));
          }
        }
        setShowCreate(false);
        setShowSuccess(true);
        setCreateName("");
        setCreatePerms(ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}));
        loadKeys();
      }
    } catch { /* ignore */ }
    setCreateLoading(false);
  };

  const handleRevoke = async () => {
    if (!showRevoke) return;
    setRevokeLoading(true);
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setRevokeLoading(false); return; }
    try {
      const res = await revokeApiKey(address, token, showRevoke.key_prefix);
      if (res.ok) {
        setShowRevoke(null);
        loadKeys();
      }
    } catch { /* ignore */ }
    setRevokeLoading(false);
  };

  const copyKey = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskPrefix = (prefix: string) => {
    if (prefix.length <= 8) return prefix;
    return prefix.slice(0, 4) + "••••••" + prefix.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-space-grotesk text-[24px] font-bold text-white">API Keys</h1>
          <p className="mt-1 text-[13px] text-[#888]">Manage your API keys and permissions</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-full bg-[#00FF88] px-4 py-2.5 text-[13px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a]"
        >
          <Plus className="h-4 w-4" /> Create API Key
        </button>
      </div>

      {env === "sandbox" && (
        <div className="flex items-center gap-3 rounded-xl border border-[#FFB800]/20 bg-[#FFB800]/10 p-4 text-sm text-[#FFB800]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>🧪 You&apos;re in Sandbox mode. Use test cards only. No real payments are processed.</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-10 text-center">
          <Key className="mx-auto h-12 w-12 text-[#333]" />
          <p className="mt-4 text-[16px] font-medium text-white">No API keys yet</p>
          <p className="mt-1 text-[13px] text-[#555]">Create your first key to start integrating</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#00FF88] px-5 py-2.5 text-[13px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a]"
          >
            <Plus className="h-4 w-4" /> Create API Key
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => {
            const isRevoked = k.status === "revoked";
            return (
              <div
                key={k.key_prefix}
                className={cn(
                  "rounded-2xl border border-white/[0.06] bg-[#111] p-5",
                  isRevoked && "opacity-50"
                )}
              >
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-[#00FF88]" />
                    <span className="text-[14px] font-semibold text-white">{k.name}</span>
                    {k.is_primary && (
                      <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#aaa]">
                        Primary
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                        isRevoked
                          ? "bg-red-500/10 text-red-400"
                          : "bg-[#00FF88]/10 text-[#00FF88]"
                      )}
                    >
                      {isRevoked ? "Revoked" : "Active"}
                    </span>
                  </div>
                  {!isRevoked && (
                    <div className="relative">
                      <button
                        onClick={() => setShowRevoke(k)}
                        className="rounded-lg p-2 text-[#555] transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Key prefix */}
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                  <code className="flex-1 truncate font-mono text-[13px] text-[#aaa]">
                    {maskPrefix(k.key_prefix)}
                  </code>
                </div>

                {/* Permissions */}
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <span
                      key={perm.key}
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        k.permissions?.[perm.key]
                          ? "bg-[#00FF88]/10 text-[#00FF88]"
                          : "bg-white/[0.04] text-[#555]"
                      )}
                    >
                      {k.permissions?.[perm.key] ? "✓" : "✗"} {perm.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Key Panel */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-[#111] p-6 md:rounded-3xl md:border md:border-white/[0.08]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-white">Create API Key</h3>
              <button onClick={() => setShowCreate(false)} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-[#888]">Key name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Production Key"
                  className="mt-1 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00FF88]/40"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#888]">Permissions</label>
                <div className="mt-2 space-y-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <label key={perm.key} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                      <div>
                        <p className="text-[13px] font-medium text-white">{perm.label}</p>
                        <p className="text-[11px] text-[#555]">{perm.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={createPerms[perm.key]}
                        onChange={(e) => setCreatePerms((p) => ({ ...p, [perm.key]: e.target.checked }))}
                        className="h-5 w-5 accent-[#00FF88]"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || createLoading}
                className="mt-2 flex h-14 w-full items-center justify-center rounded-full bg-[#00FF88] text-[14px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a] disabled:opacity-50"
              >
                {createLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-[#00FF88]/20 bg-[#111] p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00FF88]/10">
              <Check className="h-7 w-7 text-[#00FF88]" />
            </div>
            <h3 className="text-[18px] font-bold text-white">Your new API key</h3>
            <p className="mt-1 text-[13px] text-[#888]">Save it now — you won&apos;t see it again</p>
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[12px] text-red-400">This key will only be shown once. Copy it before closing.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-3">
              <code className="flex-1 break-all font-mono text-[12px] text-[#aaa]">{newKeyValue}</code>
              <button
                onClick={() => copyKey(newKeyValue)}
                className="rounded-lg p-1.5 text-[#555] hover:text-white"
              >
                {copied ? <Check className="h-4 w-4 text-[#00FF88]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => { setShowSuccess(false); setCopied(false); }}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#00FF88] text-[14px] font-semibold text-[#080808] transition-all hover:bg-[#00e67a]"
            >
              I&apos;ve saved my key
            </button>
          </div>
        </div>
      )}

      {/* Revoke Confirmation */}
      {showRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/20 bg-[#111] p-6">
            <h3 className="text-[18px] font-bold text-white">Revoke this API key?</h3>
            <p className="mt-2 text-[13px] text-[#888]">
              Any applications using this key will immediately stop working. This cannot be undone.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowRevoke(null)}
                className="flex h-12 items-center justify-center rounded-full border border-white/[0.08] text-[13px] font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revokeLoading}
                className="flex h-12 items-center justify-center rounded-full bg-red-500 text-[13px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {revokeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revoke Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
