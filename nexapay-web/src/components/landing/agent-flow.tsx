"use client";

import {
  Store, FileText, BadgeCheck, Key, Link, Code,
  Globe, ArrowRight, Shield, Zap, Users, CreditCard,
  QrCode, Terminal, BarChart3, Clock, CheckCircle, Upload,
  Building2, Receipt, Wallet,
} from "lucide-react";

const agentSteps = [
  {
    number: "01",
    icon: FileText,
    title: "Submit Your Business",
    time: "~2 minutes",
    description:
      "Upload your business license (Patente) and optionally your RNE (National Business Registry). Enter your business name, address, and tax ID. Our AI scans the documents for authenticity — checking watermarks, text consistency, and official seals.",
    color: "border-blue-500/20 bg-blue-500/5",
    iconBg: "bg-blue-500/10 text-blue-400",
    highlight: "AI verifies document authenticity automatically",
    uploads: ["Business License (Patente)", "RNE (optional)", "Tax ID"],
  },
  {
    number: "02",
    icon: BadgeCheck,
    title: "AI Verification",
    time: "~30 seconds",
    description:
      "Our AI engine analyzes your submitted documents in real-time. It checks for forgery indicators, cross-references business registry data, and assigns a risk score. Approved applications get instant access. Flagged applications go to human review.",
    color: "border-purple-500/20 bg-purple-500/5",
    iconBg: "bg-purple-500/10 text-purple-400",
    highlight: "Risk-scored automatically",
  },
  {
    number: "03",
    icon: Key,
    title: "Developer Portal Access",
    time: "Instant",
    description:
      "Once approved, you get access to the NexaPay Developer Portal. From here you can: create and revoke API keys, set rate limits and permissions, view your transaction history, and monitor your balance — all from a single dashboard.",
    color: "border-amber-500/20 bg-amber-500/5",
    iconBg: "bg-amber-500/10 text-amber-400",
    highlight: "Full API access granted immediately",
    features: ["API Keys", "Rate Limits", "Permissions", "Dashboard"],
  },
  {
    number: "04",
    icon: Link,
    title: "Payment Links & Checkout",
    time: "No code required",
    description:
      "Create payment links directly from the portal — no coding needed. Each link generates a hosted checkout page where customers can pay with NexaPay wallet, VISA, or Mastercard. Set variable amounts, expiry dates, and success redirect URLs.",
    color: "border-emerald-500/20 bg-emerald-500/5",
    iconBg: "bg-emerald-500/10 text-emerald-400",
    highlight: "Zero-code payment links",
  },
  {
    number: "05",
    icon: Code,
    title: "SDK & API Integration",
    time: "~10 minutes",
    description:
      "For developers: drop our SDK into your codebase. Create Payment Intents, confirm payments, issue refunds, and process payouts — all through a clean REST API. Webhooks notify your backend of every event in real-time. Full sandbox environment for testing.",
    color: "border-cyan-500/20 bg-cyan-500/5",
    iconBg: "bg-cyan-500/10 text-cyan-400",
    highlight: "REST API + Webhooks + Sandbox",
    features: ["Payment Intents", "Refunds", "Payouts", "Webhooks", "Sandbox"],
  },
];

const agentTools = [
  {
    icon: Link,
    title: "Payment Links",
    desc: "Generate shareable payment links. Customers pay through a hosted checkout page. Supports variable amounts and expiry dates.",
  },
  {
    icon: Terminal,
    title: "REST API",
    desc: "Full programmatic access. Create intents, confirm payments, refund, payout. Clean JSON responses with idempotency support.",
  },
  {
    icon: Code,
    title: "TypeScript SDK",
    desc: "Drop-in SDK for Node.js/TypeScript projects. Type-safe, well-documented, with built-in retry and error handling.",
  },
  {
    icon: Globe,
    title: "Hosted Checkout",
    desc: "Pre-built payment page. Customizable with your brand colors and logo. No frontend code required from you.",
  },
  {
    icon: BarChart3,
    title: "Real-time Dashboard",
    desc: "Live metrics: transaction volume, success rate, refund rate. Filter by date, payment method, or status.",
  },
  {
    icon: Receipt,
    title: "Auto Invoicing",
    desc: "Generate tax-compliant invoices automatically for every transaction. Downloadable as PDF. Blockchain-anchored for immutability.",
  },
];

export function AgentFlow() {
  return (
    <section className="border-t border-white/[0.06] bg-[#080808] py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-4 py-1.5 text-xs font-medium text-purple-400">
            <Store className="h-3 w-3" />
            For Businesses & Developers
          </div>
          <h2 className="font-display text-glitch-display mt-6 text-[clamp(2.5rem,8vw,5rem)] leading-[0.95]">
            <span className="text-white">Accept payments</span>
            <br />
            <span className="text-[#00FF88]">in minutes.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-white/50">
            From street vendors to SaaS platforms — NexaPay gives you everything you need
            to accept payments. Payment links, APIs, SDKs, and a full developer portal.
          </p>
        </div>

        {/* Agent onboarding steps */}
        <div className="mt-16 md:mt-24">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/30">
              Become a NexaPay Agent
            </span>
          </div>
          <div className="space-y-4">
            {agentSteps.map((step) => (
              <div
                key={step.number}
                className={`group overflow-hidden rounded-2xl border ${step.color} p-6 transition-all hover:border-opacity-100 md:p-8`}
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
                  {/* Number + Icon */}
                  <div className="flex items-center gap-5 md:w-[260px] md:shrink-0">
                    <span className="font-display text-glitch-display text-[3rem] leading-none text-white/8">
                      {step.number}
                    </span>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${step.iconBg}`}>
                      <step.icon className="h-6 w-6" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-white md:text-xl">{step.title}</h3>
                      <span className="flex items-center gap-1 rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/30">
                        <Clock className="h-3 w-3" />
                        {step.time}
                      </span>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-white/45">
                      {step.description}
                    </p>

                    {/* Highlight badge */}
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 px-3 py-1 text-[11px] font-medium text-[#00FF88]">
                      <CheckCircle className="h-3 w-3" />
                      {step.highlight}
                    </div>

                    {/* Uploads / Features badges */}
                    {"uploads" in step && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(step as any).uploads.map((u: string) => (
                          <span key={u} className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10px] text-white/40">
                            <Upload className="h-3 w-3" />{u}
                          </span>
                        ))}
                      </div>
                    )}
                    {"features" in step && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(step as any).features.map((f: string) => (
                          <span key={f} className="rounded-full border border-white/[0.04] bg-white/[0.02] px-3 py-1 text-[10px] text-white/35">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent tools grid */}
        <div className="mt-20 md:mt-28">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/30">
              Developer Toolkit
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agentTools.map((tool) => (
              <div
                key={tool.title}
                className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-6 transition-all hover:border-white/[0.12]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                  <tool.icon className="h-5 w-5 text-white/60" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-white">{tool.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment flow diagram */}
        <div className="mt-16 rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-8 md:p-12">
          <h3 className="text-center text-xl font-bold text-white">
            How a Payment Works
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/40">
            From customer click to funds in your account — all in seconds.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 md:flex-row md:justify-center">
            {/* Customer */}
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
              <p className="mt-1.5 text-xs font-medium text-white">Customer</p>
              <p className="text-[10px] text-white/30">Clicks payment link</p>
            </div>

            <ArrowRight className="h-4 w-4 rotate-90 text-white/20 md:rotate-0" />

            {/* NexaPay */}
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00FF88]/10">
                <Shield className="h-6 w-6 text-[#00FF88]" />
              </div>
              <p className="mt-1.5 text-xs font-medium text-white">NexaPay Gateway</p>
              <p className="text-[10px] text-white/30">Processes payment</p>
            </div>

            <ArrowRight className="h-4 w-4 rotate-90 text-white/20 md:rotate-0" />

            {/* Validators */}
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <p className="mt-1.5 text-xs font-medium text-white">3 Validators</p>
              <p className="text-[10px] text-white/30">Verify & sign block</p>
            </div>

            <ArrowRight className="h-4 w-4 rotate-90 text-white/20 md:rotate-0" />

            {/* Merchant */}
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Store className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="mt-1.5 text-xs font-medium text-white">Your Account</p>
              <p className="text-[10px] text-white/30">Funds credited + webhook sent</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-center gap-2 text-[10px] text-white/30">
              <CheckCircle className="h-3 w-3 text-[#00FF88]" />
              Customer pays with wallet or bank card
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] text-white/30">
              <CheckCircle className="h-3 w-3 text-[#00FF88]" />
              Transaction verified by 3 independent validator nodes
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] text-white/30">
              <CheckCircle className="h-3 w-3 text-[#00FF88]" />
              Webhook notifies your backend in real-time
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col items-center gap-6 rounded-3xl border border-purple-500/20 bg-gradient-to-b from-purple-500/5 to-transparent px-10 py-12 md:px-20 md:py-16">
            <h3 className="text-2xl font-bold text-white md:text-3xl">
              Ready to accept payments?
            </h3>
            <p className="max-w-md text-sm text-white/45">
              Join businesses across Tunisia using NexaPay. Payment links, APIs, SDKs — everything you need to get paid.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#00FF88] px-6 py-3 text-sm font-bold text-black transition-all hover:bg-[#00FF88]/90">
                <Store className="h-4 w-4" />
                Register as Agent
              </a>
              <a href="/nexapay-api-docs" className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#111] px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.04]">
                <Code className="h-4 w-4" />
                View API Docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
