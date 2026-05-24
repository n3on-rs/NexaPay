"use client";

import * as React from "react";
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent } from "../layout";
import { getCompanyDashboard, createApiKey, revokeApiKey } from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";

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
  const [existingKey, setExistingKey] = React.useState<{
    key_prefix: string;
    name: string;
    status: string;
    permissions: Record<string, boolean>;
    created_at: string;
    last_used_at?: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [newKeyValue, setNewKeyValue] = React.useState("");
  const [showNewKey, setShowNewKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [env, setEnv] = React.useState<string>("sandbox");

  React.useEffect(() => {
    document.title = "API Keys — NexaPay Agent";
    loadKey();
    fetch("/api/gateway/v1/environment")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setEnv(String(data.environment || "sandbox"));
      })
      .catch(() => {});
  }, []);

  const loadKey = async () => {
    setLoading(true);
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setLoading(false); return; }
    try {
      const res = await getCompanyDashboard(address, token);
      if (res.ok && Array.isArray(res.data.api_keys)) {
        const keys = res.data.api_keys as any[];
        if (keys.length > 0) {
          setExistingKey(keys[0]);
          // Store in localStorage for gateway calls
          const stored = localStorage.getItem("nexapay_agent_api_key");
          if (!stored) {
            // We only have the prefix — full key was shown at creation time
          }
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleGenerate = async () => {
    setActionLoading(true);
    setError("");
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) { setActionLoading(false); return; }

    // If there's an existing key, revoke it first
    if (existingKey) {
      try {
        await revokeApiKey(address, token, existingKey.key_prefix);
      } catch { /* ignore revoke errors */ }
    }

    try {
      const res = await createApiKey(address, token, {
        name: "Default Key",
        permissions: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
      });
      if (res.ok) {
        const createdKey = String((res.data as any).api_key || "");
        setNewKeyValue(createdKey);
        setShowNewKey(true);
        if (createdKey && typeof window !== "undefined") {
          localStorage.setItem("nexapay_agent_api_key", createdKey);
        }
        loadKey();
      } else {
        setError(String((res.data as any).error || "Failed to generate key"));
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setActionLoading(false);
    setShowRegenConfirm(false);
  };

  const copyKey = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskPrefix = (prefix: string) => {
    if (prefix.length <= 8) return prefix;
    return prefix.slice(0, 6) + "••••••••••" + prefix.slice(-4);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-space-grotesk text-[24px] font-bold text-white">API Key</h1>
          <p className="mt-1 text-[13px] text-[#888]">Your developer API key — keep it secure</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Key Card */}
      {existingKey ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d0d0d] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
              <Key className="h-5 w-5 text-[#00d4aa]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">{existingKey.name}</p>
              <p className="text-[12px] text-[#888]">
                Created {new Date(existingKey.created_at).toLocaleDateString()}
                {existingKey.last_used_at && ` · Last used ${new Date(existingKey.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
            <div className="ml-auto">
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                existingKey.status === "active"
                  ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                  : "bg-red-500/10 text-red-400"
              )}>
                {existingKey.status}
              </span>
            </div>
          </div>

          {/* Key prefix display */}
          <div className="flex items-center gap-2 rounded-xl bg-[#0a0a0a] border border-white/[0.06] px-4 py-3">
            <code className="flex-1 text-[13px] font-mono text-white/60 select-all">
              {revealed && apiKey ? apiKey : maskPrefix(existingKey.key_prefix)}
            </code>
            <div className="flex items-center gap-1">
              {apiKey && (
                <button
                  onClick={() => setRevealed(!revealed)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-colors"
                  title={revealed ? "Hide key" : "Reveal key"}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
              {apiKey && revealed && (
                <button
                  onClick={() => copyKey(apiKey)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-colors"
                  title="Copy key"
                >
                  {copied ? <Check className="h-4 w-4 text-[#00d4aa]" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Regenerate button */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
            <div>
              <p className="text-[12px] text-[#888]">Regenerating replaces your existing key immediately</p>
            </div>
            <button
              onClick={() => setShowRegenConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[13px] font-medium text-amber-400 transition-all hover:bg-amber-500/10 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Regenerate
            </button>
          </div>
        </div>
      ) : (
        /* No key exists yet */
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0d0d0d] p-8 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00d4aa]/10 mx-auto">
            <Shield className="h-6 w-6 text-[#00d4aa]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">No API key yet</h3>
            <p className="mt-1 text-[13px] text-[#888]">Generate your developer API key to start integrating</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-5 py-2.5 text-[13px] font-semibold text-[#0b0b0b] transition-all hover:bg-[#00e67a] disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            Generate API Key
          </button>
        </div>
      )}

      {/* New key success modal */}
      {showNewKey && newKeyValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#00d4aa]/20 bg-[#0d0d0d] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#00d4aa]">
              <Check className="h-5 w-5" />
              <span className="text-[14px] font-semibold">API Key Generated</span>
            </div>
            <p className="text-[13px] text-[#888]">
              Copy your API key now. <strong>You will not be able to see it again.</strong>
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-[#0a0a0a] border border-white/[0.08] px-4 py-3">
              <code className="flex-1 text-[12px] font-mono text-[#00d4aa] break-all select-all">{newKeyValue}</code>
              <button
                onClick={() => copyKey(newKeyValue)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00d4aa]/10 text-[#00d4aa] hover:bg-[#00d4aa]/20 transition-colors"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => { setShowNewKey(false); setNewKeyValue(""); }}
              className="w-full rounded-xl bg-[#00d4aa] py-2.5 text-[13px] font-semibold text-[#0b0b0b] transition-all hover:bg-[#00e67a]"
            >
              I have saved my key
            </button>
          </div>
        </div>
      )}

      {/* Regenerate confirmation */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-[400px] rounded-2xl border border-amber-500/20 bg-[#0d0d0d] p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-[14px] font-semibold">Regenerate API Key?</span>
            </div>
            <p className="text-[13px] text-[#888]">
              This will permanently revoke your current API key and generate a new one. Any services using the old key will stop working immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2.5 text-[13px] font-medium text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={actionLoading}
                className="flex-1 rounded-xl bg-amber-500/20 border border-amber-500/30 py-2.5 text-[13px] font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
