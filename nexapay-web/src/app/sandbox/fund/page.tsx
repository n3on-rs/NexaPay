"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { getSessionToken, getSessionAddress, getSessionFullName } from "@/lib/auth-utils";
import { getJson, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CreditCard,
  Building2,
  ScanLine,
  Eye,
  EyeOff,
  Check,
  Loader2,
  Home,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Clock,
  User,
  Copy,
  Share2,
  ChevronRight,
  Landmark,
  QrCode,
} from "lucide-react";
import Link from "next/link";

// ─── Utilities ───
function formatMillimes(value: number): string {
  const tnd = (value / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${tnd} TND`;
}

function luhnCheck(card: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = card.length - 1; i >= 0; i--) {
    let n = parseInt(card.substring(i, i + 1), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000];

// ─── Card Chip SVG ───
function CardChip() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x="0" y="0" width="36" height="28" rx="4" fill="url(#chipGradF)" />
      <defs>
        <linearGradient id="chipGradF" x1="0" y1="0" x2="36" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C8A84B" />
          <stop offset="1" stopColor="#E8D5A3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── QR Code with Logo Overlay ───
function QRCodeDisplay({ address, fullName }: { address: string; fullName: string }) {
  const [copied, setCopied] = React.useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(address)}&color=00FF88&bgcolor=080808`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleShare = () => {
    const text = `Send me money on NexaPay: ${address}`;
    if (navigator.share) {
      navigator.share({ title: "NexaPay", text });
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* QR Container */}
      <div className="relative flex h-[280px] w-[280px] items-center justify-center rounded-3xl border border-[#00d4aa]/20 bg-[#111] p-6 shadow-[0_0_60px_rgba(0,255,136,0.08)]">
        {/* Green glow behind */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-40"
          style={{ background: "radial-gradient(circle at center, rgba(0,255,136,0.15) 0%, transparent 70%)" }}
        />
        {/* QR image */}
        <img
          src={qrUrl}
          alt="NexaPay QR Code"
          className="relative z-10 h-full w-full rounded-xl"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Logo overlay in center */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#00d4aa]/30 bg-[#0b0b0b] shadow-[0_0_30px_rgba(0,255,136,0.3)]">
            <img src="/logo.png" alt="N" className="h-8 w-8 object-contain" />
          </div>
        </div>
      </div>

      {/* User info */}
      <p className="mt-5 text-center text-lg font-semibold text-white">{fullName || "NexaPay User"}</p>
      <p className="mt-1 text-center text-[13px] text-[#888]">Scan to send money on NexaPay</p>

      {/* Address row */}
      <div className="mt-5 flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5">
        <code className="text-[13px] text-[#888]">
          {address.slice(0, 8)}...{address.slice(-6)}
        </code>
        <button onClick={handleCopy} className="text-[#888] hover:text-[#00d4aa] transition-colors">
          {copied ? <Check className="h-4 w-4 text-[#00d4aa]" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <button
        onClick={handleShare}
        className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-[14px] font-medium text-white transition-all hover:bg-white/[0.06]"
      >
        <Share2 className="h-4 w-4" /> Share QR
      </button>
    </div>
  );
}

// ─── Main ───
type FundView = "select" | "card" | "bank" | "qr" | "card-success";

function FundInner() {
  const [view, setView] = React.useState<FundView>("select");
  const [error, setError] = React.useState("");

  // Card payment state
  const [cardLoading, setCardLoading] = React.useState(false);
  const [rawAmount, setRawAmount] = React.useState(0);
  const [balance, setBalance] = React.useState(0);
  const [cardNumber, setCardNumber] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [cvv, setCvv] = React.useState("");
  const [cardholder, setCardholder] = React.useState("");
  const [showCvv, setShowCvv] = React.useState(false);
  const [cardValid, setCardValid] = React.useState<boolean | null>(null);

  const address = getSessionAddress();
  const token = getSessionToken();
  const fullName = getSessionFullName();

  React.useEffect(() => {
    document.title = "Add Money — NexaPay";
    const loadBalance = async () => {
      if (!token || !address) return;
      try {
        const res = await getJson(`/accounts/${address}`, { "X-Account-Token": token });
        if (res.ok && "balance" in res.data) {
          setBalance(Number(res.data.balance) || 0);
        }
      } catch {
        // ignore
      }
    };
    loadBalance();
  }, [token, address]);

  const [feeAmount, setFeeAmount] = React.useState(0);

  React.useEffect(() => {
    if (rawAmount <= 0) { setFeeAmount(0); return; }
    getJson(`/gateway/v1/fees/preview?amount=${rawAmount}&fee_type=fund`)
      .then((res) => {
        if (res.ok && res.data?.fee_amount != null) setFeeAmount(Number(res.data.fee_amount));
      })
      .catch(() => {});
  }, [rawAmount]);

  const fee = feeAmount;
  const total = rawAmount + fee;

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleCardBlur = () => {
    const digits = cardNumber.replace(/\s/g, "");
    if (digits.length === 16) setCardValid(luhnCheck(digits));
    else if (digits.length > 0) setCardValid(false);
    else setCardValid(null);
  };

  const isFormValid =
    rawAmount > 0 &&
    cardNumber.replace(/\s/g, "").length === 16 &&
    cardValid === true &&
    expiry.length >= 4 &&
    cvv.length === 3 &&
    cardholder.trim().length > 0;

  const submitCard = async () => {
    if (!isFormValid || !token || !address) return;
    setCardLoading(true);
    setError("");
    try {
      const [month, year] = expiry.split("/");
      const res = await postJson(
        `/accounts/${address}/fund`,
        {
          amount: rawAmount,
          card_number: cardNumber.replace(/\s/g, ""),
          card_expiry_month: parseInt(month, 10),
          card_expiry_year: parseInt(year, 10),
          card_holder_name: cardholder.toUpperCase(),
          cvv,
        },
        { "X-Account-Token": token }
      );
      if (res.ok) {
        let polls = 0;
        const poll = setInterval(async () => {
          polls++;
          const acc = await getJson(`/accounts/${address}`, { "X-Account-Token": token });
          if (acc.ok && "balance" in acc.data) {
            const newBal = Number(acc.data.balance) || 0;
            if (newBal > balance || polls >= 10) {
              setBalance(newBal);
              clearInterval(poll);
              setView("card-success");
            }
          }
          if (polls >= 10) { clearInterval(poll); setView("card-success"); }
        }, 3000);
      } else {
        if (res.status === 429) {
          setError("Too many attempts. Please wait a moment before trying again.");
        } else {
          const msg = String((res.data as any).error || "");
          if (msg.includes("declined") || msg.includes("card")) setError("Card declined. Check your card details.");
          else if (msg.includes("balance") || msg.includes("Insufficient")) setError("Insufficient balance on source card.");
          else setError(msg || "Payment failed. Please try again.");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCardLoading(false);
    }
  };

  const resetCard = () => {
    setView("card");
    setRawAmount(0);
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setCardholder("");
    setError("");
    setCardValid(null);
  };

  // ─── Selection View ───
  if (view === "select") {
    return (
      <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
        <main className="mx-auto max-w-lg px-4 pt-10 pb-24 md:pb-8">
          <h1 className="font-space-grotesk text-[32px] font-extrabold text-white">Add Money</h1>
          <p className="mt-2 text-[15px] text-[#888]">Choose how you want to fund your wallet</p>

          <div className="mt-10 space-y-4">
            {/* Card Payment */}
            <button
              onClick={() => setView("card")}
              className="group flex w-full items-center gap-5 rounded-2xl border border-white/[0.08] bg-[#111] p-5 text-left transition-all hover:border-[#00d4aa]/30 hover:bg-[#00d4aa]/[0.03]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#00d4aa]/10 text-[#00d4aa] transition-colors group-hover:bg-[#00d4aa]/15">
                <CreditCard className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-bold text-white">Card Payment</p>
                <p className="mt-0.5 text-[13px] text-[#888]">Pay with debit or credit card</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#555] transition-colors group-hover:text-[#00d4aa]" />
            </button>

            {/* Bank Transfer */}
            <button
              onClick={() => setView("bank")}
              className="group flex w-full items-center gap-5 rounded-2xl border border-white/[0.08] bg-[#111] p-5 text-left transition-all hover:border-[#00d4aa]/30 hover:bg-[#00d4aa]/[0.03]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-white/70 transition-colors group-hover:bg-white/[0.08]">
                <Landmark className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-bold text-white">Bank Transfer</p>
                <p className="mt-0.5 text-[13px] text-[#888]">Transfer from your bank account</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#555] transition-colors group-hover:text-[#00d4aa]" />
            </button>

            {/* QR Code */}
            <button
              onClick={() => setView("qr")}
              className="group flex w-full items-center gap-5 rounded-2xl border border-white/[0.08] bg-[#111] p-5 text-left transition-all hover:border-[#00d4aa]/30 hover:bg-[#00d4aa]/[0.03]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-white/70 transition-colors group-hover:bg-white/[0.08]">
                <QrCode className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-bold text-white">Receive via QR</p>
                <p className="mt-0.5 text-[13px] text-[#888]">Share your QR code to receive funds</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#555] transition-colors group-hover:text-[#00d4aa]" />
            </button>
          </div>

          {/* Info card at bottom */}
          <div className="mt-10 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5">
            <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">Current Balance</p>
            <p className="mt-2 font-space-grotesk text-[28px] font-extrabold text-white">{formatMillimes(balance || 0)}</p>
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
          <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
          <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
          <div className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></div>
          <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
          <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
        </nav>
      </div>
    );
  }

  // ─── QR Code View ───
  if (view === "qr") {
    return (
      <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
        <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("select")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Receive via QR</h1>
          </div>

          <div className="mt-10 flex flex-col items-center">
            <QRCodeDisplay address={address} fullName={fullName} />

            {/* Tips */}
            <div className="mt-10 w-full rounded-2xl border border-white/[0.04] bg-[#111] p-5">
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#555]">How it works</p>
              <ol className="mt-3 space-y-3 text-[14px] text-[#888]">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00d4aa]/10 text-[10px] font-bold text-[#00d4aa]">1</span>
                  Share this QR code with the sender
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00d4aa]/10 text-[10px] font-bold text-[#00d4aa]">2</span>
                  The sender scans it in their NexaPay app
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00d4aa]/10 text-[10px] font-bold text-[#00d4aa]">3</span>
                  Money arrives in your wallet instantly
                </li>
              </ol>
            </div>
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
          <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
          <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
          <div className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></div>
          <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
          <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
        </nav>
      </div>
    );
  }

  // ─── Bank Transfer View ───
  if (view === "bank") {
    return (
      <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
        <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("select")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Bank Transfer</h1>
          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.06] bg-[#111] p-6">
            <Landmark className="h-8 w-8 text-[#00d4aa]" />
            <h2 className="mt-4 text-lg font-bold text-white">Wire Transfer Instructions</h2>
            <p className="mt-2 text-[14px] text-[#888]">Transfer from any Tunisian bank to your NexaPay account using these details.</p>

            <div className="mt-6 space-y-4">
              {[
                { label: "Account Name", value: fullName || "NexaPay User" },
                { label: "RIB", value: "12345678901234567890" },
                { label: "IBAN", value: "TN59 1234 5678 9012 3456 7890" },
                { label: "BIC/SWIFT", value: "NEXATNTX" },
                { label: "Bank", value: "NexaPay Digital Bank" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-white/[0.04] pb-3 last:border-0 last:pb-0">
                  <span className="text-[13px] text-[#888]">{row.label}</span>
                  <span className="text-[14px] font-medium text-white">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-5 py-4">
            <p className="text-[13px] text-amber-400">
              Transfers typically arrive within 1-2 business days. Use your registered name exactly as shown above.
            </p>
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
          <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
          <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
          <div className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></div>
          <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
          <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
        </nav>
      </div>
    );
  }

  // ─── Card Success View ───
  if (view === "card-success") {
    return (
      <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
        <main className="mx-auto max-w-lg px-4 pt-12 pb-24 md:pb-8">
          <div className="flex flex-col items-center animate-in zoom-in-95 fade-in duration-500">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00d4aa] shadow-[0_0_50px_#00d4aa]">
              <Check className="h-10 w-10 text-[#0b0b0b]" />
            </div>
            <h2 className="mt-6 font-space-grotesk text-[28px] font-extrabold text-white">Wallet Funded!</h2>
            <p className="mt-2 text-[24px] font-semibold text-[#00d4aa]">+{formatMillimes(rawAmount)}</p>
            <p className="mt-1 text-[14px] text-[#888]">New balance: {formatMillimes(balance)}</p>
            <div className="mt-8 flex w-full gap-3">
              <Link href="/dashboard" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#00d4aa] text-[#0b0b0b] font-extrabold transition-all hover:bg-[#00d4aa]/90">
                Back to Dashboard
              </Link>
              <button
                onClick={resetCard}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-white font-bold transition-all hover:bg-white/[0.06]"
              >
                <RotateCcw className="h-4 w-4" /> Add More
              </button>
            </div>
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
          <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
          <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
          <div className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></div>
          <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
          <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
        </nav>
      </div>
    );
  }

  // ─── Card Payment View (default) ───
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("select")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Card Payment</h1>
            <p className="text-[13px] text-[#888]">Pay with debit or credit card</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ─── Amount Section ─── */}
        <section className="mt-10">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#888]">Amount to add</p>
          <div className="mt-4 flex items-baseline justify-center gap-2">
            <span className="font-space-grotesk text-[56px] font-extrabold text-white leading-none">
              {rawAmount > 0 ? formatMillimes(rawAmount).replace(" TND", "") : "0.000"}
            </span>
            <span className="text-2xl text-[#888]">TND</span>
          </div>

          {/* Quick amount pills */}
          <div className="mt-6 flex gap-3 justify-center">
            {QUICK_AMOUNTS.map((amt) => {
              const active = rawAmount === amt;
              return (
                <button
                  key={amt}
                  onClick={() => setRawAmount(amt)}
                  className={cn(
                    "shrink-0 rounded-full border px-5 py-2.5 text-[14px] font-medium transition-all",
                    active
                      ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
                      : "border-white/10 bg-[#161616] text-white/70 hover:border-white/20"
                  )}
                >
                  +{formatMillimes(amt)}
                </button>
              );
            })}
          </div>

          {/* Fee preview */}
          {rawAmount > 0 && (
            <div className="mt-5 space-y-1 text-center">
              <p className="text-[14px] text-[#888]">Fee: {formatMillimes(fee)}</p>
              <p className="text-[12px] text-[#555]">You&apos;ll be charged: {formatMillimes(total)}</p>
            </div>
          )}
        </section>

        {/* ─── Card Details Section ─── */}
        <section className="mt-10">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[#888]">Card Details</p>

          {/* Live card preview — larger */}
          <div className="mt-6 mx-auto w-full max-w-[320px]">
            <div
              className="relative aspect-[1.586] w-full overflow-hidden rounded-2xl border border-white/[0.08] p-6 shadow-[0_16px_50px_rgba(0,255,136,0.1)]"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)" }}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <img src="/logo.png" alt="NexaPay" className="h-6 object-contain" />
                  <CardChip />
                </div>
                <p className="font-mono text-[16px] tracking-[0.15em] text-white">
                  {cardNumber.replace(/\s/g, "").length >= 16
                    ? "•••• •••• •••• " + cardNumber.replace(/\s/g, "").slice(-4)
                    : cardNumber || "•••• •••• •••• ••••"}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#888]">
                    {(cardholder || fullName || "NAME").toUpperCase()}
                  </p>
                  <p className="text-[10px] text-[#888]">{expiry || "MM/YY"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card number */}
          <div className="relative mt-6">
            <CreditCard className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#888]" />
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => {
                setCardNumber(formatCard(e.target.value));
                if (cardValid !== null) setCardValid(null);
              }}
              onBlur={handleCardBlur}
              placeholder="1234 5678 9012 3456"
              className={cn(
                "w-full h-[60px] rounded-full bg-white/5 border outline-none pl-14 pr-14 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00d4aa] focus:ring-[3px] focus:ring-[#00d4aa]/10 transition-all",
                cardValid === true ? "border-[#00d4aa]/40" : cardValid === false ? "border-red-500/40" : "border-white/10"
              )}
            />
            {cardValid === true && <Check className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#00d4aa]" />}
            {cardValid === false && <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-red-400">✕</span>}
          </div>
          {cardValid === false && <p className="mt-2 text-sm text-red-400">Invalid card number</p>}

          {/* Expiry + CVV */}
          <div className="mt-4 flex gap-4">
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              placeholder="MM / YY"
              className="h-[60px] w-1/2 rounded-full bg-white/5 border border-white/10 outline-none px-6 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00d4aa] focus:ring-[3px] focus:ring-[#00d4aa]/10 transition-all"
            />
            <div className="relative w-1/2">
              <input
                type={showCvv ? "text" : "password"}
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="CVV"
                className="h-[60px] w-full rounded-full bg-white/5 border border-white/10 outline-none px-6 pr-14 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00d4aa] focus:ring-[3px] focus:ring-[#00d4aa]/10 transition-all"
              />
              <button
                onClick={() => setShowCvv((s) => !s)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-[#888]"
              >
                {showCvv ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Cardholder */}
          <input
            type="text"
            value={cardholder}
            onChange={(e) => setCardholder(e.target.value)}
            placeholder="Name on card"
            className="mt-4 h-[60px] w-full rounded-full bg-white/5 border border-white/10 outline-none px-6 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00d4aa] focus:ring-[3px] focus:ring-[#00d4aa]/10 transition-all uppercase"
          />
        </section>

        {/* Submit */}
        <button
          onClick={submitCard}
          disabled={!isFormValid || cardLoading}
          className="mt-10 flex h-[60px] w-full items-center justify-center gap-2 rounded-full bg-[#00d4aa] text-[#0b0b0b] font-extrabold text-lg transition-all hover:bg-[#00d4aa]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
        >
          {cardLoading ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Processing payment...</>
          ) : (
            <>Add {formatMillimes(rawAmount)} to Wallet</>
          )}
        </button>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <div className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></div>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>
    </div>
  );
}

export default function FundPage() {
  return (
    <ProtectedRoute>
      <FundInner />
    </ProtectedRoute>
  );
}

