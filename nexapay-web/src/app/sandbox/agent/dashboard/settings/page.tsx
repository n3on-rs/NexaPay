"use client";

import * as React from "react";
import { Settings, Shield, Key, CreditCard, Webhook, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [env, setEnv] = React.useState<string>("sandbox");
  const [testCards, setTestCards] = React.useState<TestCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showConfirm, setShowConfirm] = React.useState(false);

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
        <p className="mt-1 text-sm text-[#888]">Manage your environment, API keys, and webhook settings</p>
      </div>

      {/* Environment Section */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Shield className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Environment</h2>
            <p className="text-sm text-[#888]">Current mode and production switch</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[#0b0b0b] p-4">
          <div className="flex items-center gap-3">
            {env === "sandbox" ? (
              <span className="inline-flex items-center rounded-full border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.15)] px-3 py-1 text-xs font-medium text-[#FFB800]">
                🧪 Sandbox
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.1)] px-3 py-1 text-xs font-medium text-[#00d4aa]">
                ● LIVE
              </span>
            )}
            <span className="text-sm text-[#888]">
              {env === "sandbox"
                ? "Test cards only. No real money is processed."
                : "Real payments are processed. Test cards will not work."}
            </span>
          </div>
          <button
            onClick={() => {
              if (env === "sandbox") setShowConfirm(true);
            }}
            disabled={env !== "sandbox"}
            className={cn(
              "rounded-full px-4 py-2 text-xs font-medium transition-all",
              env === "sandbox"
                ? "bg-white/[0.04] text-white hover:bg-white/[0.08]"
                : "bg-[#00d4aa]/10 text-[#00d4aa] cursor-default"
            )}
          >
            {env === "sandbox" ? "Switch to Production" : "Production Active"}
          </button>
        </div>
      </section>

      {/* API Keys Section */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Key className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">API Keys</h2>
            <p className="text-sm text-[#888]">Manage your API credentials</p>
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

      {/* Test Cards Section */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Exp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">CVV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Result</th>
                </tr>
              </thead>
              <tbody>
                {testCards.map((tc, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 text-white">{tc.brand}</td>
                    <td className="px-4 py-3 font-mono text-[#00d4aa]">
                      {tc.number.slice(0, 4)} {tc.number.slice(4, 8)} {tc.number.slice(8, 12)} {tc.number.slice(12)}
                    </td>
                    <td className="px-4 py-3 text-[#888]">
                      {String(tc.expiry_month).padStart(2, "0")}/{tc.expiry_year}
                    </td>
                    <td className="px-4 py-3 text-[#888]">{tc.cvv}</td>
                    <td className="px-4 py-3">
                      {tc.behavior === "success" ? (
                        <span className="text-[#00d4aa]">✓ Success</span>
                      ) : tc.behavior === "insufficient_funds" ? (
                        <span className="text-amber-500">⚠ Insufficient</span>
                      ) : (
                        <span className="text-red-500">✗ Declined</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Webhooks Section */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
            <Webhook className="h-5 w-5 text-[#00d4aa]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Webhooks</h2>
            <p className="text-sm text-[#888]">Configure and test webhook deliveries</p>
          </div>
        </div>
        <div className="rounded-xl bg-[#0b0b0b] p-4 text-sm text-[#888]">
          Webhook management coming in the next update.
        </div>
      </section>

      {/* Production Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#111] border border-white/[0.06] p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-white">Switch to Production?</h3>
            <p className="mt-2 text-sm text-[#888]">
              You are switching to Production mode. Real money will be processed. Test cards will no longer work.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl border border-white/[0.06] bg-[#0b0b0b] py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setEnv("production");
                  setShowConfirm(false);
                }}
                className="flex-1 rounded-xl bg-[#00d4aa] py-3 text-sm font-semibold text-black transition-colors hover:bg-[#00d4aa]/90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
