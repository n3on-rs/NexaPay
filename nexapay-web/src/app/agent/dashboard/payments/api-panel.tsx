"use client";

import * as React from "react";
import {
  ChevronRight,
  Copy,
  Check,
  Play,
  Shield,
  Webhook,
  Package,
  ArrowRight,
  Loader2,
  Zap,
  Key,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent } from "../layout";
import { postJson, getJson, getCompanyDashboard } from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/gateway/v1/intents",
    title: "Create Payment Intent",
    description: "Create a new payment intent to accept a payment from a customer.",
    params: [
      { name: "amount", type: "number", required: true, desc: "Amount in millimes (1 TND = 1000)" },
      { name: "currency", type: "string", required: false, desc: "ISO 4217 currency code (default: TND)" },
      { name: "description", type: "string", required: false, desc: "Payment description shown to customer" },
    ],
    response: [
      { name: "intent_id", type: "string", desc: "Unique payment intent identifier" },
      { name: "client_secret", type: "string", desc: "Secret for confirming the payment" },
      { name: "status", type: "string", desc: "Payment status: pending, succeeded, failed" },
      { name: "pay_url", type: "string", desc: "Checkout URL for the customer" },
    ],
  },
  {
    method: "GET",
    path: "/gateway/v1/intents/:id",
    title: "Get Payment Details",
    description: "Retrieve the details of an existing payment intent.",
    params: [
      { name: "id", type: "string", required: true, desc: "Payment intent ID" },
    ],
    response: [
      { name: "intent_id", type: "string", desc: "Unique payment intent identifier" },
      { name: "amount", type: "number", desc: "Amount in millimes" },
      { name: "status", type: "string", desc: "Current payment status" },
      { name: "created_at", type: "string", desc: "ISO 8601 creation timestamp" },
    ],
  },
  {
    method: "POST",
    path: "/gateway/v1/intents/:id/confirm",
    title: "Confirm Payment",
    description: "Confirm a payment intent after the customer has completed payment.",
    params: [
      { name: "id", type: "string", required: true, desc: "Payment intent ID" },
      { name: "payment_method", type: "string", required: true, desc: "wallet, card, or edinar" },
    ],
    response: [
      { name: "intent_id", type: "string", desc: "Payment intent identifier" },
      { name: "status", type: "string", desc: "Confirmed payment status" },
      { name: "confirmed_at", type: "string", desc: "Confirmation timestamp" },
    ],
  },
  {
    method: "POST",
    path: "/gateway/v1/refunds",
    title: "Create Refund",
    description: "Refund all or part of a completed payment to the customer.",
    params: [
      { name: "intent_id", type: "string", required: true, desc: "ID of the payment to refund" },
      { name: "amount", type: "number", required: true, desc: "Refund amount in millimes" },
      { name: "reason", type: "string", required: false, desc: "Reason for the refund" },
    ],
    response: [
      { name: "refund_id", type: "string", desc: "Unique refund identifier" },
      { name: "status", type: "string", desc: "Refund status: pending, succeeded, failed" },
    ],
  },
  {
    method: "POST",
    path: "/gateway/v1/payout",
    title: "Withdraw Balance",
    description: "Withdraw your available balance to a bank account or wallet.",
    params: [
      { name: "amount", type: "number", required: true, desc: "Withdrawal amount in millimes" },
      { name: "destination", type: "string", required: true, desc: "Bank RIB or wallet address" },
    ],
    response: [
      { name: "payout_id", type: "string", desc: "Unique payout identifier" },
      { name: "status", type: "string", desc: "Payout status: queued, processing, paid" },
    ],
  },
  {
    method: "POST",
    path: "/gateway/v1/webhooks",
    title: "Register Webhook",
    description: "Register a URL to receive real-time payment event notifications.",
    params: [
      { name: "url", type: "string", required: true, desc: "Your HTTPS endpoint URL" },
      { name: "events", type: "array", required: false, desc: "Event types to subscribe to (default: all payment events)" },
    ],
    response: [
      { name: "id", type: "string", desc: "Webhook registration ID" },
      { name: "signing_secret", type: "string", desc: "Secret for verifying webhook signatures" },
    ],
  },
];

export default function ApiPanel() {
  const { apiKey, setApiKey } = useAgent();
  const safeApiKey = apiKey || "";
  const maskedKey = safeApiKey
    ? `${safeApiKey.slice(0, 8)}••••••${safeApiKey.slice(-6)}`
    : "Not available";

  return (
    <div className="space-y-8">
      {/* Getting Started */}
      <GettingStarted maskedKey={maskedKey} safeApiKey={safeApiKey} setApiKey={setApiKey} />

      {/* Endpoints */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Endpoints</h2>
        <div className="space-y-3">
          {ENDPOINTS.map((ep, i) => (
            <EndpointCard key={i} endpoint={ep} safeApiKey={safeApiKey} />
          ))}
        </div>
      </section>

      {/* Webhook Guide */}
      <WebhookGuide />

      {/* SDK */}
      <SdkSection />
    </div>
  );
}

interface ApiKeyOption {
  prefix: string;
  name: string;
  fullKey?: string;
  status: string;
}

function GettingStarted({
  maskedKey,
  safeApiKey,
  setApiKey,
}: {
  maskedKey: string;
  safeApiKey: string;
  setApiKey: (key: string | null) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [keyOptions, setKeyOptions] = React.useState<ApiKeyOption[]>([]);
  const [selectedOpt, setSelectedOpt] = React.useState<ApiKeyOption | null>(null);

  React.useEffect(() => {
    const loadKeys = async () => {
      const token = getSessionToken();
      const address = getSessionAddress();
      if (!token || !address) return;
      try {
        const res = await getCompanyDashboard(address, token);
        if (res.ok && Array.isArray(res.data.api_keys)) {
          const backendKeys = res.data.api_keys as Array<{
            key_prefix: string;
            name: string;
            status: string;
          }>;

          // Gather all full keys we know about (from this browser)
          const knownKeys: string[] = [];
          if (safeApiKey) knownKeys.push(safeApiKey);
          const listRaw = typeof window !== "undefined"
            ? localStorage.getItem("nexapay_agent_api_keys_list")
            : null;
          if (listRaw) {
            const list: string[] = JSON.parse(listRaw);
            for (const k of list) if (!knownKeys.includes(k)) knownKeys.push(k);
          }
          // Also check old map storage for backward compat
          const mapRaw = typeof window !== "undefined"
            ? localStorage.getItem("nexapay_agent_api_keys_map")
            : null;
          if (mapRaw) {
            const map: Record<string, string> = JSON.parse(mapRaw);
            for (const k of Object.values(map)) if (!knownKeys.includes(k)) knownKeys.push(k);
          }

          const opts: ApiKeyOption[] = [];
          for (const bk of backendKeys) {
            const prefix = String(bk.key_prefix || "");
            if (bk.status !== "active") continue;
            // Find a stored full key that matches this prefix
            const full = knownKeys.find((fk) =>
              fk.startsWith(prefix) || prefix.startsWith(fk.slice(0, prefix.length))
            );
            opts.push({
              prefix,
              name: String(bk.name || prefix),
              fullKey: full,
              status: bk.status,
            });
          }
          setKeyOptions(opts);
        }
      } catch { /* ignore */ }
    };
    loadKeys();
  }, [safeApiKey]);

  const selected = selectedOpt || keyOptions.find((o) => o.fullKey === safeApiKey) || keyOptions[0];

  const handleSelect = (opt: ApiKeyOption) => {
    setSelectedOpt(opt);
    if (opt.fullKey) {
      setApiKey(opt.fullKey);
    }
  };

  const handleCopy = () => {
    if (safeApiKey) {
      navigator.clipboard.writeText(safeApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const steps = [
    {
      num: 1,
      title: "Initialize Payment",
      desc: "Call POST /intents with amount and description. Get back a checkout URL.",
    },
    {
      num: 2,
      title: "Webhook receives result",
      desc: "NexaPay POSTs the payment result to your registered webhook URL in real-time.",
    },
    {
      num: 3,
      title: "Verify payment status",
      desc: "Call GET /intents/:id to confirm the payment before fulfilling the order.",
    },
  ];

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
      <h2 className="mb-6 text-lg font-semibold text-white">Getting Started</h2>
      <div className="relative">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-4 pb-6 last:pb-0">
            <div className="flex flex-col items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00FF88]/10 text-sm font-bold text-[#00FF88]">
                {step.num}
              </div>
              {i < steps.length - 1 && (
                <div className="mt-2 h-full w-px bg-[#00FF88]/20" />
              )}
            </div>
            <div className="pb-2">
              <h4 className="text-sm font-semibold text-white">{step.title}</h4>
              <p className="mt-1 text-sm text-[#888]">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* API Key box */}
      <div className="mt-6 rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-[#666]">Your API Key</span>
          <a
            href="/agent/dashboard/api-keys"
            className="text-xs text-[#00FF88] hover:underline"
          >
            Manage Keys
          </a>
        </div>

        {/* Key selector */}
        {keyOptions.length > 0 ? (
          <div className="relative mb-3">
            <select
              value={(selectedOpt?.fullKey || selectedOpt?.prefix) || (selected?.fullKey || selected?.prefix) || safeApiKey}
              onChange={(e) => {
                const opt = keyOptions.find((o) => (o.fullKey || o.prefix) === e.target.value);
                if (opt) handleSelect(opt);
              }}
              className={cn(
                "w-full appearance-none rounded-lg border border-white/[0.08] bg-[#111] px-3 py-2 pr-10 text-sm text-white outline-none transition-colors",
                "focus:border-[#00FF88]/40 hover:border-white/[0.12]"
              )}
            >
              {keyOptions.map((opt) => (
                <option key={opt.prefix} value={opt.fullKey || opt.prefix}>
                  {opt.name} — {opt.prefix.slice(0, 8)}...{opt.prefix.slice(-4)}{opt.fullKey ? "" : " (not stored in this browser)"}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#666]" />
          </div>
        ) : safeApiKey ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#00FF88]/10 bg-[#00FF88]/5 px-3 py-2 text-sm text-[#00FF88]">
            <Key className="h-4 w-4" />
            <span>Active Key</span>
            <span className="text-[#666]">({safeApiKey.slice(0, 8)}...{safeApiKey.slice(-6)})</span>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-white/[0.08] bg-[#111] px-3 py-2 text-sm text-[#666]">
            No active API key — create one in Manage Keys
          </div>
        )}

        {selectedOpt && !selectedOpt.fullKey ? (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This key was created in another browser. Go to <a href="/agent/dashboard/api-keys" className="underline hover:text-yellow-300">Manage Keys</a> to create a new one you can copy.</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-lg bg-[#111] px-3 py-2 text-sm font-mono text-[#00FF88]">
              {maskedKey}
            </code>
            <button
              onClick={handleCopy}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-[#888] transition-colors hover:text-white"
            >
              {copied ? <Check className="h-4 w-4 text-[#00FF88]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function EndpointCard({
  endpoint,
  safeApiKey,
}: {
  endpoint: (typeof ENDPOINTS)[number];
  safeApiKey: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [lang, setLang] = React.useState<"curl" | "js" | "python" | "rust">("js");
  const [liveOpen, setLiveOpen] = React.useState(false);
  const [liveLoading, setLiveLoading] = React.useState(false);
  const [liveResponse, setLiveResponse] = React.useState<{
    status: number;
    body: Record<string, unknown>;
  } | null>(null);
  const [liveFields, setLiveFields] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const defaults: Record<string, string> = {};
    endpoint.params.forEach((p) => {
      if (p.name === "amount") defaults[p.name] = "10000";
      else if (p.name === "currency") defaults[p.name] = "TND";
      else if (p.name === "description") defaults[p.name] = "Order #1234";
      else if (p.name === "id") defaults[p.name] = "pi_test_123";
      else if (p.name === "payment_method") defaults[p.name] = "wallet";
      else if (p.name === "intent_id") defaults[p.name] = "pi_test_123";
      else if (p.name === "reason") defaults[p.name] = "Customer request";
      else if (p.name === "destination") defaults[p.name] = "TN59 1234 5678 9012 3456 7890 1234";
      else if (p.name === "url") defaults[p.name] = "https://yoursite.com/webhook";
      else defaults[p.name] = "";
    });
    setLiveFields(defaults);
  }, [endpoint]);

  const handleLiveTest = async () => {
    setLiveLoading(true);
    const path = endpoint.path.replace(/:id/g, liveFields.id || "test");
    const body: Record<string, unknown> = {};
    endpoint.params.forEach((p) => {
      if (p.name !== "id" && liveFields[p.name]) {
        const val = liveFields[p.name];
        body[p.name] = p.type === "number" ? parseFloat(val) || 0 : val;
      }
    });

    let res;
    if (endpoint.method === "GET") {
      res = await getJson(path, { "X-API-Key": safeApiKey });
    } else {
      res = await postJson(path, body, { "X-API-Key": safeApiKey });
    }
    setLiveResponse({ status: res.status, body: res.data });
    setLiveLoading(false);
  };

  const codeSnippets: Record<string, string> = {
    curl: `curl -X ${endpoint.method} \\\\n  https://backend.nexapay.space/api${endpoint.path} \\\\n  -H "X-API-Key: ${safeApiKey || "nxp_live_your_key"}" \\\\n  -H "Content-Type: application/json" \\\\n  -d '${JSON.stringify(
    Object.fromEntries(
      endpoint.params
        .filter((p) => p.name !== "id")
        .map((p) => [
          p.name,
          p.type === "number" ? 10000 : p.name === "currency" ? "TND" : "value",
        ])
    ),
    null,
    2
  )}'`,
    js: `const response = await fetch("https://backend.nexapay.space/api${endpoint.path}", {
  method: "${endpoint.method}",
  headers: {
    "X-API-Key": "${safeApiKey || "nxp_live_your_key"}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
${endpoint.params
  .filter((p) => p.name !== "id")
  .map((p) => `    ${p.name}: ${p.type === "number" ? "10000" : `"${p.name === "currency" ? "TND" : "value"}"`},`)
  .join("\n")}
  }),
});

const data = await response.json();`,
    python: `import requests

response = requests.${endpoint.method.toLowerCase() === "post" ? "post" : "get"}(
    "https://backend.nexapay.space/api${endpoint.path}",
    headers={"X-API-Key": "${safeApiKey || "nxp_live_your_key"}"},
    json={
${endpoint.params
  .filter((p) => p.name !== "id")
  .map((p) => `        "${p.name}": ${p.type === "number" ? "10000" : `"${p.name === "currency" ? "TND" : "value"}"`},`)
  .join("\n")}
    },
)

data = response.json()`,
    rust: `use reqwest;

let client = reqwest::Client::new();
let response = client
    .${endpoint.method.toLowerCase() === "post" ? "post" : "get"}("https://backend.nexapay.space/api${endpoint.path}")
    .header("X-API-Key", "${safeApiKey || "nxp_live_your_key"}")
    .json(&serde_json::json!({
${endpoint.params
  .filter((p) => p.name !== "id")
  .map((p) => `        "${p.name}": ${p.type === "number" ? "10000" : `"${p.name === "currency" ? "TND" : "value"}"`},`)
  .join("\n")}
    }))
    .send()
    .await?;

let data: serde_json::Value = response.json().await?;`,
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider",
            endpoint.method === "POST"
              ? "bg-[#00FF88]/10 text-[#00FF88]"
              : "bg-blue-500/10 text-blue-400"
          )}
        >
          {endpoint.method}
        </span>
        <span className="text-sm font-mono text-white">{endpoint.path}</span>
        <span className="ml-auto text-sm text-[#888]">{endpoint.title}</span>
        <ChevronRight
          className={cn("h-4 w-4 text-[#666] transition-transform", expanded && "rotate-90")}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-5 py-5">
          <p className="text-sm text-[#888]">{endpoint.description}</p>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            {/* Left: params + response */}
            <div className="space-y-5">
              <div>
                <h5 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Parameters</h5>
                <div className="rounded-lg border border-white/[0.04] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0a0a0a] text-left">
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Parameter</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Type</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Required</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.params.map((p, i) => (
                        <tr key={i} className={cn("border-t border-white/[0.04]", i % 2 === 1 && "bg-white/[0.01]")}>
                          <td className="px-3 py-2 font-mono text-[#00FF88]">{p.name}</td>
                          <td className="px-3 py-2 text-[#888]">{p.type}</td>
                          <td className="px-3 py-2">
                            {p.required ? (
                              <span className="text-[#00FF88]">Yes</span>
                            ) : (
                              <span className="text-[#666]">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#888]">{p.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h5 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Response</h5>
                <div className="rounded-lg border border-white/[0.04] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0a0a0a] text-left">
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Field</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Type</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-[#666]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.response.map((r, i) => (
                        <tr key={i} className={cn("border-t border-white/[0.04]", i % 2 === 1 && "bg-white/[0.01]")}>
                          <td className="px-3 py-2 font-mono text-[#00FF88]">{r.name}</td>
                          <td className="px-3 py-2 text-[#888]">{r.type}</td>
                          <td className="px-3 py-2 text-[#888]">{r.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: code + live tester */}
            <div className="space-y-4">
              <div>
                <div className="flex gap-1 mb-2">
                  {(["curl", "js", "python", "rust"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        lang === l
                          ? "bg-[#00FF88]/10 text-[#00FF88]"
                          : "text-[#888] hover:text-white"
                      )}
                    >
                      {l === "js" ? "JavaScript" : l === "curl" ? "cURL" : l.charAt(0).toUpperCase() + l.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="relative rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(codeSnippets[lang]);
                    }}
                    className="absolute right-3 top-3 flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] text-[#888] transition-colors hover:text-white"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                  <pre className="overflow-x-auto text-xs leading-relaxed">
                    <code className="font-mono text-[#ccc]">{codeSnippets[lang]}</code>
                  </pre>
                </div>
              </div>

              {/* Live Tester */}
              <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a]">
                <button
                  onClick={() => setLiveOpen(!liveOpen)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-white">
                    <Play className="h-4 w-4 text-[#00FF88]" />
                    Try it live
                  </span>
                  <ChevronRight
                    className={cn("h-4 w-4 text-[#666] transition-transform", liveOpen && "rotate-90")}
                  />
                </button>

                {liveOpen && (
                  <div className="border-t border-white/[0.06] px-4 py-4 space-y-3">
                    {endpoint.params.map((p) => (
                      <div key={p.name}>
                        <label className="mb-1 block text-xs text-[#888]">
                          {p.name}
                          {p.required && <span className="text-[#00FF88]">*</span>}
                        </label>
                        <input
                          value={liveFields[p.name] || ""}
                          onChange={(e) =>
                            setLiveFields((f) => ({ ...f, [p.name]: e.target.value }))
                          }
                          placeholder={p.desc}
                          className="w-full rounded-lg bg-[#111] border border-white/[0.06] px-3 py-2 text-sm text-white placeholder-[#444] outline-none focus:border-[#00FF88]/50"
                        />
                      </div>
                    ))}
                    <button
                      onClick={handleLiveTest}
                      disabled={liveLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#00FF88]/90 disabled:opacity-50"
                    >
                      {liveLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      Send Request
                    </button>

                    {liveResponse && (
                      <div className="rounded-lg bg-[#111] border border-white/[0.04] p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-bold",
                              liveResponse.status >= 200 && liveResponse.status < 300
                                ? "bg-[#00FF88]/10 text-[#00FF88]"
                                : "bg-red-500/10 text-red-400"
                            )}
                          >
                            {liveResponse.status}
                          </span>
                        </div>
                        <pre className="overflow-x-auto text-xs text-[#888] font-mono">
                          {JSON.stringify(liveResponse.body, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WebhookGuide() {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
        <Webhook className="h-5 w-5 text-[#00FF88]" />
        Webhook Guide
      </h2>

      {/* Flow diagram */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <FlowBox label="Client" subtitle="Your customer" color="gray" />
        <ArrowRight className="hidden h-5 w-5 text-[#666] sm:block" />
        <FlowBox label="Your Backend" subtitle="Handles webhooks" color="gray" />
        <ArrowRight className="hidden h-5 w-5 text-[#666] sm:block" />
        <FlowBox label="NexaPay" subtitle="POST webhook" color="green" />
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-sm font-medium text-white">Webhook payload example</h4>
        <div className="rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed font-mono">
            <code className="text-[#ccc]">
{`{
  "event": "payment_intent.succeeded",
  "data": {
    "intent_id": "pi_test_123",
    "amount": 10000,
    "currency": "TND",
    "status": "succeeded",
    "confirmed_at": "2024-01-15T10:30:00Z"
  },
  "signature": "sha256=..."
}`}
            </code>
          </pre>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-sm font-medium text-white flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#00FF88]" />
          Signature verification
        </h4>
        <p className="text-sm text-[#888] mb-3">
          Verify the webhook signature to ensure it came from NexaPay:
        </p>
        <div className="rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed font-mono">
            <code className="text-[#ccc]">
{`// JavaScript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === \`sha256=\${expected}\`;
}`}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function FlowBox({
  label,
  subtitle,
  color,
}: {
  label: string;
  subtitle: string;
  color: "green" | "gray";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-5 py-4 text-center min-w-[140px]",
        color === "green"
          ? "border-[#00FF88]/20 bg-[#00FF88]/5"
          : "border-white/[0.06] bg-[#0a0a0a]"
      )}
    >
      <div className={cn("text-sm font-semibold", color === "green" ? "text-[#00FF88]" : "text-white")}>
        {label}
      </div>
      <div className="mt-1 text-[11px] text-[#666]">{subtitle}</div>
    </div>
  );
}

function SdkSection() {
  const [pkgCopied, setPkgCopied] = React.useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setPkgCopied(true);
    setTimeout(() => setPkgCopied(false), 2000);
  };

  const installCode = `npm install @nexapay/sdk`;

  const quickStart = `import { NexaPayClient } from '@nexapay/sdk';

const client = new NexaPayClient({
  apiKey: 'nxp_live_your_key_here'
});

// Create a payment
const payment = await client.paymentIntents.create({
  amount: 10000, // 10.000 TND
  description: 'Order #1234',
  webhook: 'https://yoursite.com/webhook'
});

console.log(payment.payUrl);`;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
        <Package className="h-5 w-5 text-[#00FF88]" />
        SDK
      </h2>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-[#666]">Install</span>
          <button
            onClick={() => handleCopy(installCode)}
            className="flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] text-[#888] transition-colors hover:text-white"
          >
            {pkgCopied ? <Check className="h-3 w-3 text-[#00FF88]" /> : <Copy className="h-3 w-3" />}
            Copy
          </button>
        </div>
        <div className="rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
          <code className="font-mono text-sm text-[#ccc]">{installCode}</code>
        </div>
      </div>

      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-[#666]">Quick start</span>
        <div className="mt-2 rounded-xl bg-[#0a0a0a] border border-white/[0.06] p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed font-mono">
            <code className="text-[#ccc]">{quickStart}</code>
          </pre>
        </div>
      </div>

      <a
        href="https://nexapay.space/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1 text-sm text-[#00FF88] hover:underline"
      >
        View full SDK docs
        <ExternalLinkIcon />
      </a>
    </section>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
