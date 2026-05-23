"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { postJson } from "@/lib/api";
import { extractAddress, extractToken, messageFromResponse, isValidTunisianPhone, normalizePhone } from "@/lib/auth-utils";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [step, setStep] = React.useState<1 | 2>(1);

  const [phone, setPhone] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [phoneError, setPhoneError] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);

  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState("");
  const [otpCooldown, setOtpCooldown] = React.useState(0);
  const [devOtp, setDevOtp] = React.useState("");
  const [loading2, setLoading2] = React.useState(false);

  React.useEffect(() => {
    if (otpCooldown <= 0) return;
    const id = window.setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [otpCooldown]);

  const onStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(""); setPinError(""); setFormError("");
    if (!isValidTunisianPhone(phone)) { setPhoneError("Enter a valid 8-digit Tunisian phone number"); return; }
    if (pin.length !== 6 || !pin.match(/^\d{6}$/)) { setPinError("PIN must be exactly 6 digits"); return; }
    setLoading1(true);
    try {
      const { ok, data } = await postJson("/auth/login", { phone: normalizePhone(phone), pin });
      if (!ok) { setFormError(messageFromResponse(data)); return; }
      if (data.dev_otp) setDevOtp(String(data.dev_otp));
      setOtpCooldown(59);
      setStep(2);
    } finally { setLoading1(false); }
  };

  const onStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setOtpError("");
    setLoading2(true);
    try {
      const { ok, data } = await postJson("/auth/login/verify-otp", { phone: normalizePhone(phone), otp_code: otp });
      if (!ok) { setOtpError(messageFromResponse(data)); return; }
      const token = extractToken(data);
      const address = extractAddress(data);
      setAuth(token, address, String(data.full_name || ""), phone);
      window.location.href = "https://sandbox.nexapay.space/dashboard";
    } finally { setLoading2(false); }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white flex items-center justify-center p-6 selection:bg-[#00d4aa] selection:text-black">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="NexaPay" className="mx-auto h-8 w-8 mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-[14px] text-white/40">{step === 1 ? "Log in to your account" : "Verify it's you"}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#141414] p-6">
          {formError && <p className="text-red-400 text-[13px] bg-red-500/5 border border-red-500/10 rounded-lg p-3 mb-5 text-center">{formError}</p>}

          {step === 1 && (
            <form onSubmit={onStep1} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Phone number</label>
                <div className={cn("relative flex items-center h-12 rounded-xl bg-white/[0.04] border overflow-hidden transition-all focus-within:border-[#00d4aa]/50 focus-within:ring-2 focus-within:ring-[#00d4aa]/10", phoneError ? "border-red-500/50" : "border-white/[0.08]")}>
                  <div className="flex items-center gap-1 pl-3.5 pr-2.5 border-r border-white/[0.08] h-full shrink-0">
                    <span className="text-sm">🇹🇳</span>
                    <span className="text-xs font-semibold text-white/60">+216</span>
                  </div>
                  <input type="tel" maxLength={10} required autoFocus
                    className="flex-1 h-full bg-transparent outline-none px-3 text-[15px] font-medium text-white placeholder:text-white/15 tracking-[0.03em]"
                    value={phone.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{4})/, '$1 $2 $3')}
                    onChange={(e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 8); setPhone(raw); }}
                    placeholder="55 000 000" />
                </div>
                {phoneError && <p className="text-red-400 text-xs">{phoneError}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">PIN</label>
                  <Link href="/forgot-password" className="text-[11px] text-[#00d4aa] font-medium hover:underline">Forgot PIN?</Link>
                </div>
                <div className="flex justify-center gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <React.Fragment key={i}>
                      {i === 3 && <div className="w-3 h-px bg-white/10 self-center" />}
                      <input id={`pin-${i}`} type="password" inputMode="numeric" maxLength={1}
                        className={cn("w-10 h-11 rounded-xl bg-white/[0.04] border text-center text-base font-semibold text-white outline-none transition-all", pin[i] ? "border-[#00d4aa]/50" : "border-white/[0.08]", "focus:border-[#00d4aa] focus:ring-2 focus:ring-[#00d4aa]/10")}
                        value={pin[i] || ""}
                        onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val) { const np = pin.split(""); np[i] = val.slice(-1); setPin(np.join("")); if (i < 5) document.getElementById(`pin-${i + 1}`)?.focus(); } }}
                        onKeyDown={(e) => { if (e.key === "Backspace" && !pin[i] && i > 0) document.getElementById(`pin-${i - 1}`)?.focus(); else if (e.key === "Backspace") { const np = pin.split(""); np[i] = ""; setPin(np.join("")); } }}
                      />
                    </React.Fragment>
                  ))}
                </div>
                {pinError && <p className="text-red-400 text-xs text-center">{pinError}</p>}
              </div>

              <button type="submit" disabled={loading1}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30">
                {loading1 ? <Loader2 className="animate-spin h-4 w-4" /> : "Log in"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={onStep2} className="flex flex-col gap-5">
              {devOtp && (
                <p className="text-center text-xs text-[#00d4aa] font-mono bg-[#00d4aa]/5 py-2 rounded-lg border border-[#00d4aa]/10">Dev code: {devOtp}</p>
              )}

              <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white transition-colors self-start">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>

              <div className="flex flex-col items-center gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Verification code</label>
                <div className="flex justify-center gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} autoFocus={i === 0}
                      className={cn("w-10 h-12 rounded-xl bg-white/[0.04] border text-center text-lg font-semibold text-white outline-none transition-all", otp[i] ? "border-[#00d4aa]/50" : "border-white/[0.08]", "focus:border-[#00d4aa] focus:ring-2 focus:ring-[#00d4aa]/10")}
                      value={otp[i] || ""}
                      onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val) { const n = otp.split(""); n[i] = val.slice(-1); setOtp(n.join("")); if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus(); } }}
                      onKeyDown={(e) => { if (e.key === "Backspace" && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus(); else if (e.key === "Backspace") { const n = otp.split(""); n[i] = ""; setOtp(n.join("")); } }}
                    />
                  ))}
                </div>
                {otpError && <p className="text-red-400 text-xs">{otpError}</p>}
              </div>

              <div className="text-center">
                {otpCooldown > 0 ? (
                  <span className="text-[13px] text-white/30">Resend in {otpCooldown}s</span>
                ) : (
                  <button type="button" onClick={() => setStep(1)} className="text-[13px] text-[#00d4aa] font-medium hover:underline">Resend code</button>
                )}
              </div>

              <button type="submit" disabled={loading2 || otp.length < 6}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30">
                {loading2 ? <Loader2 className="animate-spin h-4 w-4" /> : "Verify"}
              </button>
            </form>
          )}
        </div>

        {step === 1 && (
          <p className="mt-6 text-center text-[13px] text-white/30">
            Don't have an account? <Link href="/register" className="text-[#00d4aa] font-medium hover:underline">Create one</Link>
          </p>
        )}
      </div>
    </div>
  );
}
