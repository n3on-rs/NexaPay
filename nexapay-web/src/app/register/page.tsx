"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson, getJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, ArrowDown, Check, Loader2 } from "lucide-react";
import { extractToken, normalizePhone, isValidTunisianPhone, isValidEmail, isValidDateOfBirth } from "@/lib/auth-utils";
import { useAuth } from "@/contexts/auth-context";
import SignatureCanvas from "@/components/signature-canvas";

const STEPS = ["Phone", "Details", "Identity", "Sign", "PIN"];

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [step, setStep] = React.useState(0);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  // Step 0: Phone
  const [phone, setPhone] = React.useState("");

  // Step 1: Details
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dob, setDob] = React.useState("");

  // Step 2: Identity
  const [cinNumber, setCinNumber] = React.useState("");
  const [cinIssueDate, setCinIssueDate] = React.useState("");

  // Step 3: E-Sign
  const [contractText, setContractText] = React.useState("");
  const [contractDocHash, setContractDocHash] = React.useState("");
  const [signatureBase64, setSignatureBase64] = React.useState("");
  const [signatureType, setSignatureType] = React.useState<"draw" | "type">("draw");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [signedDocId, setSignedDocId] = React.useState("");
  const [esignLoading, setEsignLoading] = React.useState(false);
  const [contractLoading, setContractLoading] = React.useState(false);
  const [signSuccess, setSignSuccess] = React.useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = React.useState(false);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const contractScrollRef = React.useRef<HTMLDivElement>(null);

  // Step 4: PIN
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");

  // Account details after init
  const [accountToken, setAccountToken] = React.useState("");
  const [userAddress, setUserAddress] = React.useState("");
  const [cardLast4, setCardLast4] = React.useState("4242");
  const [cardExpiry, setCardExpiry] = React.useState("12/28");
  const [cardType, setCardType] = React.useState("VISA");
  const fullName = `${firstName} ${lastName}`.trim();

  const goNext = () => { setDirection("forward"); setStep((s) => Math.min(s + 1, 5)); };
  const goBack = () => { setDirection("back"); setError(""); setStep((s) => Math.max(s - 1, 0)); };

  const canSubmitStep0 = isValidTunisianPhone(phone);
  const canSubmitStep1 = firstName.trim() && lastName.trim() && isValidEmail(email) && isValidDateOfBirth(dob);
  const canSubmitStep2 = cinNumber.trim().length >= 6 && cinIssueDate;
  const canSubmitStep3 = signatureBase64.length > 0 && termsAccepted && !esignLoading;
  const canSubmitStep4 = pin.length === 6 && /^\d{6}$/.test(pin) && pin === confirmPin;

  // ─── Step 0 → Step 1: Just advance ───
  const submitPhone = () => {
    if (!canSubmitStep0) return;
    goNext();
  };

  // ─── Step 2 → Step 3: Init registration + fetch contract ───
  const submitIdentity = async () => {
    if (!canSubmitStep2) return;
    setLoading(true); setError("");
    try {
      const { ok, data } = await postJson("/auth/register/init", {
        full_name: fullName,
        phone: normalizePhone(phone),
        email: email,
        date_of_birth: dob,
        cin_number: cinNumber,
        cin_issue_date: cinIssueDate,
      });
      if (ok) {
        const addr = String(data.address || "");
        const tok = extractToken(data);
        if (addr) setUserAddress(addr);
        if (tok) {
          setAccountToken(tok);
          // Persist token early so e-sign endpoints work
          const { persistSession } = await import("@/lib/auth-utils");
          persistSession(tok, addr, fullName, phone);
        }
        setCardLast4(String(data.card_last4 || "4242"));
        setCardExpiry(String(data.card_expiry || "12/28"));
        setCardType(String(data.card_type || "VISA"));
        await fetchContract(addr, tok);
      } else {
        setError(String(data.error || data.message || "Registration failed"));
      }
    } finally { setLoading(false); }
  };

  // ─── Fetch contract text from backend ───
  const fetchContract = async (address: string, token: string) => {
    setContractLoading(true);
    try {
      const { ok, data } = await getJson(
        `/accounts/${address}/esign/contract`,
        { "X-Account-Token": token }
      );
      if (ok) {
        setContractText(String(data.contract_text || ""));
        setContractDocHash(String(data.doc_hash || ""));
        goNext();
      } else {
        setError("Failed to load contract. Please try again.");
        setStep(2); // stay on identity step
      }
    } catch {
      setError("Network error loading contract.");
    } finally {
      setContractLoading(false);
    }
  };

  // ─── Scroll tracking for contract review ───
  const handleContractScroll = React.useCallback(() => {
    const el = contractScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const progress = Math.min(((scrollTop + clientHeight) / scrollHeight) * 100, 100);
    setScrollProgress(progress);
    if (scrollHeight - scrollTop - clientHeight < 50) {
      setHasScrolledToBottom(true);
    }
  }, []);

  // ─── Submit e-signature ───
  const submitEsign = async () => {
    if (!canSubmitStep3) return;
    setEsignLoading(true); setError("");
    try {
      const { ok, data } = await postJson(
        `/accounts/${userAddress}/esign/account`,
        {
          signature_image_base64: signatureBase64,
          signature_type: signatureType,
          terms_accepted: termsAccepted,
        },
        { "X-Account-Token": accountToken }
      );
      if (ok) {
        const docId = String(data.document_id || "");
        setSignedDocId(docId);
        setSignSuccess(true);
        triggerPdfDownload(userAddress, docId);
      } else {
        setError(String(data.error || "Signing failed"));
      }
    } catch {
      setError("Network error during signing.");
    } finally {
      setEsignLoading(false);
    }
  };

  // ─── PDF Download via fetch+blob ───
  const triggerPdfDownload = (address: string, docId: string) => {
    fetch(`/api/accounts/${address}/esign/account/${docId}/pdf`, {
      headers: { "X-Account-Token": accountToken },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nexapay-contract-${docId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => { /* silently skip - user can download later */ });
  };

  // ─── Step 4 → Submit PIN ───
  const submitPin = async () => {
    if (!canSubmitStep4) return;
    setLoading(true); setError("");
    try {
      const payload: Record<string, unknown> = { address: userAddress, pin, pin_confirm: confirmPin };
      const { ok, data } = await postJson("/auth/register/set-pin", payload);
      if (!ok) { setError(String(data.error || "Failed to set PIN")); return; }
      const token = extractToken(data);
      if (token) setAuth(token, userAddress, fullName, phone);
      goNext();
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  };

  // Auto-redirect after success (step 5)
  React.useEffect(() => {
    if (step === 5) {
      const t = setTimeout(() => router.push("/dashboard"), 2500);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  const animClass = direction === "forward" ? "animate-in fade-in slide-in-from-right-4 duration-300" : "animate-in fade-in slide-in-from-left-4 duration-300";

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white flex flex-col items-center selection:bg-[#00d4aa] selection:text-black">
      {/* Progress */}
      {step < 5 && (
        <div className="w-full max-w-[420px] mt-8 px-6">
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all",
                    i < step ? "bg-[#00d4aa] text-black" :
                    i === step ? "bg-[#00d4aa]/20 text-[#00d4aa] ring-2 ring-[#00d4aa]/30" :
                    "bg-white/[0.04] text-white/25"
                  )}>
                    {i < step ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={cn("text-[11px] font-medium hidden sm:inline", i <= step ? "text-white/70" : "text-white/20")}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn("h-px flex-1 min-w-4", i < step ? "bg-[#00d4aa]/50" : "bg-white/[0.06]")} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < 5 && (
        <div className="w-full max-w-[420px] px-6 mb-2">
          <button onClick={goBack} className="inline-flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        </div>
      )}

      <div className="flex-1 flex items-start justify-center w-full px-6 pt-2">
        <div key={step} className={cn("w-full max-w-[420px]", animClass)}>

          {/* STEP 0: Phone */}
          {step === 0 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Enter your phone number</h1>
                <p className="mt-1.5 text-[14px] text-white/40">We'll use this to secure your account.</p>
              </div>

              <div className="relative flex items-center h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden transition-all focus-within:border-[#00d4aa]/50 focus-within:ring-2 focus-within:ring-[#00d4aa]/10">
                <div className="flex items-center gap-1.5 pl-4 pr-3 border-r border-white/[0.08] h-full shrink-0">
                  <span className="text-base">🇹🇳</span>
                  <span className="text-sm font-semibold text-white/70">+216</span>
                </div>
                <input
                  type="tel" maxLength={10} autoFocus
                  className="flex-1 h-full bg-transparent outline-none px-4 text-base font-medium text-white placeholder:text-white/20 tracking-[0.03em]"
                  value={phone.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{4})/, '$1 $2 $3')}
                  onChange={(e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 8); setPhone(raw); }}
                  placeholder="55 000 000"
                  onKeyDown={(e) => { if (e.key === "Enter" && canSubmitStep0) submitPhone(); }}
                />
              </div>

              {error && <p className="text-red-400 text-[13px] bg-red-500/5 border border-red-500/10 rounded-lg p-3">{error}</p>}

              <button
                onClick={submitPhone}
                disabled={!canSubmitStep0}
                className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>

              <p className="text-center text-[13px] text-white/30">
                Already have an account? <Link href="/login" className="text-[#00d4aa] font-medium hover:underline">Log in</Link>
              </p>
            </div>
          )}

          {/* STEP 1: Personal Details */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Tell us about yourself</h1>
                <p className="mt-1.5 text-[14px] text-white/40">We need a few details to create your account.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">First name</label>
                  <input type="text" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Folan"
                    className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white placeholder:text-white/15 outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Last name</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    placeholder="El Folani"
                    className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white placeholder:text-white/15 outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white placeholder:text-white/15 outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Date of birth</label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                  className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all [color-scheme:dark]" />
              </div>

              <button
                onClick={goNext}
                disabled={!canSubmitStep1}
                className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30 disabled:cursor-not-allowed mt-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Identity */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Verify your identity</h1>
                <p className="mt-1.5 text-[14px] text-white/40">We need your CIN to verify your identity per Tunisian regulations.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">CIN Number</label>
                <input type="text" autoFocus value={cinNumber} onChange={(e) => setCinNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="14045739" maxLength={20}
                  className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white placeholder:text-white/15 tracking-[0.05em] outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">CIN Issue Date</label>
                <input type="date" value={cinIssueDate} onChange={(e) => setCinIssueDate(e.target.value)}
                  className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-[15px] text-white outline-none focus:border-[#00d4aa]/50 focus:ring-2 focus:ring-[#00d4aa]/10 transition-all [color-scheme:dark]" />
              </div>

              {error && <p className="text-red-400 text-[13px] bg-red-500/5 border border-red-500/10 rounded-lg p-3">{error}</p>}

              <button
                onClick={submitIdentity}
                disabled={!canSubmitStep2 || loading}
                className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>

              <p className="text-center text-[12px] text-white/25">
                Address details can be added later from your profile settings.
              </p>
            </div>
          )}

          {/* STEP 3: E-Sign Contract */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Review & Sign Contract</h1>
                <p className="mt-1.5 text-[14px] text-white/40">Please read the account opening agreement below, then sign to accept.</p>
              </div>

              {contractLoading ? (
                <div className="flex items-center justify-center gap-3 h-64">
                  <Loader2 className="animate-spin h-5 w-5 text-[#00d4aa]" />
                  <span className="text-white/50 text-sm">Loading contract...</span>
                </div>
              ) : (
                <>
                  {/* Contract text */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00d4aa] rounded-full transition-all duration-200"
                          style={{ width: `${scrollProgress}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/40">
                        {hasScrolledToBottom ? "Read fully" : `${Math.round(scrollProgress)}%`}
                      </span>
                    </div>
                    <div
                      ref={contractScrollRef}
                      onScroll={handleContractScroll}
                      className="h-72 overflow-y-auto rounded-xl bg-white/[0.02] border border-white/[0.08] p-4 text-[12px] leading-relaxed text-white/65 font-mono whitespace-pre-wrap"
                    >
                      {contractText}
                    </div>
                    {!hasScrolledToBottom && (
                      <div className="flex items-center justify-center gap-2 mt-2 text-xs text-white/30 animate-pulse">
                        <ArrowDown className="h-3 w-3" /> Scroll to the bottom to continue <ArrowDown className="h-3 w-3" />
                      </div>
                    )}
                    {hasScrolledToBottom && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-[#00d4aa] font-medium">
                        <Check className="h-3 w-3" /> You have reached the end of the contract
                      </div>
                    )}
                  </div>

                  {/* Signature section (visible after scroll-to-bottom) */}
                  {hasScrolledToBottom && !signSuccess && (
                    <>
                      <div className="border-t border-white/[0.06] pt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">Your Signature</p>
                        <SignatureCanvas
                          onChange={(dataUrl) => setSignatureBase64(dataUrl)}
                          onModeChange={(mode) => setSignatureType(mode)}
                        />
                      </div>

                      {/* Terms checkbox */}
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 rounded border-white/25 bg-[#0a0b0e] text-[#00d4aa] focus:ring-[#00d4aa]/40 focus:ring-offset-0"
                        />
                        <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">
                          I confirm that I have read, understood, and agree to the{" "}
                          <span className="text-[#00d4aa]">NexaPay Account Opening Agreement</span>, including
                          the fee schedule, transaction limits, and data processing terms. My electronic signature
                          constitutes a legally binding agreement under Tunisian Law No. 2002-50 on Electronic
                          Exchanges and Commerce.
                        </span>
                      </label>

                      {error && <p className="text-red-400 text-[13px] bg-red-500/5 border border-red-500/10 rounded-lg p-3">{error}</p>}

                      <button
                        onClick={submitEsign}
                        disabled={!canSubmitStep3}
                        className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {esignLoading ? (
                          <><Loader2 className="animate-spin h-4 w-4" /> Signing contract...</>
                        ) : (
                          <>Sign & Submit <ArrowRight className="h-4 w-4" /></>
                        )}
                      </button>
                    </>
                  )}

                  {/* Success state */}
                  {signSuccess && (
                    <div className="flex flex-col items-center gap-4 py-4">
                      <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 flex items-center justify-center">
                        <Check className="h-8 w-8 text-[#00d4aa]" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-white">Contract signed successfully</p>
                        <p className="mt-1 text-[13px] text-white/40">A signed PDF copy has been downloaded to your device.</p>
                        <p className="mt-1 text-[11px] text-[#00d4aa]/60 font-mono break-all">Doc ID: {signedDocId}</p>
                      </div>
                      <button
                        onClick={goNext}
                        className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 w-full mt-2"
                      >
                        Continue to PIN Setup <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 4: PIN */}
          {step === 4 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Set your PIN</h1>
                <p className="mt-1.5 text-[14px] text-white/40">Choose a 6-digit code for login and payments.</p>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Your PIN</label>
                  <div className="flex justify-center gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <React.Fragment key={i}>
                        {i === 3 && <div className="w-3 h-px bg-white/10 self-center" />}
                        <input
                          id={`rp-${i}`}
                          type="password" inputMode="numeric" maxLength={1} autoFocus={i === 0}
                          className={cn(
                            "w-11 h-11 rounded-xl bg-white/[0.04] border text-center text-lg font-semibold text-white outline-none transition-all",
                            pin[i] ? "border-[#00d4aa]/50" : "border-white/[0.08]",
                            "focus:border-[#00d4aa] focus:ring-2 focus:ring-[#00d4aa]/10"
                          )}
                          value={pin[i] || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            if (!val) return;
                            const newPin = pin.split("");
                            newPin[i] = val;
                            setPin(newPin.join(""));
                            if (i < 5) document.getElementById(`rp-${i + 1}`)?.focus();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !pin[i] && i > 0) {
                              document.getElementById(`rp-${i - 1}`)?.focus();
                            }
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Confirm PIN</label>
                  <div className="flex justify-center gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <React.Fragment key={i}>
                        {i === 3 && <div className="w-3 h-px bg-white/10 self-center" />}
                        <input
                          id={`rcp-${i}`}
                          type="password" inputMode="numeric" maxLength={1}
                          className={cn(
                            "w-11 h-11 rounded-xl bg-white/[0.04] border text-center text-lg font-semibold text-white outline-none transition-all",
                            confirmPin[i] ? (
                              pin[i] === confirmPin[i] ? "border-[#00d4aa]/50" : "border-red-500/50"
                            ) : "border-white/[0.08]",
                            "focus:border-[#00d4aa] focus:ring-2 focus:ring-[#00d4aa]/10"
                          )}
                          value={confirmPin[i] || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            if (!val) return;
                            const newPin = confirmPin.split("");
                            newPin[i] = val;
                            setConfirmPin(newPin.join(""));
                            if (i < 5) document.getElementById(`rcp-${i + 1}`)?.focus();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !confirmPin[i] && i > 0) {
                              document.getElementById(`rcp-${i - 1}`)?.focus();
                            }
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {confirmPin.length === 6 && (
                  <p className={cn("text-center text-[12px] font-medium", pin === confirmPin ? "text-[#00d4aa]" : "text-red-400")}>
                    {pin === confirmPin ? "PINs match" : "PINs don't match"}
                  </p>
                )}

                {error && <p className="text-center text-[13px] text-red-400">{error}</p>}

                <button
                  onClick={submitPin}
                  disabled={!canSubmitStep4 || loading}
                  className="flex items-center justify-center gap-2 h-14 rounded-xl bg-[#00d4aa] text-black font-semibold text-[15px] transition-all hover:bg-[#00d4aa]/90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : "Create account"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Success */}
          {step === 5 && (
            <div className="flex flex-col items-center gap-6 py-10">
              <div className="w-20 h-20 rounded-full bg-[#00d4aa]/10 flex items-center justify-center">
                <Check className="h-10 w-10 text-[#00d4aa]" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Account created</h1>
                <p className="mt-2 text-[14px] text-white/40">Welcome to NexaPay. Redirecting to your dashboard...</p>
              </div>

              {/* Card preview */}
              <div className="w-full h-52 rounded-2xl bg-gradient-to-br from-[#1c1c1c] to-[#0f0f0f] border border-white/[0.06] relative overflow-hidden p-6 flex flex-col justify-between">
                <div className="absolute top-[-30px] right-[-30px] w-40 h-40 bg-[#00d4aa] rounded-full blur-[60px] opacity-20" />
                <div className="relative z-10 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">NexaPay</span>
                  <span className="text-[11px] font-semibold text-white/50">{cardType}</span>
                </div>
                <div className="relative z-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/30 mb-0.5">Card number</p>
                  <p className="font-space-grotesk text-[16px] font-bold tracking-[0.15em] text-white/80">
                    •••• •••• •••• {cardLast4}
                  </p>
                </div>
                <div className="relative z-10 flex items-center gap-8">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-0.5">Expiry</p>
                    <p className="text-[13px] font-bold text-white/70">{cardExpiry}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-0.5">Holder</p>
                    <p className="text-[13px] font-bold text-white/70">{fullName || "NexaPay User"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
