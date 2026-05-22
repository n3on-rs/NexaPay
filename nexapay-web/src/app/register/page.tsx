"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson, verifyRegistrationOtp } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, User, Mail, Lock, Loader2,
  CheckCircle2, CreditCard, Calendar, Smartphone
} from "lucide-react";
import {
  extractToken,
  normalizePhone, isValidTunisianPhone, isValidEmail, isValidDateOfBirth
} from "@/lib/auth-utils";
import { useAuth } from "@/contexts/auth-context";

// EXTRACTED OUTSIDE COMPONENT TO PREVENT RE-RENDER FOCUS LOSS
const PillInput = ({ icon: Icon, rightElement, label, ...props }: any) => (
  <div className="flex flex-col gap-2 relative">
    {label && <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">{label}</label>}
    <div className="relative w-full">
      {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[#888] pointer-events-none" />}
      <input
        {...props}
        className={cn(
          "w-full h-14 rounded-full bg-white/5 border border-white/10 px-6 outline-none transition-all",
          "text-base text-white placeholder:text-[#555] font-inter tracking-[0.05em]",
          Icon ? "pl-[3.25rem]" : "", rightElement ? "pr-14" : "",
          "focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10"
        )}
      />
      {rightElement && <div className="absolute right-4 top-1/2 -translate-y-1/2">{rightElement}</div>}
    </div>
  </div>
);

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [step, setStep] = React.useState(1);

  // Step 1 State
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [cinNumber, setCinNumber] = React.useState("");
  const [cinIssueDate, setCinIssueDate] = React.useState("");
  const [addressLine, setAddressLine] = React.useState("");
  const [delegation, setDelegation] = React.useState("");
  const [governorate, setGovernorate] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);
  const [error1, setError1] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Step 2 (PIN) State
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [pinStep, setPinStep] = React.useState<"pin" | "success">("pin");
  const [pinError, setPinError] = React.useState("");
  const [loading4, setLoading4] = React.useState(false);
  const [userAddress, setUserAddress] = React.useState("");
  const [accountToken, setAccountToken] = React.useState("");
  const [cardLast4, setCardLast4] = React.useState("4242");
  const [cardExpiry, setCardExpiry] = React.useState("12/28");
  const [cardType, setCardType] = React.useState("VISA");
  const [rib, setRib] = React.useState("");
  const [iban, setIban] = React.useState("");
  const [sessionId, setSessionId] = React.useState("");

  // Step 3 (OTP) State
  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState("");
  const [otpLoading, setOtpLoading] = React.useState(false);

  const onStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    if (!isValidTunisianPhone(phone)) errs.phone = "Enter a valid 8-digit Tunisian phone number";
    if (!isValidEmail(email)) errs.email = "Enter a valid email address";
    if (!isValidDateOfBirth(dob)) errs.dob = "You must be at least 18 years old";
    if (!cinNumber.trim()) errs.cinNumber = "CIN number is required";
    if (!cinIssueDate) errs.cinIssueDate = "CIN issue date is required";
    if (!addressLine.trim()) errs.addressLine = "Address is required";
    if (!delegation.trim()) errs.delegation = "Delegation is required";
    if (!governorate.trim()) errs.governorate = "Governorate is required";
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading1(true); setError1(""); setFieldErrors({});
    try {
      const payload = {
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone: normalizePhone(phone),
        email,
        date_of_birth: dob,
        cin_number: cinNumber.trim(),
        cin_issue_date: cinIssueDate,
        address_line: addressLine.trim(),
        delegation: delegation.trim(),
        governorate: governorate.trim(),
      };
      const { ok, data } = await postJson("/auth/register/init", payload);
      if (!ok) { setError1(String(data.error || data.message || "Failed to initialize registration")); return; }
      const address = String(data.address || "");
      const token = extractToken(data);
      const sid = String(data.session_id || "");
      if (address) {
        setUserAddress(address);
        setCardLast4(String(data.card_last4 || "4242"));
        setCardExpiry(String(data.card_expiry || "12/28"));
        setCardType(String(data.card_type || "VISA"));
        setRib(String(data.rib || ""));
        setIban(String(data.iban || ""));
        if (token) setAccountToken(token);
      }
      if (sid) setSessionId(sid);
      setStep(2);
    } finally { setLoading1(false); }
  };

  const submitPin = async () => {
    if (pin.length !== 6 || !pin.match(/^\d{6}$/) || pin !== confirmPin) return;
    setLoading4(true);
    try {
      const { ok, data } = await postJson("/auth/register/set-pin", {
        address: userAddress,
        pin,
        pin_confirm: confirmPin,
      });
      if (!ok) {
        setPinError(String(data.error || "Failed to set PIN"));
        return;
      }
      const token = extractToken(data);
      if (token) {
        setAuth(token, userAddress, `${firstName} ${lastName}`.trim());
        setAccountToken(token);
      }
      setPinStep("success");
      setStep(3);
    } catch {
      setPinError("Network error. Please try again.");
    } finally { setLoading4(false); }
  };

  const submitOtp = async () => {
    if (otp.length !== 6 || !otp.match(/^\d{6}$/)) {
      setOtpError("Enter a valid 6-digit code");
      return;
    }
    if (!sessionId) {
      setOtpError("Session expired. Please restart registration.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const { ok, data } = await verifyRegistrationOtp(sessionId, otp);
      if (!ok) {
        setOtpError(String(data.error || "Invalid OTP. Please try again."));
        return;
      }
      setStep(4);
    } catch {
      setOtpError("Network error. Please try again.");
    } finally { setOtpLoading(false); }
  };

  const resendOtp = async () => {
    if (!sessionId) return;
    try {
      await postJson("/auth/register/resend-otp", { session_id: sessionId });
      setOtpError("A new code has been sent.");
    } catch {
      setOtpError("Could not resend code. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter relative overflow-hidden flex flex-col items-center selection:bg-[#00FF88] selection:text-black">
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#222] z-50">
        <div className="h-full bg-[#00FF88] shadow-[0_0_10px_#00FF88] transition-all duration-500 ease-out" style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      {step > 1 && step < 4 && (
        <button onClick={() => setStep(s => s - 1)} className="absolute top-8 left-8 md:left-12 z-50 p-2 text-[#888] hover:text-white transition-colors bg-white/5 rounded-full">
          <ArrowLeft size={24} />
        </button>
      )}
      {step < 4 && (
        <div className="absolute top-8 right-8 md:right-12 z-50 text-[#888] font-bold text-sm tracking-wider font-space-grotesk">
          STEP {step} OF 3
        </div>
      )}

      <div className="relative w-full flex-1 flex transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] pt-16">
        
        {/* STEP 1 */}
        {step === 1 && (
          <div className="w-full flex-1 flex flex-col lg:flex-row animate-in fade-in zoom-in-95 duration-500">
            <div className="lg:w-1/2 p-4 sm:p-8 lg:p-16 flex flex-col justify-center relative border-b lg:border-b-0 lg:border-r border-white/5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,136,0.05)_0%,transparent_60%)] pointer-events-none" />
              <h1 className="text-3xl sm:text-4xl lg:text-[56px] font-space-grotesk font-bold leading-tight mb-6 sm:mb-8">
                Open your account in minutes
              </h1>
              <div className="flex flex-col gap-4">
                {["Free IBAN & RIB", "Virtual Visa card", "Zero fees"].map(b => (
                  <div key={b} className="flex items-center gap-3 bg-#111 border border-white/10 px-5 py-3 rounded-full w-max text-sm font-bold shadow-lg shadow-black/50">
                    <CheckCircle2 size={18} className="text-[#00FF88]" /> {b}
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:w-1/2 p-4 sm:p-8 lg:p-16 flex flex-col justify-center items-center">
              <form onSubmit={onStep1Submit} className="w-full max-w-[420px] flex flex-col gap-4 sm:gap-5">
                <div className="mb-4">
                  <h2 className="text-3xl font-space-grotesk font-bold">Create your account</h2>
                  <p className="text-[#888] mt-2">Let's start with the basics</p>
                </div>
                {error1 && <div className="text-red-500 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error1}</div>}
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      First Name <span className="text-white/40 font-normal">(الاسم)</span> <span className="text-red-500">*</span>
                    </label>
                    <div className="relative w-full">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="folan"
                        className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none pl-10 pr-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.firstName ? "border-red-500" : "")} />
                    </div>
                    {fieldErrors.firstName && <p className="text-red-500 text-xs">{fieldErrors.firstName}</p>}
                  </div>
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      Last Name <span className="text-white/40 font-normal">(اللقب)</span> <span className="text-red-500">*</span>
                    </label>
                    <div className="relative w-full">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="el folani"
                        className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none pl-10 pr-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.lastName ? "border-red-500" : "")} />
                    </div>
                    {fieldErrors.lastName && <p className="text-red-500 text-xs">{fieldErrors.lastName}</p>}
                  </div>
                </div>

                <div className="flex flex-col gap-2 relative">
                  <label className="text-[11px] font-bold text-[#888]">
                    Phone Number <span className="text-white/40 font-normal">(رقم الهاتف)</span> <span className="text-red-500">*</span>
                  </label>
                  <div className={cn("relative w-full flex items-center h-12 rounded-xl bg-white/5 border border-white/10 overflow-hidden transition-all focus-within:border-[#00FF88] focus-within:ring-[3px] focus-within:ring-[#00FF88]/10", fieldErrors.phone ? "border-red-500" : "")}>
                    <div className="flex items-center gap-1.5 pl-4 pr-3 border-r border-white/10 h-full shrink-0 select-none">
                      <span className="text-base">🇹🇳</span>
                      <span className="text-sm font-bold text-white/80">+216</span>
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
                  {fieldErrors.phone && <p className="text-red-500 text-xs px-4">{fieldErrors.phone}</p>}
                </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <PillInput label="Date of Birth" icon={Calendar} type="date" value={dob} onChange={(e: any) => setDob(e.target.value)} error={fieldErrors.dob} required />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      CIN Number <span className="text-white/40 font-normal">(رقم بطاقة التعريف)</span> <span className="text-red-500">*</span>
                    </label>
                    <div className="relative w-full">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      <input type="text" required value={cinNumber} onChange={(e) => setCinNumber(e.target.value.replace(/\D/g, ''))} placeholder="14045739" maxLength={20}
                        className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none pl-10 pr-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.cinNumber ? "border-red-500" : "")} />
                    </div>
                    {fieldErrors.cinNumber && <p className="text-red-500 text-xs">{fieldErrors.cinNumber}</p>}
                  </div>
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      CIN Issue Date <span className="text-white/40 font-normal">(تاريخ الإصدار)</span> <span className="text-red-500">*</span>
                    </label>
                    <div className="relative w-full">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      <input type="date" required value={cinIssueDate} onChange={(e) => setCinIssueDate(e.target.value)}
                        className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none pl-10 pr-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.cinIssueDate ? "border-red-500" : "")} />
                    </div>
                    {fieldErrors.cinIssueDate && <p className="text-red-500 text-xs">{fieldErrors.cinIssueDate}</p>}
                  </div>
                </div>

                <div className="flex flex-col gap-2 relative">
                  <label className="text-[11px] font-bold text-[#888]">
                    Address <span className="text-white/40 font-normal">(العنوان)</span> <span className="text-red-500">*</span>
                  </label>
                  <input type="text" required value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="123 Rue Habib Bourguiba"
                    className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none px-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.addressLine ? "border-red-500" : "")} />
                  {fieldErrors.addressLine && <p className="text-red-500 text-xs">{fieldErrors.addressLine}</p>}
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      Delegation <span className="text-white/40 font-normal">(المعتمدية)</span> <span className="text-red-500">*</span>
                    </label>
                    <input type="text" required value={delegation} onChange={(e) => setDelegation(e.target.value)} placeholder="Tunis"
                      className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none px-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.delegation ? "border-red-500" : "")} />
                    {fieldErrors.delegation && <p className="text-red-500 text-xs">{fieldErrors.delegation}</p>}
                  </div>
                  <div className="flex-1 flex flex-col gap-2 relative">
                    <label className="text-[11px] font-bold text-[#888]">
                      Governorate <span className="text-white/40 font-normal">(الولاية)</span> <span className="text-red-500">*</span>
                    </label>
                    <input type="text" required value={governorate} onChange={(e) => setGovernorate(e.target.value)} placeholder="Tunis"
                      className={cn("w-full h-12 rounded-xl bg-white/5 border border-white/10 outline-none px-4 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all", fieldErrors.governorate ? "border-red-500" : "")} />
                    {fieldErrors.governorate && <p className="text-red-500 text-xs">{fieldErrors.governorate}</p>}
                  </div>
                </div>

                <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 rounded-xl p-3 flex items-start gap-3">
                  <Smartphone className="w-4 h-4 text-[#00FF88] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#aaa] leading-relaxed">
                    <span className="text-[#00FF88] font-bold">Demo Mode:</span> AI KYC verification is disabled. Identity will be auto-verified after document upload.
                  </p>
                </div>

                <PillInput label="Email Address" icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={(e: any) => setEmail(e.target.value)} error={fieldErrors.email} required />

                <button disabled={loading1} className="w-full h-14 mt-4 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(0,255,136,0.2)]">
                  {loading1 ? <Loader2 className="animate-spin w-5 h-5" /> : "Continue \u2192"}
                </button>
                <div className="text-center mt-2 text-sm text-[#888]">
                  Already have an account? <Link href="/login" className="text-white hover:text-[#00FF88] font-bold">Sign in</Link>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STEP 2 - Set PIN */}
        {step === 2 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            {pinStep === "pin" && (
              <div className="w-full max-w-[440px] text-center z-10">
                <div className="mx-auto w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-6 border border-[#00FF88]/20 shadow-[0_0_40px_rgba(0,255,136,0.15)]">
                  <Lock className="w-8 h-8 text-[#00FF88]" />
                </div>
                <h2 className="text-2xl sm:text-[32px] font-space-grotesk font-bold mb-2">Secure your account</h2>
                <p className="text-[#888] mb-6 sm:mb-8 text-base sm:text-lg">Create a 6-digit PIN for login and payments</p>

                <div className="flex flex-col gap-6">
                  {/* Create PIN */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center">Create 6-digit PIN</label>
                    <div className="flex justify-center items-center gap-1.5 sm:gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <React.Fragment key={i}>
                          {i === 3 && <div className="w-3 sm:w-4 h-px bg-white/20 mx-0.5 sm:mx-1" />}
                          <div className="relative">
                            <input
                              id={`sp-${i}`}
                              type="password"
                              inputMode="numeric"
                              maxLength={1}
                              className={cn(
                                "w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-[#111] border text-center text-base sm:text-lg font-bold text-white outline-none transition-all duration-200 flex items-center justify-center",
                                pin[i]
                                  ? "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]"
                                  : "border-white/10 shadow-none",
                                "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                              )}
                              value={pin[i] || ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val) {
                                  const p = pin.split(""); p[i] = val.slice(-1); setPin(p.join(""));
                                  if (i < 5) document.getElementById(`sp-${i + 1}`)?.focus();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Backspace" && !pin[i] && i > 0) {
                                  document.getElementById(`sp-${i - 1}`)?.focus();
                                } else if (e.key === "Backspace") {
                                  const p = pin.split(""); p[i] = ""; setPin(p.join(""));
                                }
                              }}
                            />
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Confirm PIN */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center">Confirm PIN</label>
                    <div className="flex justify-center items-center gap-1.5 sm:gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <React.Fragment key={i}>
                          {i === 3 && <div className="w-3 sm:w-4 h-px bg-white/20 mx-0.5 sm:mx-1" />}
                          <div className="relative">
                            <input
                              id={`scp-${i}`}
                              type="password"
                              inputMode="numeric"
                              maxLength={1}
                              className={cn(
                                "w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-[#111] border text-center text-base sm:text-lg font-bold text-white outline-none transition-all duration-200 flex items-center justify-center",
                                confirmPin[i]
                                  ? pin === confirmPin
                                    ? "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]"
                                    : "border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
                                  : "border-white/10 shadow-none",
                                "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                              )}
                              value={confirmPin[i] || ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val) {
                                  const p = confirmPin.split(""); p[i] = val.slice(-1); setConfirmPin(p.join(""));
                                  if (i < 5) document.getElementById(`scp-${i + 1}`)?.focus();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Backspace" && !confirmPin[i] && i > 0) {
                                  document.getElementById(`scp-${i - 1}`)?.focus();
                                } else if (e.key === "Backspace") {
                                  const p = confirmPin.split(""); p[i] = ""; setConfirmPin(p.join(""));
                                }
                              }}
                            />
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {confirmPin.length === 6 && (
                      <p className={cn("text-xs text-center font-medium transition-colors", pin === confirmPin ? "text-[#00FF88]" : "text-red-500")}>
                        {pin === confirmPin ? "PINs match" : "PINs do not match"}
                      </p>
                    )}
                  </div>

                  {pinError && <p className="text-red-500 text-sm text-center bg-red-500/10 rounded-xl py-2 px-4 border border-red-500/20">{pinError}</p>}

                  <button onClick={submitPin} disabled={pin.length !== 6 || pin !== confirmPin || loading4} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,255,136,0.25)] mt-2">
                    {loading4 ? <Loader2 className="animate-spin w-5 h-5" /> : "Create Account →"}
                  </button>
                </div>
              </div>
            )}

            {pinStep === "success" && (
              <div className="w-full max-w-[440px] text-center z-10">
                <Loader2 className="animate-spin w-8 h-8 text-[#00FF88] mx-auto mb-4" />
                <p className="text-[#888]">Setting up your account...</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — OTP Verification */}
        {step === 3 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[440px] text-center z-10">
              <div className="mx-auto w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-6 border border-[#00FF88]/20 shadow-[0_0_40px_rgba(0,255,136,0.15)]">
                <Smartphone className="w-8 h-8 text-[#00FF88]" />
              </div>
              <h2 className="text-2xl sm:text-[32px] font-space-grotesk font-bold mb-2">Verify your phone</h2>
              <p className="text-[#888] mb-6 sm:mb-8 text-base sm:text-lg">
                Enter the 6-digit code we sent to your phone to confirm it's yours.
              </p>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center">6-digit code</label>
                  <div className="flex justify-center items-center gap-1.5 sm:gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <React.Fragment key={i}>
                        {i === 3 && <div className="w-3 sm:w-4 h-px bg-white/20 mx-0.5 sm:mx-1" />}
                        <div className="relative">
                          <input
                            id={`otp-${i}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            className={cn(
                              "w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-[#111] border text-center text-base sm:text-lg font-bold text-white outline-none transition-all duration-200 flex items-center justify-center",
                              otp[i] ? "border-[#00FF88]/50 shadow-[0_0_12px_rgba(0,255,136,0.12)]" : "border-white/10 shadow-none",
                              "focus:border-[#00FF88] focus:shadow-[0_0_16px_rgba(0,255,136,0.2)]"
                            )}
                            value={otp[i] || ""}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val) {
                                const o = otp.split(""); o[i] = val.slice(-1); setOtp(o.join(""));
                                if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !otp[i] && i > 0) {
                                document.getElementById(`otp-${i - 1}`)?.focus();
                              } else if (e.key === "Backspace") {
                                const o = otp.split(""); o[i] = ""; setOtp(o.join(""));
                              }
                            }}
                          />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {otpError && (
                  <p className={cn("text-sm text-center rounded-xl py-2 px-4 border", otpError.includes("sent") ? "text-[#00FF88] bg-[#00FF88]/5 border-[#00FF88]/20" : "text-red-500 bg-red-500/10 border-red-500/20")}>
                    {otpError}
                  </p>
                )}

                <button onClick={submitOtp} disabled={otp.length !== 6 || otpLoading} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,255,136,0.25)]">
                  {otpLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify →"}
                </button>

                <button onClick={resendOtp} className="text-[#888] text-sm hover:text-white transition-colors">
                  Didn't receive it? Resend code
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 — Success */}
        {step === 4 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[480px] z-10 pt-10">
              <div className="mx-auto w-20 h-20 bg-[#00FF88] rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_#00FF88]">
                <CheckCircle2 className="w-10 h-10 text-black" />
              </div>
              <h2 className="text-center text-3xl sm:text-[36px] font-space-grotesk font-bold mb-2">Account activated!</h2>
              <p className="text-center text-[#888] mb-6 text-sm">
                Your contract is signed and anchored on the blockchain.
              </p>

              <p className="text-center text-[#888] mb-6 text-sm">
                Your account is created. Complete identity verification to unlock all features and sign your account contract.
              </p>

              {/* Virtual Card */}
              <div className="w-full aspect-[1.58] bg-gradient-to-br from-[#222] to-[#0a0a0a] rounded-2xl sm:rounded-3xl border border-white/10 p-4 sm:p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden mb-6 group">
                <div className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-[#00FF88]/10 blur-[80px] rounded-full" />
                <div className="flex justify-between items-start z-10">
                  <div className="font-space-grotesk font-extrabold text-xl sm:text-2xl tracking-tighter">NexaPay</div>
                  <CreditCard className="text-[#00FF88] w-6 h-6 sm:w-8 sm:h-8 opacity-80" />
                </div>
                <div className="z-10">
                   <p className="font-mono text-lg sm:text-xl tracking-widest mb-1 shadow-sm opacity-90 text-white">•••• •••• •••• {cardLast4}</p>
                   <div className="flex gap-2 sm:gap-4 text-[10px] sm:text-xs font-mono text-[#888]">
                     <span>VALID {cardExpiry}</span>
                     <span>CVV ***</span>
                   </div>
                </div>
                <div className="z-10 flex justify-between items-end mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-white/10">
                  <div>
                    <p className="text-[9px] sm:text-[10px] uppercase text-[#666] tracking-widest font-bold">CARD HOLDER</p>
                    <p className="font-mono text-xs sm:text-sm tracking-widest text-[#bbb]">{((firstName + " " + lastName).trim() || "folan el folani").toUpperCase()}</p>
                  </div>
                  <div className="font-bold text-lg sm:text-xl italic font-serif">{cardType}</div>
                </div>
              </div>

              {/* PIN Display */}
              <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 rounded-2xl p-6 mb-6">
                <p className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-center mb-3">Your PIN Code</p>
                <p className="text-center text-3xl font-mono font-bold tracking-[0.2em] text-[#00FF88]">{pin}</p>
                <p className="text-center text-xs text-[#888] mt-2">Save this PIN. You'll need it for login and payments.</p>
              </div>

              <button onClick={() => router.push("/verify")} className="w-full h-14 rounded-full bg-[#00FF88] text-black font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)] mb-3">
                Verify Identity →
              </button>
              <button onClick={() => router.push("/dashboard")} className="w-full h-12 rounded-full bg-white/5 text-white font-bold flex items-center justify-center hover:bg-white/10 transition-all">
                Go to Dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
