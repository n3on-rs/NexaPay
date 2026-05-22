"use client";

import {
  User, Smartphone, ScanFace, CreditCard, ArrowRightLeft,
  Store, Shield, Zap, Building, MapPin, Banknote, Phone,
  Clock, CheckCircle, ArrowRight, QrCode, Globe, Users,
} from "lucide-react";

const userSteps = [
  {
    icon: Smartphone,
    title: "Download & Register",
    time: "~30 seconds",
    description:
      "Download NexaPay from the App Store. Enter your phone number, full name, date of birth, and CIN number. No branch visit — everything from your phone.",
    color: "border-blue-500/20 bg-blue-500/5",
    iconBg: "bg-blue-500/10 text-blue-400",
  },
  {
    icon: ScanFace,
    title: "Verify Identity (AI-Powered)",
    time: "~60 seconds",
    description:
      "Take a photo of your CIN (front and back) and scan your face. Our AI matches your selfie to your ID photo, verifies document authenticity, and confirms your identity — zero human involvement.",
    color: "border-purple-500/20 bg-purple-500/5",
    iconBg: "bg-purple-500/10 text-purple-400",
  },
  {
    icon: Shield,
    title: "Create Your Secure Identity",
    time: "~15 seconds",
    description:
      "Choose a 6-digit PIN. Behind the scenes, your Ed25519 cryptographic keypair is generated. Your private key is encrypted with your PIN. Your public key goes on the blockchain — you now have a verifiable digital identity.",
    color: "border-amber-500/20 bg-amber-500/5",
    iconBg: "bg-amber-500/10 text-amber-400",
  },
  {
    icon: CreditCard,
    title: "Instant Bank Account",
    time: "~5 seconds",
    description:
      "Your account is live. You get a VISA card, a Tunisian IBAN, and a RIB. You can receive money, make transfers, and pay at any NexaPay merchant immediately. All verified by 3 independent validator nodes.",
    color: "border-[#00FF88]/20 bg-[#00FF88]/5",
    iconBg: "bg-[#00FF88]/10 text-[#00FF88]",
  },
];

const dailyActions = [
  {
    icon: ArrowRightLeft,
    title: "Send Money",
    desc: "Transfer to any NexaPay user instantly. Zero fees. Every transfer cryptographically signed with your key.",
    color: "border-cyan-500/20 bg-cyan-500/5",
  },
  {
    icon: QrCode,
    title: "Pay Merchants",
    desc: "Scan a QR code or open a payment link. Pay with your NexaPay wallet or any bank card. Confirmed in seconds.",
    color: "border-emerald-500/20 bg-emerald-500/5",
  },
  {
    icon: Building,
    title: "Deposit Cash",
    desc: "Visit any NexaPay agent location. Hand them cash — they credit your account instantly. Your balance updates in real-time.",
    color: "border-pink-500/20 bg-pink-500/5",
  },
  {
    icon: Globe,
    title: "Receive Payments",
    desc: "Share your IBAN or NexaPay address. Anyone can send you money. Funds appear in your account immediately after validation.",
    color: "border-indigo-500/20 bg-indigo-500/5",
  },
];

export function UserFlow() {
  return (
    <section className="border-t border-white/[0.06] bg-[#080808] py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-xs font-medium text-blue-400">
            <User className="h-3 w-3" />
            For Everyone
          </div>
          <h2 className="font-display text-glitch-display mt-6 text-[clamp(2.5rem,8vw,5rem)] leading-[0.95]">
            <span className="text-white">Your phone</span>
            <br />
            <span className="text-[#00FF88]">is your bank.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-white/50">
            Open an account, verify your identity, and start banking — all from your phone in under 2 minutes.
            No paperwork. No waiting. No humans.
          </p>
        </div>

        {/* Step-by-step registration */}
        <div className="mt-16 md:mt-24">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/30">
              Account Opening Journey
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {userSteps.map((step, i) => (
              <div
                key={step.title}
                className={`group relative rounded-2xl border ${step.color} p-6 transition-all hover:border-opacity-100`}
              >
                {/* Step number */}
                <span className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#0a0a0a] border border-white/[0.08] text-[11px] font-bold text-white/40">
                  {i + 1}
                </span>

                {/* Icon + Time */}
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${step.iconBg}`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/30">
                    <Clock className="h-3 w-3" />
                    {step.time}
                  </span>
                </div>

                <h3 className="mt-4 text-sm font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/40">
                  {step.description}
                </p>

                {/* Connector arrow */}
                {i < userSteps.length - 1 && (
                  <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                    <ArrowRight className="h-5 w-5 text-white/10" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Daily banking */}
        <div className="mt-20 md:mt-28">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/30">
              Everyday Banking
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dailyActions.map((action) => (
              <div
                key={action.title}
                className={`rounded-2xl border ${action.color} p-6 transition-all hover:border-opacity-100`}
              >
                <action.icon className="h-6 w-6 text-white/60" />
                <h3 className="mt-3 text-sm font-bold text-white">{action.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                  {action.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Deposit cash flow */}
        <div className="mt-16 rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-8 md:p-12">
          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-center">
            {/* User */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
                <User className="h-7 w-7 text-amber-400" />
              </div>
              <p className="mt-2 text-sm font-medium text-white">You</p>
              <p className="text-[11px] text-white/30">Need to deposit cash</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <ArrowRight className="hidden h-5 w-5 text-white/20 md:block" />
              <span className="rounded-full bg-white/[0.03] px-3 py-1 text-[10px] text-white/30">
                Visit agent
              </span>
            </div>

            {/* Agent */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
                <Store className="h-7 w-7 text-green-400" />
              </div>
              <p className="mt-2 text-sm font-medium text-white">NexaPay Agent</p>
              <p className="text-[11px] text-white/30">Verifies & accepts cash</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <ArrowRight className="hidden h-5 w-5 text-white/20 md:block" />
              <span className="rounded-full bg-white/[0.03] px-3 py-1 text-[10px] text-white/30">
                Credits account
              </span>
            </div>

            {/* Blockchain */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00FF88]/10">
                <Shield className="h-7 w-7 text-[#00FF88]" />
              </div>
              <p className="mt-2 text-sm font-medium text-white">3 Validators</p>
              <p className="text-[11px] text-white/30">Verify & commit</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <ArrowRight className="hidden h-5 w-5 text-white/20 md:block" />
              <span className="rounded-full bg-[#00FF88]/10 px-3 py-1 text-[10px] text-[#00FF88]">
                Done
              </span>
            </div>

            {/* Money received */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
                <Banknote className="h-7 w-7 text-blue-400" />
              </div>
              <p className="mt-2 text-sm font-medium text-white">Balance Updated</p>
              <p className="text-[11px] text-white/30">Funds available instantly</p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#111] px-4 py-2 text-xs text-white/50">
              <MapPin className="h-3 w-3" />
              Agent locations across Tunisia — find one near you in the app
            </div>
          </div>
        </div>

        {/* Transaction validation */}
        <div className="mt-16 rounded-3xl border border-[#00FF88]/10 bg-gradient-to-b from-[#00FF88]/3 to-transparent p-8 md:p-12">
          <div className="mx-auto max-w-2xl text-center">
            <Shield className="mx-auto h-8 w-8 text-[#00FF88]" />
            <h3 className="mt-4 text-xl font-bold text-white">
              Every transaction is verified by 3 independent validators
            </h3>
            <p className="mt-3 text-sm text-white/40">
              No single server can approve a transaction alone. Three validator nodes must
              independently verify and sign every block before it's committed to the blockchain.
              This is Byzantine Fault Tolerant consensus — the same security model used by
              enterprise blockchain networks.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00FF88]/10 text-sm font-bold text-[#00FF88]">
                    {n}
                  </div>
                  {n < 3 && <span className="text-white/20">+</span>}
                </div>
              ))}
              <span className="ml-2 text-sm text-white/40">= Transaction Confirmed</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
