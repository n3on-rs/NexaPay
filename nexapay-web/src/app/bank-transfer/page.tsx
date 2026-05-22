"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import { getJson, postJson, fetchSavedBeneficiaries, deleteSavedBeneficiary, generateInvoice } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Check, Home, RotateCcw, ArrowUpRight, Plus, Clock, User, Trash2 } from "lucide-react";

function formatMillimes(value: number): string {
  const tnd = (value / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${tnd} TND`;
}


function BankTransferInner() {
  const router = useRouter();
  const [idempotencyKey] = React.useState(() => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | "success">(1);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [rib, setRib] = React.useState("");
  const [beneficiaryName, setBeneficiaryName] = React.useState("");
  const [rawAmount, setRawAmount] = React.useState(0);
  const [balance, setBalance] = React.useState(0);
  const [memo, setMemo] = React.useState("");
  const [showMemo, setShowMemo] = React.useState(false);

  const [pin, setPin] = React.useState("");
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [pinShake, setPinShake] = React.useState(false);

  const [otpId, setOtpId] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [otpLoading, setOtpLoading] = React.useState(false);
  const [otpShake, setOtpShake] = React.useState(false);
  const [devOtp, setDevOtp] = React.useState("");

  const [txHash, setTxHash] = React.useState("");

  const [savedBeneficiaries, setSavedBeneficiaries] = React.useState<{ id: string; rib: string; beneficiary_name: string }[]>([]);
  const [savedLoading, setSavedLoading] = React.useState(false);

  const address = getSessionAddress();
  const token = getSessionToken();

  const loadSavedBeneficiaries = React.useCallback(async () => {
    if (!token || !address) return;
    setSavedLoading(true);
    try {
      const res = await fetchSavedBeneficiaries(address, token);
      if (res.ok && Array.isArray(res.data)) {
        setSavedBeneficiaries(res.data as { id: string; rib: string; beneficiary_name: string }[]);
      }
    } catch { /* ignore */ }
    setSavedLoading(false);
  }, [token, address]);

  React.useEffect(() => {
    document.title = "Bank Transfer — NexaPay";
    const load = async () => {
      if (!token || !address) return;
      try {
        const accRes = await getJson(`/accounts/${address}`, { "X-Account-Token": token });
        if (accRes.ok && "balance" in accRes.data) {
          setBalance(Number(accRes.data.balance) || 0);
        }
      } catch { /* ignore */ }
    };
    load();
    loadSavedBeneficiaries();
  }, [token, address, loadSavedBeneficiaries]);

  const exceedsBalance = rawAmount > 0 && rawAmount + 10 > balance;

  const handleAmountInput = (value: string) => {
    // Allow only digits and one decimal point
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

  const submitPin = async () => {
    if (pin.length !== 6 || rawAmount === 0 || !beneficiaryName.trim() || rib.length < 15) return;
    setConfirmLoading(true);
    setError("");
    try {
      const res = await postJson(
        `/accounts/${address}/transfer/request-otp`,
        {
          to: rib,
          amount: rawAmount,
          pin,
          memo: memo || undefined,
          rib,
          beneficiary_name: beneficiaryName,
        },
        { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey }
      );
      if (res.ok) {
        setOtpId(String((res.data as any).otp_id || ""));
        setDevOtp(String((res.data as any).dev_otp || ""));
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
        const transferId = String((res.data as any).transfer_id || "");
        setTxHash(transferId);
        // Generate invoice asynchronously (don't block UI)
        if (address && token) {
          generateInvoice(address, token, {
            transaction_id: transferId,
            amount: rawAmount / 1000,
            currency: "TND",
            buyer_name: beneficiaryName,
            buyer_address: address,
            description: memo || `Bank transfer to ${beneficiaryName}`,
          }).catch(() => {});
        }
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
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

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
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-white/[0.06] bg-[#0a0a0a]/90 px-4 backdrop-blur-xl md:px-6">
        <div className="flex w-8 shrink-0 items-center justify-start">
          {step !== 1 && step !== "success" && (
            <button
              onClick={() => setStep((s) => s === 4 ? 3 : s === 3 ? 2 : 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-1 flex justify-center">
          <ProgressDots />
        </div>
        <div className="w-8 shrink-0" />
      </div>

      <main className="mx-auto max-w-lg px-4 pt-20 pb-8">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-space-grotesk text-[28px] font-extrabold text-white">Bank Transfer</h1>
                <p className="mt-1 text-sm text-[#888]">Send money to an external bank account</p>
              </div>
              <Link
                href="/bank-transfer/history"
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-[#888] transition-colors hover:text-white"
              >
                View History
              </Link>
            </div>

            {/* Saved Beneficiaries Quick Access */}
            {savedBeneficiaries.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#555]">Saved Beneficiaries</p>
                <div className="space-y-2">
                  {savedBeneficiaries.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#111] px-4 py-3 transition-colors hover:border-[#00FF88]/30"
                    >
                      <button
                        onClick={() => {
                          setBeneficiaryName(b.beneficiary_name);
                          setRib(b.rib);
                        }}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00FF88]/15 text-xs font-bold text-[#00FF88]">
                          {b.beneficiary_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">{b.beneficiary_name}</p>
                          <p className="truncate text-[12px] text-[#888]">{b.rib}</p>
                        </div>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!token || !address) return;
                          const res = await deleteSavedBeneficiary(address, token, b.id);
                          if (res.ok) loadSavedBeneficiaries();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#555] transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#888]">Beneficiary Name</label>
                <input
                  type="text"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="Full name of beneficiary"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-5 text-base text-white outline-none placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#888]">RIB</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rib}
                  onChange={(e) => setRib(e.target.value.replace(/\D/g, ""))}
                  placeholder="20-digit RIB"
                  maxLength={20}
                  className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-5 text-base text-white outline-none placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10"
                />
              </div>
              <button
                onClick={() => {
                  if (!beneficiaryName.trim() || rib.length < 15) return;
                  setStep(2);
                }}
                disabled={!beneficiaryName.trim() || rib.length < 15}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ArrowUpRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <div className="mb-6 flex items-center gap-3 rounded-full border border-white/[0.06] bg-[#111] px-4 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00FF88]/15 text-[10px] font-bold text-[#00FF88]">
                {beneficiaryName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{beneficiaryName}</p>
                <p className="truncate text-[12px] text-[#888]">{rib}</p>
              </div>
              <button onClick={() => setStep(1)} className="text-[12px] font-medium text-[#00FF88] hover:underline">
                Change
              </button>
            </div>

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

            <div className="mt-5 text-center">
              <p className="text-[13px] text-[#888]">Fee: 0.010 TND</p>
              <p className="mt-2 text-[12px] text-[#888]">Available: {formatMillimes(balance)}</p>
            </div>

            {!showMemo ? (
              <button onClick={() => setShowMemo(true)} className="mt-5 text-[12px] text-[#888] hover:text-white transition-colors">
                + Add note
              </button>
            ) : (
              <div className="mt-5">
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Note (optional)"
                  maxLength={140}
                  className="w-full h-12 rounded-full bg-white/5 border border-white/10 px-5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all"
                />
                <p className="mt-1 text-right text-[10px] text-[#555]">{memo.length}/140</p>
              </div>
            )}

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

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <div className="mb-6 rounded-2xl border border-[#00FF88]/20 bg-[#111] p-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-[12px] text-[#888]">To</span>
                <span className="text-[14px] font-semibold text-white">{beneficiaryName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                <span className="text-[12px] text-[#888]">RIB</span>
                <span className="text-[14px] font-semibold text-white">{rib}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                <span className="text-[12px] text-[#888]">Amount</span>
                <span className="text-[14px] font-semibold text-white">{formatMillimes(rawAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                <span className="text-[12px] text-[#888]">Fee</span>
                <span className="text-[14px] font-semibold text-[#00FF88]">0.010 TND</span>
              </div>
              <div className="flex items-center justify-between pt-3">
                <span className="text-[12px] text-[#888]">Total deducted</span>
                <span className="text-[16px] font-extrabold text-white">{formatMillimes(rawAmount + 10)}</span>
              </div>
            </div>

            <h2 className="text-center font-space-grotesk text-[20px] font-bold text-white">
              Enter your PIN
            </h2>
            <p className="mt-1 text-center text-[13px] text-[#888]">After PIN, an OTP will be sent to your phone</p>

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

            <button
              onClick={submitPin}
              disabled={pin.length !== 6 || confirmLoading}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              {confirmLoading ? "Processing..." : "Request OTP"}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right duration-300">
            <div className="mb-6 rounded-2xl border border-[#00FF88]/20 bg-[#111] p-5 text-center">
              <p className="text-[12px] text-[#888]">Enter the 6-digit code sent to your phone</p>
              <p className="mt-2 text-[14px] font-semibold text-white">{formatMillimes(rawAmount)} to {beneficiaryName}</p>
              {!isDemoMode && devOtp && (
                <div className="mt-3 rounded-full bg-[#00FF88]/10 px-4 py-2">
                  <p className="text-[11px] text-[#888]">Dev OTP (no SMS)</p>
                  <p className="font-space-grotesk text-[18px] font-bold tracking-[0.3em] text-[#00FF88]">{devOtp}</p>
                </div>
              )}
            </div>

            <h2 className="text-center font-space-grotesk text-[20px] font-bold text-white">
              Enter OTP
            </h2>
            <p className="mt-1 text-center text-[13px] text-[#888]">3 wrong attempts = 1 hour lockout</p>

            <div className={cn("mt-6 flex justify-center items-center gap-2", otpShake && "animate-shake")}>
              {Array.from({ length: 6 }).map((_, i) => (
                <React.Fragment key={i}>
                  {i === 3 && <div className="w-4 h-px bg-white/20 mx-1" />}
                  <input
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otpCode[i] || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val) {
                        const p = otpCode.split("");
                        p[i] = val.slice(-1);
                        setOtpCode(p.join(""));
                        if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otpCode[i] && i > 0) {
                        document.getElementById(`otp-${i - 1}`)?.focus();
                      } else if (e.key === "Backspace") {
                        const p = otpCode.split("");
                        p[i] = "";
                        setOtpCode(p.join(""));
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
                </React.Fragment>
              ))}
            </div>

            {error && (
              <p className="mt-3 text-center text-sm text-red-400">{error}</p>
            )}

            <button
              onClick={submitOtp}
              disabled={otpCode.length !== 6 || otpLoading}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all hover:bg-[#00FF88]/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              {otpLoading ? "Processing..." : "Confirm Transfer"}
            </button>
          </div>
        )}

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
            <p className="mt-1 text-[14px] text-[#888]">To: {beneficiaryName}</p>

            {txHash && (
              <div className="mt-4 flex items-center gap-2 rounded-full bg-white/[0.03] px-4 py-2 text-[12px] text-[#888]">
                <span>Tx: {txHash.slice(0, 10)}...</span>
                <button onClick={() => navigator.clipboard.writeText(txHash)} className="text-[#00FF88] hover:underline">Copy</button>
              </div>
            )}

            <div className="mt-8 flex w-full gap-3">
              <Link href="/dashboard" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-white font-bold transition-all hover:bg-white/[0.06]">
                <Home className="h-4 w-4" /> Back to Home
              </Link>
              <button
                onClick={() => {
                  setStep(1);
                  setBeneficiaryName("");
                  setRib("");
                  setRawAmount(0);
                  setPin("");
                  setOtpCode("");
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

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.06] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]">
        <Link href="/dashboard" className="flex flex-col items-center gap-1"><Home className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Home</span></Link>
        <Link href="/send" className="flex flex-col items-center gap-1"><ArrowUpRight className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Send</span></Link>
        <Link href="/fund" className="relative -top-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#00FF88] text-[#080808] shadow-[0_8px_24px_rgba(0,255,136,0.35)]"><Plus className="h-5 w-5" /></Link>
        <Link href="/history" className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">History</span></Link>
        <Link href="/profile" className="flex flex-col items-center gap-1"><User className="h-5 w-5 text-[#555555]" /><span className="text-[10px] text-[#555555]">Profile</span></Link>
      </nav>

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

const isDemoMode = typeof window !== "undefined" ? false : process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function BankTransferPage() {
  return (
    <ProtectedRoute>
      <BankTransferInner />
    </ProtectedRoute>
  );
}
