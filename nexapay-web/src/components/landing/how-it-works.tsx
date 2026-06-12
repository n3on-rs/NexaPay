"use client";

import { UserPlus, Fingerprint, ShieldCheck, CreditCard, Send, Zap, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    time: "~2 min",
    title: "Create your account",
    desc: "Enter your phone number and CIN. No paperwork, no branch visits — just your phone.",
  },
  {
    icon: Fingerprint,
    time: "~1 min",
    title: "Verify your identity",
    desc: "Our system validates your CIN against the national registry. Instant KYC, fully automated.",
  },
  {
    icon: ShieldCheck,
    time: "Instant",
    title: "Account activated",
    desc: "A bank account is created automatically. Virtual Visa card issued. Ready to transact.",
  },
  {
    icon: CreditCard,
    time: "~3 min",
    title: "Fund your wallet",
    desc: "Deposit cash at any partner bank branch, or top up via card. Balance updates in real-time.",
  },
  {
    icon: Send,
    time: "< 10 sec",
    title: "Send & receive money",
    desc: "Transfer to any NexaPay user instantly. Pay merchants, settle bills — zero domestic fees.",
  },
];

const securityItems = [
  { title: "BFT Consensus", desc: "Three validators sign every block. No single point of failure." },
  { title: "Ed25519", desc: "Every transaction cryptographically signed with your private key." },
  { title: "Immutable Ledger", desc: "All transactions permanently recorded. Append-only, verifiable." },
  { title: "Argon2id", desc: "Memory-hard PIN hashing. PCI-aligned credential security." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        {/* Header */}
        <div className="mb-16 md:mb-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">
            How it works
          </p>
          <h2 className="mt-4 max-w-[700px] text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
            Bank in minutes,{" "}
            <span className="text-[#00d4aa]">not days.</span>
          </h2>
          <p className="mt-4 text-[15px] text-white/40 max-w-[500px]">
            Open a full bank account, verify your identity, and send money — entirely from your phone.
          </p>
        </div>

        {/* Steps — Timeline style */}
        <div className="relative">
          {/* Vertical connector line (desktop) */}
          <div className="absolute left-[19px] top-3 bottom-3 hidden w-px bg-gradient-to-b from-[#00d4aa]/30 via-[#00d4aa]/10 to-transparent md:block" />

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="group relative flex gap-5 rounded-2xl border border-white/[0.04] bg-white/[0.01] p-5 transition-all hover:border-[#00d4aa]/15 hover:bg-white/[0.02] md:border-0 md:bg-transparent md:p-4 md:hover:bg-white/[0.02]"
              >
                {/* Step circle */}
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#00d4aa]/20 bg-[#0b0b0b] ring-4 ring-[#0b0b0b]">
                  <step.icon className="h-4 w-4 text-[#00d4aa]" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h3 className="text-[15px] font-semibold text-white">{step.title}</h3>
                    <span className="shrink-0 rounded-full border border-[#00d4aa]/20 bg-[#00d4aa]/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-[#00d4aa]">
                      {step.time}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/40">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total time banner */}
        <div className="mt-10 flex items-center gap-4 rounded-2xl border border-[#00d4aa]/10 bg-gradient-to-r from-[#00d4aa]/[0.04] to-transparent px-6 py-4">
          <Zap className="h-5 w-5 shrink-0 text-[#00d4aa]" />
          <div>
            <p className="text-sm font-semibold text-white">
              Total setup time: under 6 minutes
            </p>
            <p className="text-[12px] text-white/40">
              From phone screen to your first transaction — faster than driving to a bank
            </p>
          </div>
        </div>

        {/* Security */}
        <div className="mt-24 md:mt-32">
          <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">Security</p>
          <h3 className="mt-4 max-w-[500px] text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.2] tracking-tight">
            Bank-grade, by design
          </h3>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {securityItems.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/[0.06] bg-[#0b0b0b] p-6 transition-all hover:border-white/[0.10]"
              >
                <h4 className="text-sm font-semibold text-white">{f.title}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-white/40">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <div className="rounded-3xl border border-[#00d4aa]/10 bg-gradient-to-b from-[#00d4aa]/[0.04] to-transparent px-8 py-16 md:px-16 md:py-20">
            <h3 className="text-2xl font-semibold text-white md:text-3xl">
              Ready in under 6 minutes
            </h3>
            <p className="mx-auto mt-3 max-w-md text-[14px] text-white/40">
              Join thousands banking with NexaPay. Free account, instant card, zero hidden fees.
            </p>
            <a
              href="https://auth.nexapay.space/register"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-8 py-3.5 text-[14px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90 hover:gap-3"
            >
              Open free account <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
