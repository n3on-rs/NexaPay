"use client";

import { Store, Code, Globe, BarChart3, Receipt, Terminal } from "lucide-react";

const agentFeatures = [
  {
    icon: Store,
    title: "Payment links",
    desc: "Generate shareable checkout pages in seconds. No code required — set a price, share the link, get paid.",
  },
  {
    icon: Terminal,
    title: "REST API",
    desc: "Full programmatic access. Create payment intents, confirm, refund, payout. Clean JSON with idempotency keys.",
  },
  {
    icon: Code,
    title: "TypeScript SDK",
    desc: "Drop-in SDK for Node.js projects. Type-safe, well-documented, with built-in retry and error handling.",
  },
  {
    icon: Globe,
    title: "Hosted checkout",
    desc: "Pre-built payment page, customizable with your brand. No frontend work required on your side.",
  },
  {
    icon: BarChart3,
    title: "Live dashboard",
    desc: "Transaction volume, success rates, refund tracking. Filter by date, payment method, or status.",
  },
  {
    icon: Receipt,
    title: "Auto invoicing",
    desc: "Tax-compliant invoices generated automatically. Downloadable PDFs, anchored on-chain for immutability.",
  },
];

export function AgentFlow() {
  return (
    <section id="agents" className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">For business</p>
        <h2 className="mt-4 max-w-[600px] text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
          Accept payments in minutes
        </h2>
        <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/40">
          From market stalls to SaaS platforms — payment links, APIs, and SDKs for every business.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agentFeatures.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-white/[0.06] bg-[#141414] p-6 transition-all hover:border-white/[0.12]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                <f.icon className="h-5 w-5 text-white/60" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <div className="rounded-3xl border border-white/[0.06] bg-[#141414] px-8 py-16 md:px-16 md:py-20">
            <h3 className="text-2xl font-semibold text-white md:text-3xl">Ready to start accepting payments?</h3>
            <p className="mx-auto mt-3 max-w-md text-[14px] text-white/40">
              Join businesses across Tunisia using NexaPay. Payment links, APIs, SDKs — everything you need.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-6 py-3 text-[14px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90">
                Register as Agent →
              </a>
              <a href="/nexapay-api-docs" className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.04]">
                View API Docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
