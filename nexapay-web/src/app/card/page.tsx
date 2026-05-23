"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { getSessionToken, getSessionAddress, getSessionFullName, getSessionPhone } from "@/lib/auth-utils";
import { getJson, postJson, freezeCard, reportLostCard } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  Lock,
  Snowflake,
  AlertTriangle,
  X,
  Home,
  ArrowUpRight,
  Plus,
  Clock,
  User,
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function maskCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4 || "----"}`;
}

// ─── Card Chip ───
function CardChip() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x="0" y="0" width="36" height="28" rx="4" fill="url(#chipGradC)" />
      <defs>
        <linearGradient id="chipGradC" x1="0" y1="0" x2="36" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C8A84B" />
          <stop offset="1" stopColor="#E8D5A3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Contactless ───
function ContactlessIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6c1.5 2 1.5 6 0 8" />
      <path d="M7 4c2.5 3 2.5 9 0 12" />
      <path d="M11 2c3.5 4 3.5 12 0 16" />
      <path d="M15 5c2 2.5 2 7.5 0 10" />
    </svg>
  );
}

// ─── Main ───
function CardInner() {
  const [loading, setLoading] = React.useState(true);
  const [account, setAccount] = React.useState<any>(null);
  const [flipped, setFlipped] = React.useState(false);
  const [showPinModal, setShowPinModal] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [pinLoading, setPinLoading] = React.useState(false);
  const [revealed, setRevealed] = React.useState<"cvv" | "number" | null>(null);
  const [revealTarget, setRevealTarget] = React.useState<"cvv" | "number" | null>(null);
  const [countdown, setCountdown] = React.useState(0);
  const [copiedKey, setCopiedKey] = React.useState<"" | string>("");
  const [showFreezeDialog, setShowFreezeDialog] = React.useState(false);
  const [showLostDialog, setShowLostDialog] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "warning" | "error" } | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const address = getSessionAddress();
  const token = getSessionToken();
  const fullName = getSessionFullName();

  const frozen = account?.card_frozen || false;
  const lostReported = account?.card_lost_reported || false;

  React.useEffect(() => {
    document.title = "Virtual Card — NexaPay";
  }, []);

  const loadAccount = React.useCallback(async () => {
    if (!token || !address) return;
    setLoading(true);
    try {
      const res = await getJson(`/accounts/${address}`, { "X-Account-Token": token });
      if (res.ok) setAccount(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, address]);

  React.useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  // Countdown timer for revealed sensitive data
  React.useEffect(() => {
    if (countdown <= 0 || !revealed) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setRevealed(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown, revealed]);

  const verifyPinAndReveal = async (target: "cvv" | "number") => {
    if (pin.length !== 6 || !token) return;
    setPinLoading(true);
    setPinError("");
    try {
      const phone = getSessionPhone();
      if (!phone) {
        setPinError("Session expired. Please log in again.");
        setPinLoading(false);
        return;
      }
      const res = await postJson("/auth/login", { phone, pin });
      if (res.ok && (res.data as any).step === "otp_required") {
        setShowPinModal(false);
        setPin("");
        setPinError("");
        setRevealed(target);
        setCountdown(10);
      } else {
        setPinError("Wrong PIN");
        setPin("");
      }
    } catch {
      setPinError("Verification failed");
    } finally {
      setPinLoading(false);
    }
  };

  const openReveal = (type: "cvv" | "number") => {
    if (frozen) return;
    setRevealTarget(type);
    setShowPinModal(true);
    setPin("");
    setPinError("");
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      // ignore
    }
  };

  const toggleFreeze = async () => {
    if (!token || !address) return;
    setActionLoading(true);
    try {
      const res = await freezeCard(address, token);
      if (res.ok) {
        const next = (res.data as any).frozen ?? !frozen;
        setAccount((prev: any) => prev ? { ...prev, card_frozen: next } : prev);
        setToast({ message: next ? "Card frozen successfully" : "Card unfrozen successfully", type: next ? "warning" : "success" });
      } else {
        setToast({ message: "Failed to update card status", type: "error" });
      }
    } catch {
      setToast({ message: "Failed to update card status", type: "error" });
    }
    setActionLoading(false);
    setShowFreezeDialog(false);
    setTimeout(() => setToast(null), 3000);
  };

  const reportLost = async () => {
    if (!token || !address) return;
    setActionLoading(true);
    try {
      const res = await reportLostCard(address, token);
      if (res.ok) {
        setAccount((prev: any) => prev ? { ...prev, card_lost_reported: true, card_frozen: true } : prev);
        setToast({ message: "Card reported lost. Replacement will be issued within 3-5 business days.", type: "warning" });
      } else {
        setToast({ message: "Failed to report card lost", type: "error" });
      }
    } catch {
      setToast({ message: "Failed to report card lost", type: "error" });
    }
    setActionLoading(false);
    setShowLostDialog(false);
    setTimeout(() => setToast(null), 5000);
  };

  const card = account?.card || {};
  const last4 = card.last4 || "----";
  const expiry = card.expiry || "--/--";
  const simulatedCvv = "482";
  const simulatedFullNumber = last4 === "----" ? "5168 2300 1294 0000" : `5168 2300 1294 ${last4}`;
  const displayName = account?.full_name || fullName || "USER";
  const createdYear = account?.created_at ? new Date(account.created_at).getFullYear() : new Date().getFullYear();

  // ─── PIN Modal ───
  const PinModal = () => {
    const pinRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
      const t = setTimeout(() => pinRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }, []);

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-[#111] p-6 md:rounded-3xl md:border md:border-white/[0.08]">
          <div className="mb-4 flex items-center justify-between">
            <Lock className="h-8 w-8 text-[#00d4aa]" />
            <button onClick={() => { setShowPinModal(false); setPin(""); setPinError(""); }} className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="text-[20px] font-bold text-white">Enter PIN to reveal</h3>
          <p className="mt-1 text-[13px] text-[#888]">
            {revealTarget === "cvv" ? "CVV will be visible for 10 seconds" : "Full card number will be visible for 10 seconds"}
          </p>

          {/* Hidden input captures all keystrokes */}
          <input
            ref={pinRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(val);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.length === 6) {
                verifyPinAndReveal(revealTarget!);
              }
            }}
            className="sr-only"
            autoFocus
          />

          {/* Visual circles — tapping here focuses the hidden input */}
          <div
            className="mt-6 flex justify-center items-center gap-2 cursor-text"
            onClick={() => pinRef.current?.focus()}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <React.Fragment key={i}>
                {i === 3 && <div className="w-4 h-px bg-white/20 mx-1" />}
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border transition-all",
                    pin[i] ? "border-[#00d4aa]/50 bg-[#161616]" : "border-white/10 bg-[#161616]"
                  )}
                >
                  {pin[i] ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-[#00d4aa]" />
                  ) : null}
                </div>
              </React.Fragment>
            ))}
          </div>
          {pinError && <p className="mt-3 text-center text-sm text-red-400">{pinError}</p>}

          <button
            onClick={() => verifyPinAndReveal(revealTarget!)}
            disabled={pin.length !== 6 || pinLoading}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] font-extrabold text-lg transition-all disabled:opacity-40"
          >
            {pinLoading ? <span className="animate-pulse">Verifying...</span> : "Confirm"}
          </button>
        </div>
      </div>
    );
  };

  // ─── Confirmation Dialog ───
  const ConfirmDialog = ({ title, message, onConfirm, onCancel, danger, icon, confirmLabel, cancelLabel, isLoading }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#111] p-6">
        <div className={cn("mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full", danger ? "bg-red-500/10" : "bg-amber-500/10")}>
          {icon || (danger ? <AlertTriangle className="h-6 w-6 text-red-400" /> : <Snowflake className="h-6 w-6 text-amber-400" />)}
        </div>
        <h3 className="text-center text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-center text-sm text-[#888]">{message}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} disabled={isLoading} className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white font-medium transition-all hover:bg-white/[0.06] disabled:opacity-40">
            {cancelLabel || "Cancel"}
          </button>
          <button onClick={onConfirm} disabled={isLoading} className={cn("flex h-12 flex-1 items-center justify-center rounded-full font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed", danger ? "bg-red-500 text-white hover:bg-red-500/90" : "bg-amber-500 text-[#0b0b0b] hover:bg-amber-500/90")}>
            {isLoading ? "Processing..." : (confirmLabel || "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-inter selection:bg-[#00d4aa] selection:text-black">
      {showPinModal && <PinModal />}
      {showFreezeDialog && (
        <ConfirmDialog
          title={frozen ? "Unfreeze Card?" : "Freeze Card?"}
          message={frozen ? "Your card will be usable for payments again." : "You won't be able to make payments until you unfreeze."}
          icon={<Snowflake className="h-6 w-6 text-amber-400" />}
          confirmLabel={frozen ? "Unfreeze" : "Freeze"}
          onConfirm={toggleFreeze}
          onCancel={() => { setShowFreezeDialog(false); setActionLoading(false); }}
          isLoading={actionLoading}
        />
      )}
      {showLostDialog && (
        <ConfirmDialog
          title="Report Lost or Stolen"
          message="This will immediately block your card and a new one will be issued within 3-5 business days."
          danger
          confirmLabel="Report"
          onConfirm={reportLost}
          onCancel={() => { setShowLostDialog(false); setActionLoading(false); }}
          isLoading={actionLoading}
        />
      )}
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium shadow-lg transition-all",
          toast.type === "success" ? "border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]" :
          toast.type === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
          "border-red-500/30 bg-red-500/10 text-red-400"
        )}>
          {toast.message}
        </div>
      )}

      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        <h1 className="font-space-grotesk text-[28px] font-extrabold text-white">Virtual Card</h1>

        {/* ─── Card Display ─── */}
        <section className="mt-6 flex flex-col items-center">
          <div
            className="group relative w-full max-w-[420px] cursor-pointer"
            style={{ perspective: "1000px" }}
            onClick={() => !frozen && setFlipped((f) => !f)}
          >
            <div
              className="relative aspect-[1.586] w-full transition-transform duration-700"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                filter: frozen ? "grayscale(1)" : "none",
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 overflow-hidden rounded-2xl border border-white/[0.08] p-6 shadow-[0_20px_60px_rgba(0,255,136,0.1)]"
                style={{
                  backfaceVisibility: "hidden",
                  background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{ background: "radial-gradient(ellipse at 65% 35%, rgba(0,255,136,0.18) 0%, transparent 55%)" }}
                />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <img src="/logo.png" alt="NexaPay" className="h-7 object-contain" />
                    <ContactlessIcon />
                  </div>
                  <div><CardChip /></div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "font-mono text-[15px] tracking-[0.15em] transition-colors",
                          revealed === "number" ? "text-[#00d4aa]" : "text-white"
                        )}>
                          {revealed === "number" ? simulatedFullNumber : maskCardNumber(last4)}
                        </p>
                        {revealed === "number" && (
                          <span className="text-[10px] text-[#00d4aa]">Hiding in {countdown}s</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-[#888]">{displayName.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#888]">VALID {expiry}</p>
                      <p className="mt-1 font-serif text-lg font-bold italic text-white">{card.type || "VISA"}</p>
                    </div>
                  </div>
                </div>
                {frozen && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center">
                      <Snowflake className="h-10 w-10 text-amber-400" />
                      <p className="mt-2 text-xl font-extrabold uppercase tracking-widest text-amber-400">FROZEN</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] p-6 shadow-[0_20px_60px_rgba(0,255,136,0.1)]"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background: "linear-gradient(135deg, #111 0%, #0b0b0b 100%)",
                }}
              >
                <div className="-mx-6 mt-2 h-10 bg-[#1a1a1a]" />
                <div className="mt-6 flex-1">
                  <div className="flex items-center justify-between rounded bg-[#1a1a1a] border border-white/[0.08] px-3 py-2">
                    <div className="flex-1 border-b border-dashed border-[#333]" />
                    <div className="ml-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#888]">CVV</p>
                      {revealed === "cvv" ? (
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-white/90">{simulatedCvv}</p>
                          <span className="text-[10px] text-[#00d4aa]">Hiding in {countdown}s</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-white/30">•••</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); openReveal("cvv"); }}
                            className="text-[10px] text-white/60 hover:text-white hover:underline transition-colors"
                          >
                            Reveal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-[10px] text-[#888]">NexaPay — Member Since {createdYear}</p>
                  <p className="font-serif text-lg font-bold italic text-white/60">VISA</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Status Bar ─── */}
        <div className="mt-5 flex items-center justify-center gap-16">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", frozen ? "bg-amber-400" : "bg-[#00d4aa]")} />
            <span className="text-[13px] text-white/80">{frozen ? "Frozen" : "Active"}</span>
          </div>
          <span className="text-[13px] text-[#888]">VISA Virtual</span>
        </div>

        {/* ─── Account Details ─── */}
        <section className="mt-8">
          <div className="rounded-2xl border border-white/[0.04] bg-[#111] p-5 space-y-4">
            {[
              { label: "Card Number", value: revealed === "number" ? `${simulatedFullNumber} (hiding in ${countdown}s)` : maskCardNumber(last4), key: "card" },
              { label: "Cardholder", value: displayName.toUpperCase(), key: "holder" },
              { label: "Valid Thru", value: expiry, key: "exp" },
              { label: "RIB", value: account?.rib || "", key: "rib" },
              { label: "IBAN", value: account?.iban || "", key: "iban" },
              { label: "Account No", value: account?.account_number || "", key: "acc" },
            ].map((row) => (
              <div key={row.key} className="group flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-[#888]">{row.label}</p>
                  <p className="mt-0.5 text-[14px] text-white">{row.value || "---"}</p>
                </div>
                {row.key !== "card" && row.key !== "holder" && row.key !== "exp" && row.value && (
                  <button
                    onClick={() => handleCopy(row.value, row.key)}
                    className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#888] hover:text-[#00d4aa]"
                  >
                    {copiedKey === row.key ? <Check className="h-4 w-4 text-[#00d4aa]" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
                {row.key === "card" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openReveal("number"); }}
                    className="ml-3 text-[12px] text-white/60 hover:text-white hover:underline transition-colors"
                  >
                    Reveal full number
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ─── Actions ─── */}
        <section className="mt-6 space-y-3">
          <button
            onClick={() => setShowFreezeDialog(true)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3.5 text-[14px] font-semibold transition-all",
              frozen
                ? "border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]"
                : "border-amber-500/30 bg-amber-500/[0.08] text-[#FFB800]"
            )}
          >
            <Snowflake className="h-4 w-4" />
            {frozen ? "Unfreeze Card" : "Freeze Card"}
          </button>

          {!lostReported && (
            <button
              onClick={() => setShowLostDialog(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-red-500/[0.08] px-5 py-3.5 text-[14px] font-semibold text-red-400 transition-all hover:bg-red-500/10"
            >
              <AlertTriangle className="h-4 w-4" /> Report Lost or Stolen
            </button>
          )}
          {lostReported && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400 text-center">
              Card reported. Contact contact@backendglitch.com
            </div>
          )}
        </section>

      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00d4aa] text-[#0b0b0b] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>
    </div>
  );
}

export default function CardPage() {
  return (
    <ProtectedRoute>
      <CardInner />
    </ProtectedRoute>
  );
}
