"use client";

import * as React from "react";
import { UserPlus, FileCheck, Building, Banknote, ArrowRightLeft, Shield } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    illustration: "1",
    title: "Create an Account",
    description:
      "Sign up on NexaPay with your phone number, CIN, and basic details. The entire process takes under 2 minutes — no paperwork, no branch visits.",
  },
  {
    icon: FileCheck,
    illustration: "2",
    title: "Complete KYC",
    description:
      "Submit your identity verification documents. Our automated system verifies your CIN against the national registry to comply with Tunisian banking regulations.",
  },
  {
    icon: Building,
    illustration: "3",
    title: "Account Approval",
    description:
      "Once your KYC passes verification, a linked bank account at X Bank is automatically created for you. No separate bank application needed.",
  },
  {
    icon: Banknote,
    illustration: "4",
    title: "Deposit Funds",
    description:
      "Visit your nearest X Bank branch and deposit cash directly into your NexaPay-linked account. Your balance updates in real-time.",
  },
  {
    icon: ArrowRightLeft,
    illustration: "5",
    title: "Start Transacting",
    description:
      "Your balance is reflected on NexaPay immediately. Send, receive, and manage payments — all with zero domestic transfer fees.",
  },
];

const securityItems = [
  {
    title: "BFT Consensus",
    desc: "Three independent validators sign every block. No single point of failure.",
  },
  {
    title: "Ed25519 Signatures",
    desc: "Every transaction is cryptographically signed with your private key.",
  },
  {
    title: "Immutable Ledger",
    desc: "All transactions permanently recorded on-chain. Append-only, verifiable.",
  },
  {
    title: "Argon2id PIN Hashing",
    desc: "Memory-hard key derivation. PCI-aligned security for your credentials.",
  },
];

function StepIllustration({ step }: { step: string }) {
  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a0f14] to-[#111820] border border-white/[0.04]">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
      <div className="relative z-10 flex flex-col items-center gap-1">
        {/* Simple cartoon character */}
        <div className="flex items-end gap-1">
          {/* Head */}
          <div className="relative flex items-center justify-center">
            <div className="h-10 w-10 rounded-full bg-[#1a2940] border-2 border-[#2a4a6a] flex items-center justify-center">
              {step === "1" && (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00d4aa]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              )}
              {step === "2" && (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00d4aa]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              {step === "3" && (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00d4aa]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              )}
              {step === "4" && (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00d4aa]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              )}
              {step === "5" && (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00d4aa]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              )}
            </div>
          </div>
        </div>
        {/* Body */}
        <div className="h-6 w-10 rounded-t-xl bg-[#1a2940] border border-[#2a4a6a] border-b-0" />
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mb-16 md:mb-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">How it works</p>
          <h2 className="mt-4 max-w-[700px] text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
            From sign-up to sending money in 5 simple steps
          </h2>
          <p className="mt-3 text-[15px] text-white/40 max-w-[500px]">
            Everything you need to open a bank account, verify your identity, and start transacting — all from your phone.
          </p>
        </div>

        {/* Steps with illustrations */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <div key={step.title} className="group rounded-2xl border border-white/[0.06] bg-[#0b0b0b] p-5 transition-all hover:border-[#00d4aa]/20 hover:bg-[#0d1116]">
              <StepIllustration step={step.illustration} />
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00d4aa]/60">Step {i + 1}</p>
                <h3 className="mt-2 text-[15px] font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security */}
        <div className="mt-24 md:mt-32">
          <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">Security</p>
          <h3 className="mt-4 max-w-[500px] text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.2] tracking-tight">
            Bank-grade security, by design
          </h3>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {securityItems.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/[0.06] bg-[#141414] p-6">
                <h4 className="text-sm font-semibold text-white">{f.title}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-white/40">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <div className="rounded-3xl border border-[#00d4aa]/10 bg-gradient-to-b from-[#00d4aa]/[0.04] to-transparent px-8 py-16 md:px-16 md:py-20">
            <h3 className="text-2xl font-semibold text-white md:text-3xl">Ready to open your account?</h3>
            <p className="mx-auto mt-3 max-w-md text-[14px] text-white/40">
              Join thousands of Tunisians banking with NexaPay. Free account, instant card, zero hidden fees.
            </p>
            <a
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-8 py-3.5 text-[14px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90"
            >
              Open free account →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
