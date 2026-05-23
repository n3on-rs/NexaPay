"use client";

import { QrCode, Building2, Globe, ArrowRightLeft } from "lucide-react";

const features = [
  {
    icon: ArrowRightLeft,
    title: "Send money instantly",
    desc: "Zero-fee transfers to any NexaPay user. Every transaction cryptographically signed and verified by the network.",
  },
  {
    icon: QrCode,
    title: "Pay merchants",
    desc: "Scan a QR code or open a payment link. Pay with your wallet or any bank card. Settled in seconds.",
  },
  {
    icon: Building2,
    title: "Deposit cash",
    desc: "Visit any NexaPay agent location. Hand them cash — your balance updates in real time.",
  },
  {
    icon: Globe,
    title: "Receive payments",
    desc: "Share your IBAN or NexaPay address. Anyone can send you money — in Tunisia or abroad.",
  },
];

export function UserFlow() {
  return (
    <section className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa]">For everyone</p>
        <h2 className="mt-4 max-w-[600px] text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
          Your phone is your bank
        </h2>
        <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/40">
          Open an account, verify your identity, and start banking — all from your phone in minutes.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-white/[0.06] bg-[#141414] p-6 transition-all hover:border-white/[0.12]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                <f.icon className="h-5 w-5 text-white/60" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
