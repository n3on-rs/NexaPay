"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson, postFormData } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, User, Phone, Mail, Lock, Loader2,
  Upload, Camera, CheckCircle2, ChevronDown, Video, CreditCard, Copy, IdCard, Calendar
} from "lucide-react";
import {
  extractToken, extractAddress,
  normalizePhone, isValidTunisianPhone, isValidEmail, isValidCin, isValidDateOfBirth
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
  const [sessionId, setSessionId] = React.useState("");

  // Step 1 State
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [cinNumber, setCinNumber] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);
  const [error1, setError1] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Step 2 State
  const [otp, setOtp] = React.useState("");
  const [loading2, setLoading2] = React.useState(false);
  const [error2, setError2] = React.useState("");
  const [cooldown, setCooldown] = React.useState(59);

  // Step 3 State
  const [docStep, setDocStep] = React.useState<"3A" | "3B" | "3C">("3A");
  const [cinFront, setCinFront] = React.useState<File | null>(null);
  const [cinBack, setCinBack] = React.useState<File | null>(null);
  const [proofAddr, setProofAddr] = React.useState<File | null>(null);
  const [addressLine, setAddressLine] = React.useState("");
  const [governorate, setGovernorate] = React.useState("");
  const [delegation, setDelegation] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [loading3, setLoading3] = React.useState(false);
  const [municipalities, setMunicipalities] = React.useState<any[]>([]);
  const [govLoading, setGovLoading] = React.useState(false);

  // Step 4 State
  const [livenessStep, setLivenessStep] = React.useState<"intro" | "upload" | "processing" | "success" | "pin" | "error">("intro");
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [livenessError, setLivenessError] = React.useState("");

  // Step 5 State
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
  
  React.useEffect(() => {
    if (step === 2 && cooldown > 0) {
      const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(id);
    }
  }, [step, cooldown]);

  // Load Tunisia municipalities for step 3
  React.useEffect(() => {
    if (step !== 3) return;
    const loadGovs = async () => {
      setGovLoading(true);
      try {
        const res = await fetch("/api/municipalities");
        if (res.ok) {
          const data = await res.json();
          setMunicipalities(data);
        }
      } catch { /* ignore */ }
      setGovLoading(false);
    };
    loadGovs();
  }, [step]);

  const onStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    if (!isValidTunisianPhone(phone)) errs.phone = "Enter a valid 8-digit Tunisian phone number";
    if (!isValidEmail(email)) errs.email = "Enter a valid email address";
    if (!isValidDateOfBirth(dob)) errs.dob = "You must be at least 18 years old";
    if (!isValidCin(cinNumber)) errs.cinNumber = "CIN must be at least 6 characters";
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading1(true); setError1(""); setFieldErrors({});
    try {
      const payload = {
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone: normalizePhone(phone),
        email,
        date_of_birth: dob,
        cin_number: cinNumber.trim(),
      };
      console.log('register/init payload:', JSON.stringify(payload));
      const { ok, data } = await postJson("/auth/register/init", payload);
      if (!ok) { setError1(String(data.error || data.message || "Failed to initialize registration")); return; }
      setSessionId(String(data.session_id || ""));
      setStep(2);
    } finally { setLoading1(false); }
  };

  const onStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setLoading2(true); setError2("");
    try {
      const { ok, data } = await postJson("/auth/register/verify-phone", { session_id: sessionId, otp_code: otp });
      if (!ok) { setError2(String(data.error || data.message || "Verification failed")); return; }
      setStep(3);
    } finally { setLoading2(false); }
  };

  const onStep3Submit = async () => {
    if (!cinFront || !cinBack || !proofAddr || !addressLine || !governorate || !delegation || !postalCode) return;
    setLoading3(true);
    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("cin_front", cinFront);
      formData.append("cin_back", cinBack);
      formData.append("proof_of_address", proofAddr);
      formData.append("address_line", addressLine);
      formData.append("delegation", delegation);
      formData.append("governorate", governorate);
      formData.append("postal_code", postalCode);
      
      const { ok } = await postFormData("/auth/register/upload-documents", formData);
      if (!ok) { /* handle error */ }
      setStep(4);
    } finally { setLoading3(false); }
  };

  const submitLiveness = async () => {
    if (!videoFile || !cinFront) return;
    setLivenessStep("processing");
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      fd.append("liveness_video", videoFile);
      fd.append("cin_front", cinFront);

      const { ok, data } = await postFormData("/auth/register/liveness", fd);
      if (!ok) {
        setLivenessStep("error");
        setLivenessError(String(data.error || data.message || "LIVENESS_FACE_MISMATCH"));
        return;
      }
      const address = String(data.address || "");
      const card4 = String(data.card_last4 || "4242");
      const exp = String(data.card_expiry || "12/28");
      const ctype = String(data.card_type || "VISA");
      const ribVal = String(data.rib || "");
      const ibanVal = String(data.iban || "");
      setUserAddress(address);
      setCardLast4(card4);
      setCardExpiry(exp);
      setCardType(ctype);
      setRib(ribVal);
      setIban(ibanVal);
      setStep(5);
    } catch {
      setLivenessStep("error");
      setLivenessError("Network error. Please try again.");
    }
  };

  const submitPin = async () => {
    if (pin.length !== 6 || !pin.match(/^\d{6}$/) || pin !== confirmPin) return;
    setLoading4(true);
    try {
      const { ok, data } = await postJson("/auth/register/set-pin", {
        session_id: sessionId,
        pin,
        pin_confirm: confirmPin,
      });
      if (!ok) {
        setPinError(String(data.error || "Failed to set PIN"));
        return;
      }

      // Auto-login after PIN is set
      const loginRes = await postJson("/auth/login", { phone: normalizePhone(phone), pin });
      if (loginRes.ok && loginRes.data.step === "otp_required") {
        const devOtp = String(loginRes.data.dev_otp || "");
        const otpCode = devOtp || "554433";
        const verifyRes = await postJson("/auth/login/verify-otp", { phone: normalizePhone(phone), otp_code: otpCode });
        if (verifyRes.ok) {
          const token = extractToken(verifyRes.data);
          const addr = extractAddress(verifyRes.data);
          setAuth(token, addr, `${firstName} ${lastName}`.trim());
          setAccountToken(token);
        }
      }

      setPinStep("success");
    } catch {
      setPinError("Network error. Please try again.");
    } finally { setLoading4(false); }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter relative overflow-hidden flex flex-col items-center selection:bg-[#00FF88] selection:text-black">
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#222] z-50">
        <div className="h-full bg-[#00FF88] shadow-[0_0_10px_#00FF88] transition-all duration-500 ease-out" style={{ width: `${(step / 5) * 100}%` }} />
      </div>

      {step > 1 && step < 5 && (
        <button onClick={() => setStep(s => s - 1)} className="absolute top-8 left-8 md:left-12 z-50 p-2 text-[#888] hover:text-white transition-colors bg-white/5 rounded-full">
          <ArrowLeft size={24} />
        </button>
      )}
      <div className="absolute top-8 right-8 md:right-12 z-50 text-[#888] font-bold text-sm tracking-wider font-space-grotesk">
        STEP {step} OF 5
      </div>

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
                      <ChevronDown className="w-3 h-3 text-[#888] hidden sm:block" />
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
                  <div className="flex-1">
                    <PillInput label="CIN Number" icon={IdCard} placeholder="ID number" value={cinNumber} onChange={(e: any) => setCinNumber(e.target.value)} error={fieldErrors.cinNumber} required />
                  </div>
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

        {/* STEP 2 */}
        {step === 2 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[420px] text-center">
              <div className="mx-auto w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-8 border lg border-[#00FF88]/20 relative">
                <Phone className="w-8 h-8 text-[#00FF88]" />
                <div className="absolute -inset-4 border border-[#00FF88]/20 rounded-full animate-ping" style={{animationDuration: '3s'}} />
              </div>
              <h2 className="text-2xl sm:text-[32px] font-space-grotesk font-bold mb-2">Enter the code</h2>
              <p className="text-[#888] mb-8 sm:mb-10 text-base sm:text-lg">Sent to +216 {phone.slice(0,3)} •••• {phone.slice(-2)}</p>

              <form onSubmit={onStep2Submit}>
                <div className="flex justify-center gap-2 sm:gap-3 mb-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input
                      key={i} id={`otp-${i}`} type="text" maxLength={1}
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
                          const newOtp = otp.split(""); newOtp[i] = val.slice(-1); setOtp(newOtp.join(""));
                          if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus();
                        else if (e.key === "Backspace") {
                          const newOtp = otp.split(""); newOtp[i] = ""; setOtp(newOtp.join(""));
                        }
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-center gap-1 mb-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300", otp[i] ? "bg-[#00FF88] scale-110" : "bg-white/20")} />
                  ))}
                </div>
                {error2 && <p className="text-red-500 text-sm mb-4 text-center bg-red-500/10 rounded-xl py-2 px-4 border border-red-500/20">{error2}</p>}

                <div className="text-sm font-medium mb-8">
                  {cooldown > 0 ? <span className="text-[#00FF88]">Resend in {cooldown}s</span> : <button type="button" onClick={() => setCooldown(59)} className="text-[#888] hover:text-white underline underline-offset-4 pointer-events-auto">Resend code</button>}
                </div>

                <button disabled={loading2 || otp.length < 6} type="submit" className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(0,255,136,0.2)]">
                  {loading2 ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify \u2192"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* STEP 3 - Document Upload */}
        {step === 3 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 animate-in slide-in-from-right duration-500">
             <div className="fixed inset-0 pointer-events-none flex justify-center items-center">
                <div className="w-[600px] h-[600px] bg-[#00FF88] opacity-[0.03] blur-[100px] rounded-full" />
              </div>
            <div className="w-full max-w-[480px]">
              <h2 className="text-2xl sm:text-3xl font-space-grotesk font-bold text-center mb-6 sm:mb-8">
                {docStep === "3C" ? "Proof of Address" : "Upload your CIN"}
              </h2>

              {/* Upload Zone */}
              <div className={cn("relative w-full aspect-[1.6] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-all bg-[#111]", (docStep === "3A" && cinFront) || (docStep === "3B" && cinBack) || (docStep === "3C" && proofAddr) ? "border-[#00FF88] bg-[#00FF88]/5" : "border-[#00FF88]/30 hover:border-[#00FF88]/50")}>
                
                {((docStep === "3A" && cinFront) || (docStep === "3B" && cinBack) || (docStep === "3C" && proofAddr)) ? (
                  <div className="text-center animate-in zoom-in-75 flex flex-col items-center">
                    <div className="w-16 h-16 bg-[#00FF88] rounded-full flex items-center justify-center mb-4 shadow-[0_0_30px_#00FF88]">
                      <CheckCircle2 className="w-8 h-8 text-[#080808]" />
                    </div>
                    <p className="font-bold text-lg text-white">Document captured</p>
                    <p className="text-sm text-[#00FF88] mt-1 font-mono">
                      {docStep === "3A" && cinFront?.name}
                      {docStep === "3B" && cinBack?.name}
                      {docStep === "3C" && proofAddr?.name}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Viewfinder brackets */}
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-[3px] border-l-[3px] border-[#00FF88] rounded-tl-lg" />
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-[3px] border-r-[3px] border-[#00FF88] rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-[3px] border-l-[3px] border-[#00FF88] rounded-bl-lg" />
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-[3px] border-r-[3px] border-[#00FF88] rounded-br-lg" />
                    
                    <IdCard className="w-20 h-20 text-white/20 mb-4 stroke-[1]" />
                    <div className="text-xl font-space-grotesk font-bold text-center">
                      {docStep === "3A" && "CIN Front"}
                      {docStep === "3B" && "CIN Back"}
                      {docStep === "3C" && "Utility Bill or Bank Statement"}
                    </div>
                    <p className="text-sm text-[#888] mt-2">Tap to select or take photo</p>
                  </>
                )}
                
                <input 
                  type="file" accept="image/*,application/pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (docStep === "3A") setCinFront(f);
                    if (docStep === "3B") setCinBack(f);
                    if (docStep === "3C") setProofAddr(f);
                  }}
                />
              </div>

              <p className="text-center text-xs text-[#666] font-bold tracking-widest mt-6 uppercase flex items-center justify-center gap-2">
                <Lock size={12}/> Your data is encrypted
              </p>

              {docStep === "3C" && proofAddr && (
                <div className="mt-8 flex flex-col gap-4 animate-in slide-in-from-top-4 fade-in">
                  <PillInput label="Street Address" placeholder="123 Avenue Habib Bourguiba" value={addressLine} onChange={(e:any) => setAddressLine(e.target.value)} />
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 flex flex-col gap-2 relative">
                      <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">Governorate</label>
                      <div className="relative">
                        <select
                          className="w-full h-14 rounded-full bg-white/5 border border-white/10 px-6 pr-10 appearance-none outline-none font-inter text-base text-white focus:border-[#00FF88] transition-all disabled:opacity-50"
                          value={governorate}
                          onChange={(e) => { setGovernorate(e.target.value); setDelegation(""); }}
                          disabled={govLoading}
                        >
                          <option value="" disabled className="bg-[#111] text-white">Select...</option>
                          {municipalities.map((m: any) => (
                            <option key={m.Value} value={m.Value} className="bg-[#111] text-white">{m.Name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-2 relative">
                      <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold">Delegation</label>
                      <div className="relative">
                        <select
                          className="w-full h-14 rounded-full bg-white/5 border border-white/10 px-6 pr-10 appearance-none outline-none font-inter text-base text-white focus:border-[#00FF88] transition-all disabled:opacity-50"
                          value={delegation}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDelegation(val);
                            const gov = municipalities.find((m: any) => m.Value === governorate);
                            const del = gov?.Delegations?.find((d: any) => d.Value === val);
                            if (del?.PostalCode) setPostalCode(String(del.PostalCode));
                          }}
                          disabled={!governorate}
                        >
                          <option value="" disabled className="bg-[#111] text-white">Select...</option>
                          {(() => {
                            const gov = municipalities.find((m: any) => m.Value === governorate);
                            return (gov?.Delegations || []).map((d: any, idx: number) => (
                              <option key={`${idx}-${d.Value}`} value={d.Value} className="bg-[#111] text-white">{d.Name}</option>
                            ));
                          })()}
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888] pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="w-[120px]">
                    <PillInput label="Postal" placeholder="1000" value={postalCode} readOnly className="opacity-70" />
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-center">
                {docStep === "3A" && cinFront && (
                  <button onClick={() => setDocStep("3B")} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all animate-in slide-in-from-bottom flex justify-center items-center">
                    Looks good \u2192
                  </button>
                )}
                {docStep === "3B" && cinBack && (
                  <button onClick={() => setDocStep("3C")} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all animate-in slide-in-from-bottom flex justify-center items-center">
                    Looks good \u2192
                  </button>
                )}
                {docStep === "3C" && proofAddr && addressLine && governorate && delegation && postalCode && (
                  <button onClick={onStep3Submit} disabled={loading3} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg transition-all animate-in slide-in-from-bottom flex justify-center items-center gap-2">
                    {loading3 ? <Loader2 className="animate-spin" /> : "Continue \u2192"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 - Full scale liveness & Success */}
        {step === 4 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 min-h-[600px] animate-in slide-in-from-right duration-500 relative">
            <div className="fixed inset-0 pointer-events-none flex justify-center items-center">
              <div className="w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(0,255,136,0.1)_0%,transparent_60%)]" />
            </div>

            {livenessStep === "intro" && (
              <div className="w-full max-w-[420px] text-center z-10">
                <div className="mx-auto w-32 h-32 relative mb-8 flex items-center justify-center">
                  <div className="absolute inset-0 border border-[#00FF88]/30 rounded-full animate-ping shadow-[0_0_50px_#00FF88] shadow-[#00FF88]/20" style={{ animationDuration: '3s'}} />
                  <div className="w-24 h-24 border-[2px] border-dashed border-[#00FF88] rounded-full flex items-center justify-center">
                    <User className="w-10 h-10 text-[#00FF88]" />
                  </div>
                </div>
                <h2 className="text-3xl sm:text-[36px] font-space-grotesk font-bold leading-tight mb-4">Verify your identity</h2>
                <p className="text-[#888] mb-8 sm:mb-10 text-base sm:text-lg">We'll match your face with your CIN photo for security.</p>
                
                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left mb-10">
                   <div className="flex items-center gap-4 mb-4">
                     <span className="w-6 h-6 rounded-full bg-[#00FF88]/10 text-[#00FF88] flex items-center justify-center text-sm font-bold">1</span>
                     <span className="text-white font-medium">Look straight at camera</span>
                   </div>
                   <div className="flex items-center gap-4 mb-4">
                     <span className="w-6 h-6 rounded-full bg-[#00FF88]/10 text-[#00FF88] flex items-center justify-center text-sm font-bold">2</span>
                     <span className="text-white font-medium">Slowly turn head left/right</span>
                   </div>
                   <div className="flex items-center gap-4">
                     <span className="w-6 h-6 rounded-full bg-[#00FF88]/10 text-[#00FF88] flex items-center justify-center text-sm font-bold">3</span>
                     <span className="text-white font-medium">Blink twice</span>
                   </div>
                </div>

                <button onClick={() => setLivenessStep("upload")} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]">
                  Start verification \u2192
                </button>
              </div>
            )}

            {livenessStep === "upload" && (
               <div className="w-full max-w-[480px] z-10 animate-in fade-in">
                 <h2 className="text-2xl font-space-grotesk font-bold mb-6 text-center">Capture your identity</h2>
                 
                 <div className="flex flex-col gap-6">
                   <div className={cn("relative w-full h-[200px] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-all bg-[#111]", videoFile ? "border-[#00FF88] bg-[#00FF88]/5" : "border-[#00FF88]/30")}>
                      {videoFile ? (
                        <div className="text-center text-[#00FF88]">
                          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" />
                          <p className="font-bold">Liveness Video Ready</p>
                          <p className="text-xs mt-1">{videoFile.name}</p>
                        </div>
                      ) : (
                        <>
                          <Video className="w-12 h-12 text-[#888] mb-3" />
                          <p className="font-bold text-white">Record Liveness Video</p>
                          <p className="text-sm text-[#888]">MP4 or WEBM, max 10s</p>
                        </>
                      )}
                      <input type="file" accept="video/mp4,video/webm" capture="user" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                   </div>

                   <div className="relative w-full h-[120px] rounded-3xl border-2 border-dashed border-[#00FF88]/30 bg-[#111] flex items-center px-6 gap-6">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-[#00FF88]/30">
                        <Camera className="w-6 h-6 text-[#00FF88]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white text-lg">CIN Front Photo</p>
                        <p className="text-xs text-[#888]">Using photo from Step 3 <span className="text-[#00FF88]">✓</span></p>
                      </div>
                   </div>
                 </div>

                 {videoFile && (
                   <button onClick={submitLiveness} className="w-full h-14 mt-10 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center transition-all">
                     Submit for verification \u2192
                   </button>
                 )}
               </div>
            )}

            {livenessStep === "processing" && (
              <div className="w-full text-center z-10 flex flex-col items-center justify-center h-full animate-in zoom-in">
                <div className="relative w-40 h-56 mb-8 flex justify-center">
                   <div className="absolute inset-x-0 h-1 bg-[#00FF88] animate-[scan_2s_ease-in-out_infinite] blur-[2px]" />
                   <div className="absolute inset-x-0 h-1 bg-[#00FF88] animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_20px_#00FF88]" />
                   <div className="w-full h-full border-[3px] border-[#00FF88] rounded-[60px] opacity-20 relative overflow-hidden">
                     {/* Dashed line inside */}
                     <div className="absolute inset-4 border border-dashed border-[#00FF88] rounded-[45px] opacity-40" />
                   </div>
                </div>
                <h2 className="text-[28px] font-space-grotesk font-bold">Analyzing your identity...</h2>
                <p className="text-[#00FF88] mt-2 font-mono">Processing neural scan sequence</p>
                <style>{`
                  @keyframes scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }
                `}</style>
              </div>
            )}

            {livenessStep === "error" && (
              <div className="w-full max-w-[420px] text-center z-10">
                <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                  <div className="text-red-500 text-4xl">!</div>
                </div>
                <h2 className="text-3xl font-space-grotesk font-bold mb-4">Verification failed</h2>
                <p className="text-[#888] mb-8 bg-red-500/5 border border-red-500/20 p-4 rounded-xl">{livenessError}</p>
                <button onClick={() => setLivenessStep("upload")} className="w-full h-14 rounded-full bg-white/10 text-white font-bold text-lg hover:bg-white/20 transition-all">
                  Try again
                </button>
              </div>
            )}

            {livenessStep === "success" && (
              <div className="w-full max-w-[480px] z-10 animate-in fade-in slide-in-from-bottom pt-10">
                <div className="mx-auto w-20 h-20 bg-[#00FF88] rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_#00FF88]">
                  <CheckCircle2 className="w-10 h-10 text-black" />
                </div>
                <h2 className="text-center text-3xl sm:text-[36px] font-space-grotesk font-bold mb-6 sm:mb-8">Account created! 🎉</h2>
                
                {/* Virtual Card */}
                <div className="w-full aspect-[1.58] bg-gradient-to-br from-[#222] to-[#0a0a0a] rounded-2xl sm:rounded-3xl border border-white/10 p-4 sm:p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden mb-10 group">
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

              </div>
            )}
          </div>
        )}

        {/* STEP 5 - Set PIN */}
        {step === 5 && (
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
              <div className="w-full max-w-[480px] z-10 animate-in fade-in slide-in-from-bottom pt-10">
                <div className="mx-auto w-20 h-20 bg-[#00FF88] rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_#00FF88]">
                  <CheckCircle2 className="w-10 h-10 text-black" />
                </div>
                <h2 className="text-center text-3xl sm:text-[36px] font-space-grotesk font-bold mb-6 sm:mb-8">Account created! 🎉</h2>
                
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

                <button onClick={() => router.push("/dashboard")} className="w-full h-14 rounded-full bg-[#00FF88] text-black font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]">
                  Enter App \u2192
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
