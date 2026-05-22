"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { getSessionToken, getSessionAddress, getSessionFullName } from "@/lib/auth-utils";
import { getJson, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Search,
  Loader2,
  ArrowLeft,
  Check,
  ChevronRight,
  Home,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Clock,
  User,
} from "lucide-react";

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

interface SearchResult {
  chain_address: string;
  full_name: string;
  cin: string;
  phone: string;
}

interface TransactionView {
  id: string;
  type: string;
  direction: string;
  amount: number;
  amount_display: string;
  from: string;
  to: string;
  from_name: string;
  to_name: string;
  memo: string;
  timestamp: string;
  block: number;
  hash: string;
}

// ─── Main Component ───
function SendInner() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | "success">(1);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Step 1
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [recipient, setRecipient] = React.useState<SearchResult | null>(null);
  const [recentContacts, setRecentContacts] = React.useState<SearchResult[]>([]);
  const searchRef = React.useRef<HTMLDivElement>(null);

  // Step 2
  const [rawAmount, setRawAmount] = React.useState(0); // millimes
  const [balance, setBalance] = React.useState(0);
  const [memo, setMemo] = React.useState("");
  const [showMemo, setShowMemo] = React.useState(false);

  // Step 3
  const [pin, setPin] = React.useState("");
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [pinShake, setPinShake] = React.useState(false);
  const [txHash, setTxHash] = React.useState("");
  const [toName, setToName] = React.useState("");

  // Step 4 (OTP)
  const [otpId, setOtpId] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [otpLoading, setOtpLoading] = React.useState(false);
  const [otpShake, setOtpShake] = React.useState(false);

  // Idempotency key (generated once per transfer attempt)
  const [idempotencyKey] = React.useState(() => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

  // Bank transfer mode
  const [isBankTransfer, setIsBankTransfer] = React.useState(false);
  const [rib, setRib] = React.useState("");
  const [beneficiaryName, setBeneficiaryName] = React.useState("");

  const address = getSessionAddress();
  const token = getSessionToken();

  // Fetch balance and recent contacts on mount
  React.useEffect(() => {
    document.title = "Send Money — NexaPay";
    const load = async () => {
      if (!token || !address) return;
      try {
        const [accRes, txRes] = await Promise.all([
          getJson(`/accounts/${address}`, { "X-Account-Token": token }),
          getJson(`/accounts/${address}/transactions`, { "X-Account-Token": token }),
        ]);
        if (accRes.ok && "balance" in accRes.data) {
          setBalance(Number(accRes.data.balance) || 0);
        }
        if (txRes.ok && "transactions" in txRes.data) {
          const txs = ((txRes.data as any).transactions || []) as TransactionView[];
          const seen = new Set<string>();
          const contacts: SearchResult[] = [];
          for (const tx of txs) {
            if (tx.type === "Transfer" && tx.from === address) {
              if (!seen.has(tx.to) && contacts.length < 3) {
                seen.add(tx.to);
                contacts.push({
                  chain_address: tx.to,
                  full_name: tx.to_name || tx.to.slice(0, 8) + "...",
                  cin: "",
                  phone: "",
                });
              }
            }
          }
          setRecentContacts(contacts);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [token, address]);

  // Debounced search
  React.useEffect(() => {
    if (!query.trim() || !token || !address) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await getJson(
          `/accounts/${address}/search?q=${encodeURIComponent(query.trim())}`,
          { "X-Account-Token": token }
        );
        if (res.ok && "results" in res.data) {
          setSearchResults(((res.data as any).results || []) as SearchResult[]);
        }
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [query, token, address]);

  const selectRecipient = (r: SearchResult) => {
    setRecipient(r);
    setQuery("");
    setSearchResults([]);
    setStep(2);
  };

  const exceedsBalance = rawAmount > 0 && rawAmount + 10 > balance; // +10 for fee

  const handleAmountInput = (value: string) => {
    const clean = value.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");
    if (!clean || clean === ".") {
      setRawAmount(0);
      return;
    }
    const parsed = parseFloat(clean);
    if (!isNaN(parsed)) {
      setRawAmount(Math.round(parsed * 1000));
    }
  };

  const displayValue = rawAmount === 0 ? "" : (rawAmount / 1000).toString();

  const submitTransfer = async () => {
    if (pin.length !== 6 || rawAmount === 0) return;
    if (isBankTransfer && (!rib || !beneficiaryName)) return;
    if (!isBankTransfer && !recipient) return;
    setConfirmLoading(true);
    setError("");
    try {
      const res = await postJson(
        `/accounts/${address}/transfer/request-otp`,
        {
          to: isBankTransfer ? rib : recipient!.chain_address,
          amount: rawAmount,
          pin,
          memo: memo || undefined,
          rib: isBankTransfer ? rib : undefined,
          beneficiary_name: isBankTransfer ? beneficiaryName : undefined,
        },
        { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey }
      );
      if (res.ok) {
        setOtpId(String((res.data as any).otp_id || ""));
        setStep(4);
      } else {
        const msg = String((res.data as any).error || (res.data as any).message || "");
        if (msg.includes("PIN") || msg.includes("pin")) {
          setPinShake(true);
          setTimeout(() => setPinShake(false), 500);
          setError("Wrong PIN. Please try again.");
          setPin("");
        } else if (msg.includes("balance") || msg.includes("Insufficient")) {
          setError("Insufficient balance");
          setStep(2);
        } else if (msg.includes("Too many") || msg.includes("Locked")) {
          setError(msg);
        } else {
          setError(msg || "Transfer failed");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirmLoading(false);
    }
  };

  const submitOtp = async () => {
    if (otpCode.length !== 6 || !otpId) return;
    setOtpLoading(true);
    setError("");
    try {
      if (isBankTransfer) {
        const res = await postJson(
          `/accounts/${address}/bank-transfer`,
          {
            rib,
            beneficiary_name: beneficiaryName,
            amount: rawAmount,
            pin,
            otp_id: otpId,
            otp_code: otpCode,
            memo: memo || undefined,
          },
          { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey }
        );
        if (res.ok) {
          setTxHash(String((res.data as any).transfer_id || ""));
          setToName(beneficiaryName);
          setStep("success");
        } else {
          const msg = String((res.data as any).error || (res.data as any).message || "");
          if (msg.includes("OTP") || msg.includes("otp")) {
            setOtpShake(true);
            setTimeout(() => setOtpShake(false), 500);
            setError("Wrong OTP. Please try again.");
            setOtpCode("");
          } else {
            setError(msg || "Transfer failed");
          }
        }
      } else {
        const res = await postJson(
          `/accounts/${address}/transfer/verify-otp`,
          { otp_id: otpId, otp_code: otpCode },
          { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey }
        );
        if (res.ok) {
          setTxHash(String((res.data as any).tx_hash || ""));
          setToName(String((res.data as any).to_name || recipient?.full_name || ""));
          setStep("success");
        } else {
          const msg = String((res.data as any).error || (res.data as any).message || "");
          if (msg.includes("OTP") || msg.includes("otp")) {
            setOtpShake(true);
            setTimeout(() => setOtpShake(false), 500);
            setError("Wrong OTP. Please try again.");
            setOtpCode("");
          } else if (msg.includes("Locked") || msg.includes("Too many")) {
            setError(msg);
          } else {
            setError(msg || "Transfer failed");
          }
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Progress Dots ───
  const ProgressDots = () => {
    const current = step === "success" ? 4 : step;
    return (
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              s <= current ? "w-2 bg-[#00FF88]" : "w-2 bg-white/20"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter selection:bg-[#00FF88] selection:text-black">
      {/* Top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-white/[0.06] bg-[#0a0a0a]/90 px-4 backdrop-blur-xl md:px-6">
        {/* Left spacer — always w-8 so dots stay truly centered */}
        <div className="flex w-8 shrink-0 items-center justify-start">
          {step !== 1 && step !== "success" && (
            <button
              onClick={() => setStep((s) => (s === 4 ? 3 : s === 3 ? 2 : 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-1 flex justify-center">
          <ProgressDots />
        </div>
        {/* Right spacer — mirrors left width */}
        <div className="w-8 shrink-0" />
      </div>

      <main className="mx-auto max-w-lg px-4 pt-20 pb-8">
        {/* Error */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ═══════ STEP 1: Find Recipient ═══════ */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <h1 className="font-space-grotesk text-[28px] font-extrabold text-white">Send Money</h1>
            <p className="mt-1 text-sm text-[#888]">Search by phone, email, or NXP address</p>

            <Link
              href="/bank-transfer"
              className="mt-5 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111] px-4 py-3 transition-colors hover:bg-white/[0.04]"
            >
              <div>
                <p className="text-[14px] font-semibold text-white">Bank Transfer</p>
                <p className="text-[12px] text-[#888]">Send to an external bank account via RIB</p>
              </div>
              <ChevronRight className="h-5 w-5 text-[#555]" />
            </Link>

            {/* Search */}
            <div className="relative mt-6" ref={searchRef}>
              <div className="relative flex h-14 items-center rounded-full border border-white/10 bg-white/5 px-5 transition-all focus-within:border-[#00FF88] focus-within:ring-[3px] focus-within:ring-[#00FF88]/10">
                <Search className="h-[18px] w-[18px] shrink-0 text-[#888]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Phone, email, or NXP address"
                  className="ml-3 h-full w-full bg-transparent text-base text-white outline-none placeholder:text-white/20"
                />
                {searchLoading && <Loader2 className="h-4 w-4 animate-spin text-[#888]" />}
              </div>

              {/* Results dropdown */}
              {query.trim() && (
                <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[320px] overflow-auto rounded-2xl border border-white/[0.08] bg-[#111] shadow-2xl">
                  {searchResults.length === 0 && !searchLoading ? (
                    <div className="py-6 text-center text-sm text-[#888]">No users found</div>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.chain_address}
                        onClick={() => selectRecipient(r)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00FF88]/15 text-xs font-bold text-[#00FF88]">
                          {getInitials(r.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">{r.full_name}</p>
                          <p className="truncate text-[12px] text-[#888]">{r.phone || r.chain_address.slice(0, 12) + "..."}</p>
                        </div>
                        <span className="shrink-0 text-[12px] font-medium text-[#00FF88]">Select →</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Recent contacts */}
            {!query.trim() && recentContacts.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Recent</p>
                <div className="mt-3 space-y-1">
                  {recentContacts.map((r) => (
                    <button
                      key={r.chain_address}
                      onClick={() => selectRecipient(r)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-[#888]">
                        {getInitials(r.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[14px] font-semibold text-white">{r.full_name}</p>
                        <p className="truncate text-[12px] text-[#888]">{r.chain_address.slice(0, 12)}...</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#555]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STEP 2: Enter Amount ═══════ */}
        {step === 2 && recipient && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            {/* Recipient pill */}
            <div className="mb-6 flex items-center gap-3 rounded-full border border-white/[0.06] bg-[#111] px-4 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00FF88]/15 text-[10px] font-bold text-[#00FF88]">
                {getInitials(recipient.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{recipient.full_name}</p>
              </div>
              <button onClick={() => setStep(1)} className="text-[12px] font-medium text-[#00FF88] hover:underline">
                Change
              </button>
            </div>

            {/* Amount display */}
            <div className="mb-2 text-center">
              <div className="font-space-grotesk text-[48px] font-extrabold leading-none text-white">
                {rawAmount === 0 ? "0" : formatMillimes(rawAmount).replace(" TND", "")}
              </div>
              <p className="mt-1 text-xl text-[#888]">TND</p>
            </div>

            <div className="mx-auto mt-4 max-w-[300px]">
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={displayValue}
                onChange={(e) => handleAmountInput(e.target.value)}
                placeholder="0.000"
                className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-5 text-center text-base text-white outline-none placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10"
              />
            </div>

            {exceedsBalance && (
              <p className="mt-4 text-center text-sm text-red-400">Insufficient balance</p>
            )}

            {/* Fee + balance */}
            <div className="mt-5 text-center">
              <p className="text-[13px] text-[#888]">Fee: 0.010 TND (Free for NexaPay)</p>
              <p className="mt-0.5 text-[11px] text-[#555]">Zero-fee transfers within NexaPay</p>
              <p className="mt-2 text-[12px] text-[#888]">Available: {formatMillimes(balance)}</p>
            </div>

            {/* Memo */}
            {!showMemo ? (
              <button
                onClick={() => setShowMemo(true)}
                className="mt-5 text-[12px] text-[#888] hover:text-white transition-colors"
              >
                + Add note
              </button>
            ) : (
              <div className="mt-5">
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Note to recipient (optional)"
                  maxLength={140}
                  className="w-full h-12 rounded-full bg-white/5 border border-white/10 px-5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all"
                />
                <p className="mt-1 text-right text-[10px] text-[#555]">{memo.length}/140</p>
              </div>
            )}

            {/* Continue */}
            <button
              onClick={() => {
                if (rawAmount === 0 || exceedsBalance) return;
                setStep(3);
                setError("");
              }}
              disabled={rawAmount === 0 || exceedsBalance}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              Continue <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* ═══════ STEP 3: Confirm with PIN ═══════ */}
        {step === 3 && recipient && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            {/* Summary card */}
            <div className="mb-6 rounded-2xl border border-[#00FF88]/20 bg-[#111] p-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-[12px] text-[#888]">To</span>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00FF88]/15 text-[8px] font-bold text-[#00FF88]">
                    {getInitials(recipient.full_name)}
                  </div>
                  <span className="text-[14px] font-semibold text-white">{recipient.full_name}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                <span className="text-[12px] text-[#888]">Amount</span>
                <span className="text-[14px] font-semibold text-white">{formatMillimes(rawAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                <span className="text-[12px] text-[#888]">Fee</span>
                <span className="text-[14px] font-semibold text-[#00FF88]">0.010 TND (Free)</span>
              </div>
              <div className="flex items-center justify-between pt-3">
                <span className="text-[12px] text-[#888]">Total deducted</span>
                <span className="text-[16px] font-extrabold text-white">{formatMillimes(rawAmount + 10)}</span>
              </div>
            </div>

            <h2 className="text-center font-space-grotesk text-[20px] font-bold text-white">
              Enter your PIN to confirm
            </h2>
            <p className="mt-1 text-center text-[13px] text-[#888]">Keep your PIN secret</p>

            {/* PIN inputs */}
            <div className={cn("mt-6 flex justify-center items-center gap-2", pinShake && "animate-shake")}>
              {Array.from({ length: 6 }).map((_, i) => (
                <React.Fragment key={i}>
                  {i === 3 && <div className="w-4 h-px bg-white/20 mx-1" />}
                  <input
                    id={`spn-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pin[i] || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val) {
                        const p = pin.split("");
                        p[i] = val.slice(-1);
                        setPin(p.join(""));
                        if (i < 5) document.getElementById(`spn-${i + 1}`)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !pin[i] && i > 0) {
                        document.getElementById(`spn-${i - 1}`)?.focus();
                      } else if (e.key === "Backspace") {
                        const p = pin.split("");
                        p[i] = "";
                        setPin(p.join(""));
                      }
                    }}
                    className={cn(
                      "w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#111] border text-center text-lg font-bold text-white outline-none transition-all duration-200",
                      pin[i]
                        ? pinShake
                          ? "border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
                          : "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]"
                        : "border-white/10 shadow-none",
                      "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                    )}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* Confirm button */}
            <button
              onClick={submitTransfer}
              disabled={pin.length !== 6 || confirmLoading}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              {confirmLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Processing...
                </>
              ) : (
                <>Confirm Transfer</>
              )}
            </button>
          </div>
        )}

        {/* ═══════ STEP 4: OTP ═══════ */}
        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <h2 className="text-center font-space-grotesk text-[20px] font-bold text-white">
              Enter OTP
            </h2>
            <p className="mt-1 text-center text-[13px] text-[#888]">
              We sent a 6-digit code to your phone
            </p>

            {/* OTP inputs */}
            <div className={cn("mt-6 flex justify-center items-center gap-2", otpShake && "animate-shake")}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpCode[i] || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val) {
                      const c = otpCode.split("");
                      c[i] = val.slice(-1);
                      setOtpCode(c.join(""));
                      if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otpCode[i] && i > 0) {
                      document.getElementById(`otp-${i - 1}`)?.focus();
                    } else if (e.key === "Backspace") {
                      const c = otpCode.split("");
                      c[i] = "";
                      setOtpCode(c.join(""));
                    }
                  }}
                  className={cn(
                    "w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#111] border text-center text-lg font-bold text-white outline-none transition-all duration-200",
                    otpCode[i]
                      ? otpShake
                        ? "border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
                        : "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]"
                      : "border-white/10 shadow-none",
                    "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                  )}
                />
              ))}
            </div>

            {error && (
              <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>
            )}

            {/* Confirm button */}
            <button
              onClick={submitOtp}
              disabled={otpCode.length !== 6 || otpLoading}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              {otpLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Verifying...
                </>
              ) : (
                <>Confirm</>
              )}
            </button>

            <button
              onClick={() => {
                setStep(3);
                setOtpCode("");
                setError("");
              }}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-transparent text-white font-semibold transition-all hover:bg-white/[0.06]"
            >
              Back
            </button>
          </div>
        )}

        {/* ═══════ SUCCESS SCREEN ═══════ */}
        {step === "success" && (
          <div className="flex flex-col items-center pt-8 animate-in zoom-in-95 fade-in duration-500">
            <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#00FF88]/20 animate-ping" style={{ animationDuration: "3s" }} />
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00FF88] shadow-[0_0_50px_#00FF88]">
                <Check className="h-10 w-10 text-[#080808]" />
              </div>
            </div>

            <h2 className="font-space-grotesk text-[28px] font-extrabold text-white">Transfer Sent!</h2>
            <p className="mt-2 text-[24px] font-semibold text-[#00FF88]">{formatMillimes(rawAmount)}</p>
            <p className="mt-1 text-[14px] text-[#888]">To: {toName || recipient?.full_name}</p>

            {txHash && (
              <div className="mt-4 flex items-center gap-2 rounded-full bg-white/[0.03] px-4 py-2 text-[12px] text-[#888]">
                <span>Tx: {txHash.slice(0, 10)}...</span>
                <button
                  onClick={() => navigator.clipboard.writeText(txHash)}
                  className="text-[#00FF88] hover:underline"
                >
                  Copy
                </button>
              </div>
            )}

            <div className="mt-8 flex w-full gap-3">
              <Link
                href="/dashboard"
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-white font-bold transition-all hover:bg-white/[0.06]"
              >
                <Home className="h-4 w-4" /> Back to Home
              </Link>
              <button
                onClick={() => {
                  setStep(1);
                  setRecipient(null);
                  setRawAmount(0);
                  setPin("");
                  setMemo("");
                  setError("");
                  setTxHash("");
                }}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold transition-all hover:bg-[#00FF88]/90"
              >
                <RotateCcw className="h-4 w-4" /> Send Again
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom nav (minimal on this page) */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#00FF88]" /><span className="text-[10px] text-[#00FF88]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00FF88] text-[#080808] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default function SendPage() {
  return (
    <ProtectedRoute>
      <SendInner />
    </ProtectedRoute>
  );
}
