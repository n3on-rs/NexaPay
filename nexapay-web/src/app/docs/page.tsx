"use client";

import * as React from "react";
import { Copy, Check, ExternalLink, Terminal, Key, Globe, CreditCard, Webhook, ArrowLeftRight, BookOpen } from "lucide-react";

const BASE_URL = "https://backend.nexapay.space";
const SDK_PACKAGE = "@nexapay/node-sdk";
const SDK_URL = "https://www.npmjs.com/package/@nexapay/node-sdk";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative group rounded-xl bg-[#0a0a0a] border border-white/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-[#555] hover:text-white transition-colors">
          {copied ? <Check className="h-3.5 w-3.5 text-[#00d4aa]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-white/70 whitespace-pre">{code}</pre>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d4aa]/10"><Icon className="h-4 w-4 text-[#00d4aa]" /></div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const SIDEBAR_SECTIONS = [
  { id: "sdk", label: "Node.js SDK", icon: Terminal },
  { id: "rest-api", label: "REST API", icon: Globe },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "test-cards", label: "Test Cards", icon: CreditCard },
  { id: "errors", label: "Error Codes", icon: ArrowLeftRight },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = React.useState("sdk");

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    SIDEBAR_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto flex max-w-[1200px] gap-10 px-6 py-16">
        {/* Sticky Sidebar */}
        <aside className="hidden lg:block w-[200px] shrink-0">
          <nav className="sticky top-16 space-y-1">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#555]">On this page</p>
            {SIDEBAR_SECTIONS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={"#" + id}
                className={
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors " +
                  (activeSection === id
                    ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                    : "text-[#666] hover:text-white hover:bg-white/[0.04]")
                }
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </a>
            ))}
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <a
                href={SDK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-[#555] hover:text-white transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> npm package
              </a>
              <a
                href="/agent/dashboard/api-keys"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-[#555] hover:text-white transition-colors"
              >
                <Key className="h-3 w-3" /> Get API Key
              </a>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight">NexaPay API Documentation</h1>
            <p className="mt-3 text-[15px] text-white/40 max-w-[600px]">
              Integrate payments into your application using the NexaPay REST API or our official Node.js SDK.
            </p>
            <div className="mt-4 flex gap-3">
              <a href={SDK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#00d4aa]/90 transition-all">
                <Terminal className="h-4 w-4" /> SDK on npm
              </a>
              <a href="/agent/dashboard/api-keys" className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-all">
                <Key className="h-4 w-4" /> Get API Key
              </a>
            </div>
          </div>

          <div className="space-y-16">
          {/* SDK */}
          <div id="sdk"><Section icon={Terminal} title="Node.js SDK">
            <p className="text-sm text-white/50">Install the official SDK from npm. Full TypeScript support included.</p>
            <CodeBlock code={"npm install " + SDK_PACKAGE} />
            <p className="text-sm text-white/50 mt-4">Quick start:</p>
            <CodeBlock lang="typescript" code={`import NexaPay from "@nexapay/node-sdk";

const client = new NexaPay({
  apiKey: "nxp_developer_your_key_here",
  baseURL: "https://backend.nexapay.space",
});

// Create a 42 TND payment intent
const { data } = await client.paymentIntents.create({
  amount: 42000,
  currency: "TND",
  description: "Order #42",
  customer_name: "Ahmed Ben Ali",
  success_webhook_url: "https://mysite.tn/webhooks/success",
  failure_webhook_url: "https://mysite.tn/webhooks/failed",
});

// Redirect customer
window.location.href = data.checkout_url;

// List recent intents
const { data: intents } = await client.paymentIntents.list({ limit: 10 });

// Cancel an intent
await client.paymentIntents.cancel("pi_abc123");

// Create a refund
const { data: refund } = await client.refunds.create({
  intent_id: "pi_abc123",
  amount: 42000,
  reason: "customer_request",
});

// Get your balance
const { data: balance } = await client.balance.get();

// Create a payout
const { data: payout } = await client.payouts.create({
  amount: 100000,
  rib: "99000236175790748382",
  account_holder_name: "Ahmed Ben Ali",
});`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">SDK Methods</h3>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["client.paymentIntents.create(data)", "Create payment intent"],
                    ["client.paymentIntents.get(id)", "Retrieve payment intent"],
                    ["client.paymentIntents.list(params?)", "List all payment intents"],
                    ["client.paymentIntents.confirm(id, data)", "Confirm payment (card/wallet)"],
                    ["client.paymentIntents.cancel(id)", "Cancel a payment intent"],
                    ["client.refunds.create(data)", "Create a refund"],
                    ["client.refunds.list(params?)", "List all refunds"],
                    ["client.payouts.create(data)", "Withdraw balance"],
                    ["client.payouts.list(params?)", "List all payouts"],
                    ["client.balance.get()", "Get merchant balance"],
                    ["client.transactions.list(params?)", "List transactions"],
                    ["client.webhooks.create(data)", "Register a webhook"],
                    ["client.webhooks.list()", "List webhooks"],
                    ["client.webhooks.delete(id)", "Delete a webhook"],
                    ["client.webhooks.deliveries(id)", "Get webhook delivery log"],
                  ].map(([m, d]) => (
                    <tr key={m} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#00d4aa]">{m}</td>
                      <td className="px-4 py-2.5 text-xs text-white/40">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section></div>

          {/* REST API */}
          <div id="rest-api">
          <Section icon={Globe} title="REST API">
            <p className="text-sm text-white/50">All requests to <code className="text-[#00d4aa] bg-[#00d4aa]/5 px-1.5 py-0.5 rounded text-xs">{BASE_URL}</code> with <code className="text-[#00d4aa] bg-[#00d4aa]/5 px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header.</p>

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">Create Payment Intent</h3>
            <CodeBlock code={`curl -X POST ${BASE_URL}/gateway/v1/intents \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nxp_developer_your_key_here" \\
  -d '{
    "amount": 42000,
    "currency": "TND",
    "description": "Order #42",
    "success_webhook_url": "https://mysite.tn/hooks/success",
    "failure_webhook_url": "https://mysite.tn/hooks/failed"
  }'`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">List & Cancel</h3>
            <CodeBlock code={`# List all intents
curl -X GET ${BASE_URL}/gateway/v1/intents?limit=10 \\
  -H "X-API-Key: nxp_developer_your_key_here"

# Cancel an intent
curl -X DELETE ${BASE_URL}/gateway/v1/intents/pi_abc123 \\
  -H "X-API-Key: nxp_developer_your_key_here"`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">Confirm Payment (Card)</h3>
            <CodeBlock code={`curl -X POST ${BASE_URL}/gateway/v1/intents/pi_abc123/confirm \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nxp_developer_your_key_here" \\
  -d '{
    "method": "card",
    "card_number": "4242424242424242",
    "expiry_month": "12",
    "expiry_year": "2029",
    "cvv": "123",
    "card_holder_name": "Ahmed Ben Ali"
  }'`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">Confirm Payment (Wallet)</h3>
            <CodeBlock code={`# Step 1: Verify PIN
curl -X POST ${BASE_URL}/gateway/v1/intents/pi_abc123/confirm \\
  -H "Content-Type: application/json" \\
  -d '{"method": "wallet", "phone": "21653249239", "pin": "123456"}'

# Step 2: Verify OTP
curl -X POST ${BASE_URL}/gateway/v1/intents/pi_abc123/confirm \\
  -H "Content-Type: application/json" \\
  -d '{"method": "wallet", "phone": "21653249239", "pin": "123456", "otp": "123456"}'`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">Refunds & Payouts</h3>
            <CodeBlock code={`# Create refund
curl -X POST ${BASE_URL}/gateway/v1/refunds \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nxp_developer_your_key_here" \\
  -d '{"intent_id": "pi_abc123", "amount": 42000, "reason": "customer_request"}'

# Withdraw to bank
curl -X POST ${BASE_URL}/gateway/v1/payout \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nxp_developer_your_key_here" \\
  -d '{"amount": 100000, "rib": "99000236175790748382", "account_holder_name": "Ahmed Ben Ali"}'`} />

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">All Endpoints</h3>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Endpoint</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["POST", "/gateway/v1/intents", "Create payment intent"],
                    ["GET", "/gateway/v1/intents", "List all payment intents"],
                    ["GET", "/gateway/v1/intents/:id", "Get payment intent"],
                    ["DELETE", "/gateway/v1/intents/:id", "Cancel payment intent"],
                    ["POST", "/gateway/v1/intents/:id/confirm", "Confirm payment"],
                    ["POST", "/gateway/v1/refunds", "Create refund"],
                    ["GET", "/gateway/v1/refunds", "List refunds"],
                    ["POST", "/gateway/v1/payout", "Withdraw balance"],
                    ["GET", "/gateway/v1/balance", "Get merchant balance"],
                    ["GET", "/gateway/v1/transactions", "List transactions"],
                    ["POST", "/gateway/v1/webhooks", "Create webhook"],
                    ["GET", "/gateway/v1/webhooks", "List webhooks"],
                    ["DELETE", "/gateway/v1/webhooks/:id", "Delete webhook"],
                    ["GET", "/gateway/v1/webhooks/:id/deliveries", "Webhook delivery log"],
                    ["GET", "/gateway/v1/environment", "Get env + test cards"],
                  ].map(([m, p, d]) => (
                    <tr key={p} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-2.5"><span className="text-[10px] font-bold uppercase tracking-wider text-[#00d4aa]">{m}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/70">{p}</td>
                      <td className="px-4 py-2.5 text-xs text-white/40">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section></div>

          {/* Webhooks */}
          <div id="webhooks"><Section icon={Webhook} title="Webhooks">
            <p className="text-sm text-white/50">
              Webhook events are sent with <code className="text-[#00d4aa] bg-[#00d4aa]/5 px-1.5 py-0.5 rounded text-xs">x-nexapay-signature</code> header (HMAC-SHA256). Failed deliveries are retried up to 3 times.
            </p>
            <p className="text-sm text-white/40 mt-2">You can set per-intent webhook URLs for success/failure, or register persistent webhooks for your merchant account.</p>
            <CodeBlock code={`// Verify webhook signature (Node.js)
import crypto from "crypto";

function verifySignature(payload, signature, secret) {
  const t = signature.split(",")[0].split("=")[1];
  const v1 = signature.split(",")[1].split("=")[1];
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(t + "." + JSON.stringify(payload));
  return hmac.digest("hex") === v1;
}`} />
          </Section></div>

          {/* Test Cards */}
          <div id="test-cards"><Section icon={CreditCard} title="Test Cards (Sandbox)">
            <p className="text-sm text-white/50">Use any future expiry date (e.g. 12/2029). These only work in sandbox mode.</p>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Brand</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">CVV</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["Visa", "4242424242424242", "123", "Success"],
                    ["MasterCard", "5555555555554444", "123", "Success"],
                    ["Visa", "4000000000000002", "123", "Declined"],
                    ["Visa", "4000000000009995", "123", "Insufficient Funds"],
                    ["MasterCard", "5105105105105100", "123", "Declined"],
                  ].map(([b, n, c, r]) => (
                    <tr key={n} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-2.5 text-xs text-white/70">{b}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/50">{n}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/50">{c}</td>
                      <td className="px-4 py-2.5 text-xs">{r === "Success" ? <span className="text-[#00d4aa]">{r}</span> : <span className="text-red-400">{r}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section></div>

          {/* Errors */}
          <div id="errors"><Section icon={ArrowLeftRight} title="Error Codes">
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888]">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["200", "Success"],
                    ["400", "Invalid request (check parameters)"],
                    ["401", "Invalid or missing API key"],
                    ["402", "Payment declined"],
                    ["404", "Resource not found"],
                    ["429", "Rate limited — slow down"],
                    ["500", "Server error — try again"],
                  ].map(([c, d]) => (
                    <tr key={c} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-2.5 font-mono text-xs text-white/70">{c}</td>
                      <td className="px-4 py-2.5 text-xs text-white/40">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section></div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/20">
            Built by <a href="https://backendglitch.com" target="_blank" rel="noopener noreferrer" className="text-[#00d4aa]/60 hover:text-[#00d4aa] transition-colors">Glitch Inc / BackendGlitch Division</a>
            {" · "}
            <a href={SDK_URL} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/50 transition-colors">npm</a>
            {" · "}
            <a href="mailto:contact@backendglitch.com" className="text-white/30 hover:text-white/50 transition-colors">contact@backendglitch.com</a>
          </p>
        </div>
        </div>{/* close main content */}
      </div>{/* close flex container */}
    </div>
  );
}
