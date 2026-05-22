"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { postJson } from "@/lib/api";
import {
  extractAddress,
  extractToken,
  messageFromResponse,
  isValidTunisianPhone,
  normalizePhone,
} from "@/lib/auth-utils";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";

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

    if (!isValidTunisianPhone(phone)) {
      setPhoneError("Enter a valid 8-digit Tunisian phone number");
      return;
    }
    if (pin.length !== 6 || !pin.match(/^\d{6}$/)) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }

    setLoading1(true);
    try {
      const { ok, data } = await postJson("/auth/login", { phone: normalizePhone(phone), pin });
      if (!ok) {
        setFormError(messageFromResponse(data));
        return;
      }
      if (data.dev_otp) setDevOtp(String(data.dev_otp));
      setOtpCooldown(59);
      setStep(2);
    } finally {
      setLoading1(false);
    }
  };

  const onStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setOtpError("");
    setLoading2(true);
    try {
      const { ok, data } = await postJson("/auth/login/verify-otp", { phone: normalizePhone(phone), otp_code: otp });
      if (!ok) {
        setOtpError(messageFromResponse(data));
        return;
      }
      const token = extractToken(data);
      const address = extractAddress(data);
      const fullName = String(data.full_name || "");
      setAuth(token, address, fullName, phone);
      router.push("/dashboard");
    } finally {
      setLoading2(false);
    }
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
            <h1 className="text-5xl font-bold font-space-grotesk tracking-tight mb-4">Banking for the new generation</h1>
            <p className="text-[#888] text-lg">Fast, secure, and globally connected. No hidden fees.</p>
          </div>
          <div className="w-[300px] h-[190px] mt-12 rounded-3xl bg-gradient-to-br from-[#111] to-[#222] border max-w-full border-white/10 shadow-2xl relative overflow-hidden transform -rotate-12">
            <div className="absolute top-4 left-4 w-12 h-12 rounded-full overflow-hidden">
              <img src="/logo.png" alt="NexaPay" className="w-full h-full object-contain" />
            </div>
            <div className="absolute bottom-6 left-6 font-space-grotesk text-xl font-bold tracking-widest text-white/80">•••• 4242</div>
            <div className="absolute bottom-6 right-6 font-space-grotesk text-xl font-bold text-[#00FF88]">NEXAPAY</div>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 md:p-12">
          <div className="w-full max-w-md bg-[#111] border border-white/[0.06] rounded-[24px] p-6 sm:p-8 lg:p-10 shadow-2xl relative overflow-hidden">
            <div className="mx-auto w-10 h-10 flex items-center justify-center mb-8">
              <img src="/logo.png" alt="NexaPay" className="w-full h-full object-contain" />
            </div>

            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-[32px] font-bold font-space-grotesk tracking-tight mb-2">Welcome back</h2>
              <p className="text-[#888] text-sm sm:text-base">{step === 1 ? "Enter your phone and PIN" : "Enter the 6-digit code"}</p>
            </div>

            {formError && <p className="text-red-500 text-sm text-center mb-4">{formError}</p>}

            {step === 1 && (
              <form onSubmit={onStep1} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 relative">
                  <label className="text-[11px] font-bold text-[#888]">
                    Phone Number <span className="text-white/40 font-normal">(رقم الهاتف)</span> <span className="text-red-500">*</span>
                  </label>
                  <div className={cn("relative w-full flex items-center h-12 rounded-xl bg-white/5 border border-white/10 overflow-hidden transition-all focus-within:border-[#00FF88] focus-within:ring-[3px] focus-within:ring-[#00FF88]/10", phoneError ? "border-red-500" : "")}>
                    <div className="flex items-center gap-1.5 pl-4 pr-3 border-r border-white/10 h-full shrink-0 select-none">
                      <span className="text-base">🇹🇳</span>
                      <span className="text-sm font-bold text-white/80">+216</span>
                      <ChevronDown className="w-3 h-3 text-[#888]" />
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      required
                      className="flex-1 h-full bg-transparent outline-none px-4 text-base text-white tracking-[0.05em] font-inter placeholder:text-white/20"
                      value={phone.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{4})/, '$1 $2 $3')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                        setPhone(raw);
                      }}
                      placeholder="55 000 000"
                    />
                  </div>
                  {phoneError && <p className="text-red-500 text-xs px-4">{phoneError}</p>}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">Enter Your PIN <span className="text-red-500">*</span></label>
                    <Link href="/forgot-password" className="text-[11px] text-[#00FF88] hover:underline underline-offset-2">Forgot PIN?</Link>
                  </div>
                  <div className="flex justify-center items-center gap-1.5 sm:gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <React.Fragment key={i}>
                        {i === 3 && <div className="w-3 sm:w-4 h-px bg-white/20 mx-0.5 sm:mx-1" />}
                        <input
                          id={`pin-${i}`}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          className={cn(
                            "w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-[#111] border text-center text-base sm:text-lg font-bold text-white outline-none transition-all duration-200",
                            pin[i]
                              ? "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]"
                              : "border-white/10 shadow-none",
                            "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                          )}
                          value={pin[i] || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val) {
                              const newPin = pin.split("");
                              newPin[i] = val.slice(-1);
                              setPin(newPin.join(""));
                              if (i < 5) document.getElementById(`pin-${i + 1}`)?.focus();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !pin[i] && i > 0) {
                              document.getElementById(`pin-${i - 1}`)?.focus();
                            } else if (e.key === "Backspace") {
                              const newPin = pin.split("");
                              newPin[i] = "";
                              setPin(newPin.join(""));
                            }
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                  {pinError && <p className="text-red-500 text-xs text-center">{pinError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading1}
                  className="mt-2 w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50"
                >
                  {loading1 ? <Loader2 className="animate-spin w-5 h-5" /> : "Continue \u2192"}
                </button>

                <div className="flex items-center gap-4 my-2 text-[#444]">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="text-xs uppercase tracking-widest font-bold">or</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>

                <Link
                  href="/register"
                  className="w-full h-14 rounded-full bg-white/5 border border-white/10 text-white font-bold text-base flex items-center justify-center hover:bg-white/10 transition-all"
                >
                  Create account
                </Link>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={onStep2} className="flex flex-col gap-5">
                {!isDemoMode && devOtp && (
                  <p className="text-center text-xs text-[#00FF88] font-mono bg-[#00FF88]/10 py-2 rounded-lg border border-[#00FF88]/20">
                    Dev OTP: {devOtp}
                  </p>
                )}
                <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center">Enter the 6-digit code</label>
                <div className="flex justify-center gap-2 sm:gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className={cn(
                        "w-10 h-12 sm:w-12 sm:h-14 md:w-14 md:h-16 rounded-2xl bg-[#111] border text-center text-xl sm:text-2xl font-bold text-white outline-none transition-all duration-200",
                        otp[i]
                          ? "border-[#00FF88]/60 shadow-[0_0_15px_rgba(0,255,136,0.15)]"
                          : "border-white/10 shadow-none",
                        "focus:border-[#00FF88] focus:shadow-[0_0_20px_rgba(0,255,136,0.25)]"
                      )}
                      value={otp[i] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val) {
                          const newOtp = otp.split("");
                          newOtp[i] = val.slice(-1);
                          setOtp(newOtp.join(""));
                          if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !otp[i] && i > 0) {
                          document.getElementById(`otp-${i - 1}`)?.focus();
                        } else if (e.key === "Backspace") {
                          const newOtp = otp.split("");
                          newOtp[i] = "";
                          setOtp(newOtp.join(""));
                        }
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-center gap-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300", otp[i] ? "bg-[#00FF88] scale-110" : "bg-white/20")} />
                  ))}
                </div>
                {otpError && <p className="text-red-500 text-xs text-center">{otpError}</p>}
                <div className="text-center text-sm font-medium">
                  {otpCooldown > 0 ? (
                    <span className="text-[#00FF88]">Resend in {otpCooldown}s</span>
                  ) : (
                    <button type="button" onClick={() => setStep(1)} className="text-[#888] hover:text-[#00FF88] underline underline-offset-4">Back to PIN entry</button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading2 || otp.length < 6}
                  className="mt-2 w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50"
                >
                  {loading2 ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify & Sign in"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
