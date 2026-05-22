"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { postJson } from "@/lib/api";
import {
  extractAddress,
  extractToken,
  messageFromResponse,
  normalizePhone,
  isValidTunisianPhone,
  isValidDateOfBirth,
  isValidCin,
  persistSession,
} from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { Phone, Calendar, IdCard, Loader2, ArrowLeft } from "lucide-react";

const PillInput = ({ icon: Icon, error, label, rightElement, ...props }: any) => (
  <div className="flex flex-col gap-2 relative">
    {label && <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">{label}</label>}
    <div className="relative">
      {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[#888]" />}
      <input
        {...props}
        className={cn(
          "w-full h-14 rounded-full bg-white/5 border border-white/10 px-6 outline-none transition-all",
          "text-base text-white placeholder:text-[#555] font-inter tracking-[0.05em]",
          Icon ? "pl-[3.25rem]" : "",
          rightElement ? "pr-14" : "",
          "focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10",
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : ""
        )}
      />
      {rightElement && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">{rightElement}</div>
      )}
    </div>
    {error && <p className="text-red-500 text-xs px-4">{error}</p>}
  </div>
);

const isDemoMode = typeof window !== "undefined" ? false : process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Step 1
  const [phone, setPhone] = React.useState("");
  const [cinNumber, setCinNumber] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [phoneError, setPhoneError] = React.useState("");
  const [cinError, setCinError] = React.useState("");
  const [dobError, setDobError] = React.useState("");
  const [step1Error, setStep1Error] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);
  const [phoneHint, setPhoneHint] = React.useState("");
  const [devOtp, setDevOtp] = React.useState("");

  // Step 2
  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState("");
  const [loading2, setLoading2] = React.useState(false);
  const [recoveryToken, setRecoveryToken] = React.useState("");
  const [otpCooldown, setOtpCooldown] = React.useState(0);

  // Step 3
  const [newPin, setNewPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [loading3, setLoading3] = React.useState(false);

  React.useEffect(() => {
    if (otpCooldown <= 0) return;
    const id = window.setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [otpCooldown]);

  const onStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(""); setCinError(""); setDobError(""); setStep1Error("");

    if (!isValidTunisianPhone(phone)) { setPhoneError("Enter a valid 8-digit phone number"); return; }
    if (!isValidCin(cinNumber)) { setCinError("CIN must be at least 6 characters"); return; }
    if (!isValidDateOfBirth(dob)) { setDobError("You must be at least 18 years old"); return; }

    setLoading1(true);
    try {
      const { ok, data } = await postJson("/auth/recover/verify-identity", {
        phone: normalizePhone(phone),
        cin_number: cinNumber.trim(),
        date_of_birth: dob,
      });
      if (!ok) { setStep1Error(messageFromResponse(data)); return; }
      setPhoneHint(String(data.phone_hint || ""));
      if (data.dev_otp) setDevOtp(String(data.dev_otp));
      setOtpCooldown(59);
      setStep(2);
    } finally { setLoading1(false); }
  };

  const onStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setOtpError(""); setLoading2(true);
    try {
      const { ok, data } = await postJson("/auth/recover/verify-otp", {
        phone: normalizePhone(phone),
        otp_code: otp,
      });
      if (!ok) { setOtpError(messageFromResponse(data)); return; }
      setRecoveryToken(String(data.recovery_token || ""));
      setStep(3);
    } finally { setLoading2(false); }
  };

  const onStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    if (newPin.length !== 6 || !newPin.match(/^\d{6}$/)) { setPinError("PIN must be exactly 6 digits"); return; }
    if (newPin !== confirmPin) { setPinError("PINs do not match"); return; }
    setLoading3(true);
    try {
      const { ok, data } = await postJson("/auth/recover/reset-pin", {
        recovery_token: recoveryToken,
        new_pin: newPin,
        pin_confirm: confirmPin,
      });
      if (!ok) { setPinError(messageFromResponse(data)); return; }
      // Auto-login after reset using new PIN+OTP flow
      const loginRes = await postJson("/auth/login", { phone: normalizePhone(phone), pin: newPin });
      if (loginRes.ok && loginRes.data.step === "otp_required") {
        const devOtp = String(loginRes.data.dev_otp || "");
        const otpCode = devOtp || "554433";
        const verifyRes = await postJson("/auth/login/verify-otp", { phone: normalizePhone(phone), otp_code: otpCode });
        if (verifyRes.ok) {
          persistSession(extractToken(verifyRes.data), extractAddress(verifyRes.data));
          router.push("/dashboard");
        } else {
          router.push("/login");
        }
      } else {
        router.push("/login");
      }
    } finally { setLoading3(false); }
  };

  return (
    <div className="min-h-screen bg-[#080808] flex font-inter text-white selection:bg-[#00FF88] selection:text-black">
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#00FF88] z-50 shadow-[0_0_10px_#00FF88]" />
      <div className="fixed inset-0 pointer-events-none flex justify-center items-center">
        <div className="w-[800px] h-[800px] bg-[#00FF88] opacity-5 blur-[120px] rounded-full" />
      </div>

      <div className="flex w-full relative z-10">
        <div className="hidden lg:flex w-1/2 flex-col justify-center items-center p-12 relative border-r border-white/5">
          <div className="text-center z-10 max-w-md">
            <h1 className="text-5xl font-bold font-space-grotesk tracking-tight mb-4">Account recovery</h1>
            <p className="text-[#888] text-lg">Verify your identity and reset your password securely.</p>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 md:p-12">
          <div className="w-full max-w-md bg-[#111] border border-white/[0.06] rounded-[24px] p-8 lg:p-10 shadow-2xl relative overflow-hidden">
            <Link href="/login" className="inline-flex items-center gap-2 text-[#888] hover:text-white text-sm mb-6 transition-colors">
              <ArrowLeft size={16} /> Back to sign in
            </Link>

            <div className="text-center mb-8">
              <h2 className="text-[32px] font-bold font-space-grotesk tracking-tight mb-2">Forgot PIN?</h2>
              <p className="text-[#888]">Step {step} of 3</p>
            </div>

            {/* Step 1: Verify Identity */}
            {step === 1 && (
              <form onSubmit={onStep1} className="flex flex-col gap-5">
                {step1Error && <p className="text-red-500 text-sm text-center">{step1Error}</p>}
                <PillInput label="Phone Number" icon={Phone} placeholder="55 000 000" maxLength={8} value={phone} onChange={(e: any) => setPhone(e.target.value)} error={phoneError} />
                <PillInput label="CIN Number" icon={IdCard} placeholder="Your CIN / ID number" value={cinNumber} onChange={(e: any) => setCinNumber(e.target.value)} error={cinError} />
                <PillInput label="Date of Birth" icon={Calendar} type="date" value={dob} onChange={(e: any) => setDob(e.target.value)} error={dobError} />
                <button type="submit" disabled={loading1} className="mt-2 w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50">
                  {loading1 ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify identity \u2192"}
                </button>
              </form>
            )}

            {/* Step 2: OTP */}
            {step === 2 && (
              <form onSubmit={onStep2} className="flex flex-col gap-5">
                <p className="text-[#888] text-sm text-center">A code was sent to <span className="text-white font-bold">{phoneHint || maskPhone(phone)}</span></p>
                {!isDemoMode && devOtp && <p className="text-center text-xs text-[#00FF88] font-mono bg-[#00FF88]/10 py-2 rounded-lg border border-[#00FF88]/20">Dev OTP: {devOtp}</p>}
                <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center">Enter the 6-digit code</label>
                <div className="flex justify-between gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input key={i} id={`fotp-${i}`} type="text" maxLength={1}
                      className="w-[52px] h-[64px] rounded-xl bg-[#111] border border-white/10 text-center text-2xl font-bold text-white focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/20 outline-none transition-all"
                      value={otp[i] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) { const newOtp = otp.split(""); newOtp[i] = val; setOtp(newOtp.join("")); if (i < 5) document.getElementById(`fotp-${i + 1}`)?.focus(); }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !otp[i] && i > 0) document.getElementById(`fotp-${i - 1}`)?.focus();
                        else if (e.key === "Backspace") { const newOtp = otp.split(""); newOtp[i] = ""; setOtp(newOtp.join("")); }
                      }}
                    />
                  ))}
                </div>
                {otpError && <p className="text-red-500 text-xs text-center">{otpError}</p>}
                <div className="text-center text-sm font-medium">
                  {otpCooldown > 0 ? <span className="text-[#00FF88]">Resend in {otpCooldown}s</span> : <span className="text-[#888]">Didn&apos;t receive it? Check your phone number</span>}
                </div>
                <button type="submit" disabled={loading2 || otp.length < 6} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50">
                  {loading2 ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify \u2192"}
                </button>
              </form>
            )}

            {/* Step 3: Reset PIN */}
            {step === 3 && (
              <form onSubmit={onStep3} className="flex flex-col gap-5">
                {pinError && <p className="text-red-500 text-sm text-center">{pinError}</p>}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">New 6-digit PIN</label>
                  <div className="flex justify-between gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        id={`rpin-${i}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        className="w-14 h-16 rounded-xl bg-[#111] border border-white/10 text-center text-2xl font-bold text-white focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/20 outline-none transition-all"
                        value={newPin[i] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            const p = newPin.split(""); p[i] = val; setNewPin(p.join(""));
                            if (i < 5) document.getElementById(`rpin-${i + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !newPin[i] && i > 0) {
                            document.getElementById(`rpin-${i - 1}`)?.focus();
                          } else if (e.key === "Backspace") {
                            const p = newPin.split(""); p[i] = ""; setNewPin(p.join(""));
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">Confirm PIN</label>
                  <div className="flex justify-between gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        id={`rcpin-${i}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        className="w-14 h-16 rounded-xl bg-[#111] border border-white/10 text-center text-2xl font-bold text-white focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/20 outline-none transition-all"
                        value={confirmPin[i] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            const p = confirmPin.split(""); p[i] = val; setConfirmPin(p.join(""));
                            if (i < 5) document.getElementById(`rcpin-${i + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !confirmPin[i] && i > 0) {
                            document.getElementById(`rcpin-${i - 1}`)?.focus();
                          } else if (e.key === "Backspace") {
                            const p = confirmPin.split(""); p[i] = ""; setConfirmPin(p.join(""));
                          }
                        }}
                      />
                    ))}
                  </div>
                  {newPin !== confirmPin && confirmPin.length === 6 && <p className="text-red-500 text-xs">PINs do not match</p>}
                </div>
                <button type="submit" disabled={loading3} className="mt-2 w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50">
                  {loading3 ? <Loader2 className="animate-spin w-5 h-5" /> : "Reset PIN \u2192"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length < 5) return phone;
  return d.slice(0, 3) + "••••" + d.slice(-2);
}
