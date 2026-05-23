"use client";

import { Smartphone, Shield, CreditCard, ArrowRightLeft } from "lucide-react";

const steps = [
  {
    icon: Smartphone,
    title: "Create your account",
    description:
      "Enter your details and verify your identity in under 2 minutes. No paperwork, no branch visits — everything happens on your phone.",
  },
  {
    icon: Shield,
    title: "Secure it with a PIN",
    description:
      "Set a 6-digit PIN that encrypts your private key. Your identity is cryptographically anchored on the blockchain for non-repudiation.",
  },
  {
    icon: CreditCard,
    title: "Get your card and IBAN",
    description:
      "Your account is live instantly. Virtual VISA card, Tunisian IBAN, and RIB — ready to send and receive money immediately.",
  },
  {
    icon: ArrowRightLeft,
    title: "Send and receive",
    description:
      "Instant, zero-fee transfers to any NexaPay user. Every transaction is cryptographically signed and verified by the network.",
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

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mb-16 md:mb-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">How it works</p>
          <h2 className="mt-4 max-w-[600px] text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
            Your bank account in under 2 minutes
          </h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="bg-[#0b0b0b] p-8 md:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00d4aa]/10">
                <step.icon className="h-5 w-5 text-[#00d4aa]" />
              </div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/30">Step {i + 1}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/40">{step.description}</p>
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
