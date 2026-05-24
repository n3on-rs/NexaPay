"use client";

import * as React from "react";
import { Settings, Shield, Key, CreditCard, Loader2, Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent } from "../layout";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import { getJson, postJson } from "@/lib/api";

interface TestCard {
  brand: string;
  number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
  behavior: string;
  description: string;
}

export default function SettingsPage() {
  const { agent, refresh } = useAgent();
  const [env, setEnv] = React.useState<string>("sandbox");
  const [testCards, setTestCards] = React.useState<TestCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showConfirm, setShowConfirm] = React.useState(false);

  // Business profile fields
  const [businessName, setBusinessName] = React.useState("");
  const [businessDesc, setBusinessDesc] = React.useState("");
  const [businessAddress, setBusinessAddress] = React.useState("");
  const [businessGovernorate, setBusinessGovernorate] = React.useState("");
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileSaved, setProfileSaved] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/gateway/v1/environment")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setEnv(String(data.environment || "sandbox"));
          if (Array.isArray(data.test_cards)) {
            setTestCards(data.test_cards as TestCard[]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load existing profile data
  React.useEffect(() => {
    if (agent) {
      setBusinessName(String(agent.business_name || ""));
      setBusinessDesc(String(agent.business_description || ""));
      setBusinessAddress(String(agent.business_address || ""));
      setBusinessGovernorate(String(agent.business_governorate || ""));
    }
  }, [agent]);

  const handleSaveProfile = async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address || !businessName.trim()) return;
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      // Use the company settings endpoint to update business info
      const res = await postJson(`/accounts/${address}/company/settings`, {
        business_name: businessName.trim(),
        business_description: businessDesc.trim(),
        business_address: businessAddress.trim(),
        business_governorate: businessGovernorate.trim(),
      }, { "X-Account-Token": token });
      if (res.ok) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
        await refresh();
      }
    } catch { /* ignore */ }
    setProfileSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-[#00d4aa]" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#888]">Manage your business profile, environment, and credentials</p>
      </div>

      {/* Business Profile */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Settings className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Business Profile</h2>
            <p className="text-sm text-[#888]">Update your business information</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your Business Name"
              className="mt-1.5 h-11 w-full rounded-xl bg-[#0b0b0b] border border-white/[0.08] px-3.5 text-sm text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all placeholder:text-white/20"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Governorate</label>
            <input
              type="text"
              value={businessGovernorate}
              onChange={(e) => setBusinessGovernorate(e.target.value)}
              placeholder="Tunis"
              className="mt-1.5 h-11 w-full rounded-xl bg-[#0b0b0b] border border-white/[0.08] px-3.5 text-sm text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all placeholder:text-white/20"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Business Address</label>
          <input
            type="text"
            value={businessAddress}
            onChange={(e) => setBusinessAddress(e.target.value)}
            placeholder="123 Main Street"
            className="mt-1.5 h-11 w-full rounded-xl bg-[#0b0b0b] border border-white/[0.08] px-3.5 text-sm text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all placeholder:text-white/20"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Description</label>
          <textarea
            value={businessDesc}
            onChange={(e) => setBusinessDesc(e.target.value)}
            placeholder="Describe your business..."
            rows={3}
            className="mt-1.5 w-full rounded-xl bg-[#0b0b0b] border border-white/[0.08] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all placeholder:text-white/20 resize-none"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveProfile}
            disabled={profileSaving || !businessName.trim()}
            className={cn(
              "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all",
              profileSaved
                ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                : "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
            )}
          >
            {profileSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : profileSaved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {profileSaved ? "Saved" : "Save Changes"}
          </button>
        </div>
      </section>

      {/* Environment Section */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Shield className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Environment</h2>
            <p className="text-sm text-[#888]">Current mode</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[#0b0b0b] p-4">
          <div className="flex items-center gap-3">
            {env === "sandbox" ? (
              <span className="inline-flex items-center rounded-full border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.15)] px-3 py-1 text-xs font-medium text-[#FFB800]">Sandbox</span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.1)] px-3 py-1 text-xs font-medium text-[#00d4aa]">LIVE</span>
            )}
            <span className="text-sm text-[#888]">
              {env === "sandbox" ? "Test mode — no real money" : "Live payments active"}
            </span>
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Key className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">API Key</h2>
            <p className="text-sm text-[#888]">Manage your developer API key</p>
          </div>
        </div>
        <a
          href="/agent/dashboard/api-keys"
          className="flex items-center justify-between rounded-xl bg-[#0b0b0b] p-4 transition-colors hover:bg-white/[0.02]"
        >
          <span className="text-sm text-white">Go to API Keys page</span>
          <Key className="h-4 w-4 text-[#888]" />
        </a>
      </section>

      {/* Test Cards */}
      {env === "sandbox" && testCards.length > 0 && (
        <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFB800]/10">
              <CreditCard className="h-5 w-5 text-[#FFB800]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Test Cards</h2>
              <p className="text-sm text-[#888]">Use these for sandbox testing</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-[#0b0b0b]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Brand</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Expiry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">CVV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Result</th>
                </tr>
              </thead>
              <tbody>
                {testCards.map((tc, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2.5 text-white">{tc.brand}</td>
                    <td className="px-4 py-2.5 font-mono text-white/60">{tc.number}</td>
                    <td className="px-4 py-2.5 font-mono text-white/60">{tc.expiry_month}/{tc.expiry_year}</td>
                    <td className="px-4 py-2.5 font-mono text-white/60">{tc.cvv}</td>
                    <td className="px-4 py-2.5">
                      {tc.behavior === "success" ? (
                        <span className="text-[#00d4aa] text-xs font-medium">Success</span>
                      ) : (
                        <span className="text-red-400 text-xs font-medium">{tc.behavior}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
