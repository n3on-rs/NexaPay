"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import {
  OtpInputSix,
  PinInputFour,
} from "@/components/auth/otp-inputs";
import { PhoneInputTN } from "@/components/auth/phone-input-tn";
import { RequiredLabel } from "@/components/auth/required-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postFormData, postJson } from "@/lib/api";
import {
  extractAddress,
  extractToken,
  formatFileSize,
  maskPhoneDisplay,
  messageFromResponse,
  persistSession,
} from "@/lib/auth-utils";
import { TUNISIA_GOVERNORATES } from "@/lib/tunisia-governorates";
import { cn } from "@/lib/utils";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  FileUp,
  X,
} from "lucide-react";

const ACCENT = "#00FF88";

const regField =
  "h-12 rounded-xl border border-white/[0.08] bg-[#0a0b0e] px-3.5 text-sm text-white outline-none transition placeholder:text-white/35 focus-visible:border-[#00FF88]/55 focus-visible:ring-2 focus-visible:ring-[#00FF88]/15";

function isApproved(data: Record<string, unknown>): boolean {
  const s = data.status ?? data.approval_status ?? data.result;
  return s === "APPROVED" || s === "approved";
}

function parseApproved(data: Record<string, unknown>) {
  return {
    address: String(data.address ?? ""),
    rib: String(data.rib ?? data.RIB ?? ""),
    iban: String(data.iban ?? data.IBAN ?? ""),
    card_last4: String(data.card_last4 ?? data.cardLast4 ?? ""),
  };
}

type UploadSlotProps = {
  label: string;
  accept: string;
  file: File | null;
  error?: string;
  onFile: (f: File | null) => void;
};

function UploadSlot({ label, accept, file, error, onFile }: UploadSlotProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);

  function pickFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    onFile(f);
  }

  return (
    <div className="space-y-2">
      <Label className="text-white/80">{label}</Label>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pickFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors",
          drag ? "border-[#00FF88]/60 bg-[#00FF88]/5" : "border-white/15 bg-[#121212]/50",
          error && "border-red-500/80",
        )}
      >
        <FileUp className="mb-2 size-8 text-white/35" />
        <span className="text-center text-sm font-medium text-white/80">
          {label}
        </span>
        <span className="mt-1 text-center text-xs text-white/40">
          Click or drag to upload
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />
      </div>
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#00FF88]/25 bg-[#00FF88]/5 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{file.name}</p>
            <p className="text-xs text-white/45">{formatFileSize(file.size)}</p>
          </div>
          <Check className="size-5 shrink-0 text-[#00FF88]" />
          <button
            type="button"
            className="shrink-0 text-white/45 hover:text-white"
            aria-label="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X className="size-5" />
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [cin, setCin] = React.useState("");
  const [cinExpiry, setCinExpiry] = React.useState("");
  const [sessionId, setSessionId] = React.useState("");

  const [step1Error, setStep1Error] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);

  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState("");
  const [cooldown2, setCooldown2] = React.useState(0);
  const [loading2, setLoading2] = React.useState(false);

  const [cinFront, setCinFront] = React.useState<File | null>(null);
  const [cinBack, setCinBack] = React.useState<File | null>(null);
  const [proofAddr, setProofAddr] = React.useState<File | null>(null);
  const [addressLine, setAddressLine] = React.useState("");
  const [governorate, setGovernorate] = React.useState<string | null>(null);
  const [postalCode, setPostalCode] = React.useState("");
  const [step3Errors, setStep3Errors] = React.useState<Record<string, string>>(
    {},
  );
  const [loading3, setLoading3] = React.useState(false);

  const [livenessVideo, setLivenessVideo] = React.useState<File | null>(null);
  const [livenessPhoto, setLivenessPhoto] = React.useState<File | null>(null);
  const [step4Errors, setStep4Errors] = React.useState<Record<string, string>>(
    {},
  );
  const [loading4, setLoading4] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [livenessErrorMsg, setLivenessErrorMsg] = React.useState("");
  /** Count of failed liveness submissions (max 3 attempts). */
  const [livenessFailures, setLivenessFailures] = React.useState(0);

  const [approved, setApproved] = React.useState<{
    address: string;
    rib: string;
    iban: string;
    card_last4: string;
  } | null>(null);

  const [pin, setPin] = React.useState("");
  const [pinConfirm, setPinConfirm] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [loadingPin, setLoadingPin] = React.useState(false);

  React.useEffect(() => {
    if (cooldown2 <= 0) return;
    const id = window.setTimeout(() => setCooldown2((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown2]);

  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    setStep1Error("");
    if (!termsAccepted) {
      setStep1Error("Please accept the terms and conditions.");
      return;
    }
    const full_name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim()) {
      setStep1Error("Please enter your first and last name.");
      return;
    }
    if (password !== confirmPassword) {
      setStep1Error("Passwords do not match.");
      return;
    }
    setLoading1(true);
    try {
      const { ok, data } = await postJson("/auth/register/init", {
        full_name,
        phone,
        email,
        password,
        password_confirmation: confirmPassword,
        date_of_birth: dob,
        cin,
        cin_expiry: cinExpiry,
      });
      if (!ok) {
        setStep1Error(messageFromResponse(data));
        return;
      }
      const sid = data.session_id ?? data.sessionId;
      if (typeof sid !== "string" || !sid) {
        setStep1Error("Invalid response from server.");
        return;
      }
      setSessionId(sid);
      setStep(2);
      setOtp("");
      setCooldown2(60);
    } catch {
      setStep1Error("Network error. Check your connection.");
    } finally {
      setLoading1(false);
    }
  }

  async function verifyPhone(e: React.FormEvent) {
    e.preventDefault();
    setOtpError("");
    setLoading2(true);
    try {
      const { ok, data } = await postJson("/auth/register/verify-phone", {
        session_id: sessionId,
        otp_code: otp,
      });
      if (!ok) {
        setOtpError(messageFromResponse(data));
        return;
      }
      setStep(3);
    } catch {
      setOtpError("Network error. Check your connection.");
    } finally {
      setLoading2(false);
    }
  }

  async function resendPhoneOtp() {
    setOtpError("");
    try {
      const { ok, data } = await postJson("/auth/register/otp/request", {
        session_id: sessionId,
        phone,
      });
      if (!ok) {
        setOtpError(messageFromResponse(data));
        return;
      }
      setCooldown2(60);
    } catch {
      setOtpError("Network error.");
    }
  }

  async function submitStep3(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!cinFront) err.cinFront = "Required.";
    if (!cinBack) err.cinBack = "Required.";
    if (!proofAddr) err.proofAddr = "Required.";
    if (!addressLine.trim()) err.address = "Required.";
    if (!governorate) err.gov = "Required.";
    if (!postalCode.trim()) err.postal = "Required.";
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    [cinFront, cinBack, proofAddr].forEach((f, i) => {
      if (f && !allowed.includes(f.type)) {
        err[`f${i}`] = "Use JPG, PNG, or PDF.";
      }
    });
    setStep3Errors(err);
    if (Object.keys(err).length) return;

    setLoading3(true);
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      fd.append("cin_front", cinFront!);
      fd.append("cin_back", cinBack!);
      fd.append("proof_of_address", proofAddr!);
      fd.append("address", addressLine);
      fd.append("governorate", governorate!);
      fd.append("postal_code", postalCode);

      const { ok, data } = await postFormData(
        "/auth/register/upload-documents",
        fd,
      );
      if (!ok) {
        setStep3Errors({ form: messageFromResponse(data) });
        return;
      }
      setStep(4);
    } catch {
      setStep3Errors({ form: "Network error." });
    } finally {
      setLoading3(false);
    }
  }

  async function submitStep4(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!livenessVideo) err.video = "Required.";
    if (!livenessPhoto) err.photo = "Required.";
    if (
      livenessVideo &&
      livenessVideo.size > 20 * 1024 * 1024
    ) {
      err.video = "Video must be 20MB or less.";
    }
    const vidOk =
      livenessVideo &&
      ["video/mp4", "video/webm"].includes(livenessVideo.type);
    if (livenessVideo && !vidOk)
      err.video = "Use MP4 or WEBM.";
    const imgOk =
      livenessPhoto &&
      ["image/jpeg", "image/png"].includes(livenessPhoto.type);
    if (livenessPhoto && !imgOk)
      err.photo = "Use JPG or PNG.";
    setStep4Errors(err);
    if (Object.keys(err).length) return;

    setLoading4(true);
    setAnalyzing(true);
    setLivenessErrorMsg("");

    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      fd.append("liveness_video", livenessVideo!);
      fd.append("cin_front_photo", livenessPhoto!);

      const { ok, data } = await postFormData(
        "/auth/register/liveness",
        fd,
      );

      if (ok && isApproved(data)) {
        const p = parseApproved(data);
        const addr = p.address || extractAddress(data);
        const tok = extractToken(data);
        persistSession(tok, addr);
        setApproved({
          ...p,
          address: addr || p.address,
        });
        setAnalyzing(false);
        setLoading4(false);
        return;
      }

      setAnalyzing(false);
      setLoading4(false);
      setLivenessFailures((f) => f + 1);
      const msg = messageFromResponse(data);
      setLivenessErrorMsg(msg);
    } catch {
      setAnalyzing(false);
      setLoading4(false);
      setLivenessFailures((f) => f + 1);
      setLivenessErrorMsg("Network error.");
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    if (pin.length !== 4 || pinConfirm.length !== 4) {
      setPinError("Enter both PIN fields.");
      return;
    }
    if (pin !== pinConfirm) {
      setPinError("PINs do not match.");
      return;
    }
    const addr = approved?.address ?? localStorage.getItem("nexapay_address");
    if (!addr) {
      setPinError("Missing account address.");
      return;
    }
    setLoadingPin(true);
    try {
      const { ok, data } = await postJson(`/accounts/${encodeURIComponent(addr)}/set-pin`, {
        pin,
      });
      if (!ok) {
        setPinError(messageFromResponse(data));
        return;
      }
      router.push("/dashboard");
    } catch {
      setPinError("Network error.");
    } finally {
      setLoadingPin(false);
    }
  }

  function copyText(label: string, text: string) {
    void navigator.clipboard.writeText(text);
  }

  const stepTitles = [
    "",
    "Personal info",
    "Verify your phone",
    "Upload documents",
    "Liveness check",
  ];

  const canRetryLiveness = livenessFailures > 0 && livenessFailures < 3;

  if (approved) {
    return (
      <AuthPageShell>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-6">
          <AuthCard>
            <div className="mx-auto flex size-16 items-center justify-center rounded-full border-2 border-[#00FF88] bg-[#00FF88]/10">
              <Check className="size-8 text-[#00FF88] animate-in zoom-in duration-300" />
            </div>
            <h2 className="mt-6 text-center font-display text-3xl text-white">
              Account created!
            </h2>

            <div className="mt-8 space-y-4 rounded-xl border border-white/10 bg-[#121212] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-white/45">RIB</p>
                  <p className="truncate font-mono text-sm text-white">
                    {approved.rib || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/15 p-2 hover:bg-white/5"
                  aria-label="Copy RIB"
                  onClick={() => copyText("RIB", approved.rib)}
                >
                  <Copy className="size-4 text-white/70" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                <div className="min-w-0">
                  <p className="text-xs text-white/45">IBAN</p>
                  <p className="break-all font-mono text-sm text-white">
                    {approved.iban || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/15 p-2 hover:bg-white/5"
                  aria-label="Copy IBAN"
                  onClick={() => copyText("IBAN", approved.iban)}
                >
                  <Copy className="size-4 text-white/70" />
                </button>
              </div>
              <p className="border-t border-white/10 pt-4 text-center text-sm text-white/60">
                Card ending in{" "}
                <span className="font-mono text-white">{approved.card_last4 || "••••"}</span>
              </p>
            </div>

            <form onSubmit={submitPin} className="mt-10 space-y-6">
              <p className="text-center text-sm font-medium text-white/80">
                Create your 4-digit transaction PIN
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <RequiredLabel>PIN</RequiredLabel>
                  <span className="text-[11px] text-white/35">4 digits</span>
                </div>
                <PinInputFour
                  value={pin}
                  onChange={setPin}
                  invalid={!!pinError}
                />
              </div>
              <div className="space-y-3">
                <RequiredLabel>Confirm PIN</RequiredLabel>
                <PinInputFour
                  value={pinConfirm}
                  onChange={setPinConfirm}
                  invalid={!!pinError}
                />
              </div>
              {pinError ? (
                <p className="text-center text-sm text-red-400">{pinError}</p>
              ) : null}
              <Button
                type="submit"
                disabled={loadingPin || pin.length !== 4 || pinConfirm.length !== 4}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full font-semibold text-[#080808]"
                style={{ backgroundColor: ACCENT }}
              >
                {loadingPin ? (
                  <Spinner className="size-5 text-[#080808]" />
                ) : (
                  <>
                    <ArrowRight className="size-5" aria-hidden />
                    Set PIN & Enter app
                  </>
                )}
              </Button>
            </form>
          </AuthCard>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      {analyzing ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <Spinner className="size-10 text-[#00FF88]" />
          <p className="mt-6 text-center text-lg font-medium text-white">
            Analyzing your identity...
          </p>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-6">
        <AuthBrand className="mb-7" />

        <AuthCard className="relative">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStep((s) => Math.max(1, s - 1));
                setLivenessErrorMsg("");
              }}
              className="absolute top-6 left-6 z-10 flex items-center gap-1 text-sm text-white/55 hover:text-white"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          ) : null}

          <div className="mb-8 flex gap-2 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-[#00FF88]" : "bg-white/10",
                )}
              />
            ))}
          </div>

          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Step {step} of 4
          </p>
          <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {step === 1 ? "Sign up" : stepTitles[step]}
          </h1>
          {step === 1 ? (
            <p className="mt-2 text-center text-sm text-white/45">
              Create a new account to get started.
            </p>
          ) : step === 2 ? (
            <p className="mt-2 text-center text-sm text-white/45">
              Enter the verification code we sent to your phone.
            </p>
          ) : step === 3 ? (
            <p className="mt-2 text-center text-sm text-white/45">
              JPG, PNG, or PDF — clear photos or scans.
            </p>
          ) : step === 4 ? (
            <p className="mt-2 text-center text-sm text-white/45">
              Quick capture — then our team verifies your identity.
            </p>
          ) : null}

          {step === 1 ? (
            <form onSubmit={submitStep1} className="mt-10 flex max-h-[min(70vh,720px)] flex-col gap-5 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="firstName">First name</RequiredLabel>
                  <Input
                    id="firstName"
                    placeholder="Amina"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className={regField}
                  />
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="lastName">Last name</RequiredLabel>
                  <Input
                    id="lastName"
                    placeholder="Ben Salem"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className={regField}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="email">Email</RequiredLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={regField}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="phone">Phone number</RequiredLabel>
                <PhoneInputTN
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="password">Password</RequiredLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={regField}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="confirmPassword">
                  Confirm password
                </RequiredLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={regField}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="dob">Date of birth</RequiredLabel>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  className={cn(regField, "text-white")}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="cin">CIN Number</RequiredLabel>
                <Input
                  id="cin"
                  inputMode="numeric"
                  placeholder="12345678"
                  value={cin}
                  onChange={(e) => setCin(e.target.value)}
                  required
                  className={regField}
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="cinExpiry">CIN expiry date</RequiredLabel>
                <Input
                  id="cinExpiry"
                  type="date"
                  value={cinExpiry}
                  onChange={(e) => setCinExpiry(e.target.value)}
                  required
                  className={cn(regField, "text-white")}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 pt-1 text-sm leading-snug text-white/65">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-white/25 bg-[#0a0b0e] text-[#00FF88] focus:ring-[#00FF88]/40 focus:ring-offset-0"
                />
                <span>
                  I accept the{" "}
                  <Link
                    href="#"
                    className="inline-flex items-center gap-0.5 font-medium text-[#00FF88] hover:underline"
                  >
                    terms and conditions
                    <ExternalLink className="size-3 opacity-80" aria-hidden />
                  </Link>
                </span>
              </label>

              {step1Error ? (
                <p className="text-sm text-red-400">{step1Error}</p>
              ) : null}
              <Button
                type="submit"
                disabled={loading1}
                className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] text-base font-semibold text-[#080808] shadow-[0_0_36px_-10px_rgba(0,255,136,0.55)] hover:bg-[#33ffa3]"
              >
                {loading1 ? (
                  <Spinner className="size-5 text-[#080808]" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-5" aria-hidden />
                  </>
                )}
              </Button>
            </form>
          ) : null}

          {step === 2 ? (
            <form onSubmit={verifyPhone} className="mt-10 flex flex-col gap-6">
              <p className="text-center text-sm text-white/55">
                We sent a code to{" "}
                <span className="font-medium text-white/75">
                  {maskPhoneDisplay(phone)}
                </span>
              </p>
              <div className="space-y-3">
                <RequiredLabel>Verification code</RequiredLabel>
                <OtpInputSix
                  value={otp}
                  onChange={(v) => {
                    setOtp(v);
                    setOtpError("");
                  }}
                  invalid={!!otpError}
                />
                {otpError ? (
                  <p className="text-center text-xs text-red-400">{otpError}</p>
                ) : null}
              </div>
              <p className="text-center text-sm text-white/45">
                {cooldown2 > 0 ? (
                  <>Resend in {cooldown2}s</>
                ) : (
                  <button
                    type="button"
                    className="font-medium text-[#00FF88] hover:underline"
                    onClick={() => void resendPhoneOtp()}
                  >
                    Resend code
                  </button>
                )}
              </p>
              <Button
                type="submit"
                disabled={loading2 || otp.length !== 6}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] font-semibold text-[#080808]"
              >
                {loading2 ? (
                  <Spinner className="size-5 text-[#080808]" />
                ) : (
                  <>
                    Verify
                    <ArrowRight className="size-5" aria-hidden />
                  </>
                )}
              </Button>
            </form>
          ) : null}

          {step === 3 ? (
            <form onSubmit={submitStep3} className="mt-10 flex flex-col gap-6">
              <UploadSlot
                label="CIN Front"
                accept="image/jpeg,image/png,application/pdf"
                file={cinFront}
                error={step3Errors.cinFront}
                onFile={setCinFront}
              />
              <UploadSlot
                label="CIN Back"
                accept="image/jpeg,image/png,application/pdf"
                file={cinBack}
                error={step3Errors.cinBack}
                onFile={setCinBack}
              />
              <UploadSlot
                label="Proof of Address"
                accept="image/jpeg,image/png,application/pdf"
                file={proofAddr}
                error={step3Errors.proofAddr}
                onFile={setProofAddr}
              />
              <div className="space-y-2">
                <Label>Address line</Label>
                <Input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="h-11 rounded-xl border-white/15 bg-[#121212]"
                />
                {step3Errors.address ? (
                  <p className="text-xs text-red-400">{step3Errors.address}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Governorate</Label>
                <Select
                  value={governorate ?? undefined}
                  onValueChange={(v) => setGovernorate(v as string)}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border-white/15 bg-[#121212]">
                    <SelectValue placeholder="Select governorate" />
                  </SelectTrigger>
                  <SelectContent>
                    {TUNISIA_GOVERNORATES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {step3Errors.gov ? (
                  <p className="text-xs text-red-400">{step3Errors.gov}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Postal code</Label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="h-11 rounded-xl border-white/15 bg-[#121212]"
                />
                {step3Errors.postal ? (
                  <p className="text-xs text-red-400">{step3Errors.postal}</p>
                ) : null}
              </div>
              {step3Errors.form ? (
                <p className="text-sm text-red-400">{step3Errors.form}</p>
              ) : null}
              <Button
                type="submit"
                disabled={loading3}
                className="h-[52px] w-full rounded-full bg-[#00FF88] font-semibold text-[#080808]"
              >
                {loading3 ? (
                  <Spinner className="size-5 text-[#080808]" />
                ) : (
                  "Upload & Continue"
                )}
              </Button>
            </form>
          ) : null}

          {step === 4 ? (
            <div className="mt-10 flex flex-col gap-6">
              <div className="rounded-xl border border-white/10 bg-[#121212]/80 p-4 text-sm leading-relaxed text-white/70">
                <p className="font-medium text-white">Instructions</p>
                <ol className="mt-3 list-decimal space-y-2 pl-5">
                  <li>Look straight at the camera</li>
                  <li>Slowly turn head left, then right</li>
                  <li>Look up, then down</li>
                  <li>Blink twice</li>
                </ol>
              </div>

              <UploadSlot
                label="Record or upload liveness video"
                accept="video/mp4,video/webm"
                file={livenessVideo}
                error={step4Errors.video}
                onFile={setLivenessVideo}
              />
              <UploadSlot
                label="CIN front photo"
                accept="image/jpeg,image/png"
                file={livenessPhoto}
                error={step4Errors.photo}
                onFile={setLivenessPhoto}
              />

              {livenessErrorMsg ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                  {livenessErrorMsg}
                  {canRetryLiveness ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full rounded-full border-white/20 text-white"
                      onClick={() => {
                        setLivenessErrorMsg("");
                        setStep4Errors({});
                      }}
                    >
                      Try again
                    </Button>
                  ) : livenessFailures >= 3 ? (
                    <p className="mt-3 text-xs text-white/50">
                      Maximum attempts reached. Please contact support.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <form onSubmit={submitStep4}>
                <Button
                  type="submit"
                  disabled={
                    loading4 ||
                    (!!livenessErrorMsg && !canRetryLiveness) ||
                    livenessFailures >= 3
                  }
                  className="h-[52px] w-full rounded-full bg-[#00FF88] font-semibold text-[#080808]"
                >
                  {loading4 && !analyzing ? (
                    <Spinner className="size-5 text-[#080808]" />
                  ) : (
                    "Submit for verification"
                  )}
                </Button>
              </form>
            </div>
          ) : null}

          <p className="mt-8 text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[#00FF88] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </AuthCard>
      </div>
    </AuthPageShell>
  );
}
