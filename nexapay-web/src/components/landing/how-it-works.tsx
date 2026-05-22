"use client";

import {
  ScanFace, FileCheck, Key, PenTool, CreditCard, ArrowRightLeft,
  Store, Shield, Zap, UserCheck, Smartphone, Building2, Activity,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Smartphone,
    title: "Open the App",
    subtitle: "No branch visit needed",
    description:
      "Download NexaPay and start your registration. No paperwork, no waiting in line — everything happens on your phone in under 2 minutes.",
    color: "from-blue-500/20 to-blue-600/10",
    iconColor: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    number: "02",
    icon: ScanFace,
    title: "Verify Your Identity",
    subtitle: "AI-powered KYC",
    description:
      "Take a photo of your CIN (front and back) and scan your face. Our AI matches your face to your ID photo and verifies your identity instantly — zero human involvement.",
    color: "from-purple-500/20 to-purple-600/10",
    iconColor: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  {
    number: "03",
    icon: Key,
    title: "Set Your PIN",
    subtitle: "Your cryptographic identity",
    description:
      "Choose a 6-digit PIN. Behind the scenes, an Ed25519 keypair is generated — your private key is encrypted with your PIN using Argon2id + AES-256-GCM. Your public key goes on-chain for non-repudiation.",
    color: "from-amber-500/20 to-amber-600/10",
    iconColor: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    number: "04",
    icon: PenTool,
    title: "Sign Your Contract",
    subtitle: "Legally binding on-chain",
    description:
      "Review and digitally sign your account opening contract. Your signature is hashed and anchored to the NexaPay blockchain — creating an immutable, verifiable record of your agreement.",
    color: "from-emerald-500/20 to-emerald-600/10",
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    number: "05",
    icon: CreditCard,
    title: "Bank Account Created",
    subtitle: "Card + IBAN + RIB instantly",
    description:
      "Your account is live — you get a VISA card (virtual + physical), a Tunisian IBAN, and a RIB. You can receive money, send transfers, and pay merchants immediately.",
    color: "from-[#00FF88]/20 to-[#00FF88]/10",
    iconColor: "text-[#00FF88]",
    bgColor: "bg-[#00FF88]/10",
    borderColor: "border-[#00FF88]/20",
  },
  {
    number: "06",
    icon: ArrowRightLeft,
    title: "Send & Receive Money",
    subtitle: "Instant, zero-fee transfers",
    description:
      "Send money to any NexaPay user instantly with zero fees. Every transfer is cryptographically signed with your key — no one can deny or forge a transaction. Blockchain-verified finality.",
    color: "from-cyan-500/20 to-cyan-600/10",
    iconColor: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
];

const securityFeatures = [
  {
    icon: Shield,
    title: "3-Node BFT Consensus",
    desc: "Three independent validators must sign every block. No single point of failure. Byzantine fault tolerant.",
  },
  {
    icon: Key,
    title: "Ed25519 Signatures",
    desc: "Every transaction is cryptographically signed with your private key. Non-repudiation guaranteed.",
  },
  {
    icon: Activity,
    title: "Immutable Audit Trail",
    desc: "All transactions are permanently recorded on-chain. Append-only, hash-chained, independently verifiable.",
  },
  {
    icon: Building2,
    title: "Bank-Grade PIN Storage",
    desc: "PINs hashed with Argon2id (64 MiB memory-hard). PCI-aligned. 2 billion times harder to crack than SHA-256.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works-detail" className="border-t border-white/[0.06] bg-[#080808] py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00FF88]/20 bg-[#00FF88]/5 px-4 py-1.5 text-xs font-medium text-[#00FF88]">
            <Zap className="h-3 w-3" />
            Instant Banking
          </div>
          <h2 className="font-display text-glitch-display mt-6 text-[clamp(2.5rem,8vw,5rem)] leading-[0.95]">
            <span className="text-white">Your bank account</span>
            <br />
            <span className="text-[#00FF88]">in 2 minutes.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-white/50">
            From identity verification to a fully functional bank account — no humans, no branches, no paperwork.
            Powered by AI and secured by blockchain.
          </p>
        </div>

        {/* Steps — alternating layout */}
        <div className="mt-20 space-y-6 md:mt-28">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`group relative overflow-hidden rounded-3xl border ${step.borderColor} bg-gradient-to-br ${step.color} bg-[#0a0a0a]/80 p-6 backdrop-blur-sm transition-all hover:border-opacity-100 md:p-10`}
            >
              <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-12">
                {/* Number + Icon */}
                <div className="flex items-center gap-6 md:w-[280px] md:shrink-0">
                  <span className="font-display text-glitch-display text-[3.5rem] leading-none text-white/8 md:text-[5rem]">
                    {step.number}
                  </span>
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${step.bgColor} md:h-16 md:w-16`}>
                    <step.icon className={`h-7 w-7 ${step.iconColor} md:h-8 md:w-8`} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-white md:text-2xl">{step.title}</h3>
                    <span className={`rounded-full ${step.bgColor} px-2.5 py-0.5 text-[10px] font-medium ${step.iconColor}`}>
                      {step.subtitle}
                    </span>
                  </div>
                  <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/45 md:text-[15px]">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connecting line */}
              {i < steps.length - 1 && (
                <div className="absolute bottom-0 left-[3.25rem] hidden h-[calc(100%+1.5rem)] w-px bg-gradient-to-b from-white/[0.06] via-white/[0.03] to-transparent md:block" />
              )}
            </div>
          ))}
        </div>

        {/* Architecture diagram */}
        <div className="mt-20 rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-8 md:mt-28 md:p-12">
          <h3 className="text-center text-2xl font-bold text-white md:text-3xl">
            Under the Hood
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/40">
            Every transaction flows through three independent validators before being committed to the blockchain.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 md:flex-row md:justify-center">
            {/* User */}
            <div className="flex h-24 w-48 flex-col items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/5">
              <UserCheck className="h-6 w-6 text-blue-400" />
              <span className="mt-2 text-sm font-medium text-white">You</span>
              <span className="text-[10px] text-white/35">Ed25519 Keypair</span>
            </div>

            <ArrowRightLeft className="h-6 w-6 rotate-90 text-white/20 md:rotate-0" />

            {/* Validators */}
            <div className="flex gap-3">
              {["Validator 1", "Validator 2", "Validator 3"].map((v, i) => (
                <div
                  key={v}
                  className="flex h-24 w-32 flex-col items-center justify-center rounded-2xl border border-[#00FF88]/20 bg-[#00FF88]/5"
                >
                  <Shield className="h-5 w-5 text-[#00FF88]" />
                  <span className="mt-1.5 text-[11px] font-medium text-white">{v}</span>
                  <span className="text-[9px] text-white/30">
                    {i === 0 ? "Proposes" : i === 1 ? "Validates" : "Validates"}
                  </span>
                </div>
              ))}
            </div>

            <ArrowRightLeft className="h-6 w-6 rotate-90 text-white/20 md:rotate-0" />

            {/* Blockchain */}
            <div className="flex h-24 w-48 flex-col items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/5">
              <Activity className="h-6 w-6 text-purple-400" />
              <span className="mt-2 text-sm font-medium text-white">Blockchain</span>
              <span className="text-[10px] text-white/35">3/3 Signatures</span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#111] px-4 py-2 text-xs text-white/50">
              <span className="flex h-2 w-2 rounded-full bg-[#00FF88]" />
              Quorum: 3 of 3 signatures required — Byzantine Fault Tolerant
            </div>
          </div>
        </div>

        {/* Security features */}
        <div className="mt-20 md:mt-28">
          <h3 className="text-center text-2xl font-bold text-white md:text-3xl">
            Bank-Grade Security
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/40">
            Every layer is designed to meet banking security standards.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {securityFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/[0.06] bg-[#111] p-6 transition-all hover:border-white/[0.12]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00FF88]/10">
                  <f.icon className="h-5 w-5 text-[#00FF88]" />
                </div>
                <h4 className="mt-4 text-sm font-semibold text-white">{f.title}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-white/40">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center md:mt-28">
          <div className="inline-flex flex-col items-center gap-6 rounded-3xl border border-[#00FF88]/20 bg-gradient-to-b from-[#00FF88]/5 to-transparent px-10 py-12 md:px-20 md:py-16">
            <h3 className="text-2xl font-bold text-white md:text-3xl">
              Ready to open your account?
            </h3>
            <p className="max-w-md text-sm text-white/45">
              Join thousands of Tunisians who bank instantly with NexaPay. No branches. No waiting. Just your phone.
            </p>
            <a
              href="/register"
              className="inline-flex items-center gap-3 rounded-full bg-[#00FF88] px-8 py-4 text-sm font-bold text-black transition-all hover:bg-[#00FF88]/90 hover:scale-105"
            >
              <Zap className="h-4 w-4" />
              Open Account in 2 Minutes
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
