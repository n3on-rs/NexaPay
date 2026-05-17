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
  extractToken,
  maskPhoneDisplay,
  messageFromResponse,
  persistSession,
} from "@/lib/auth-utils";
import { cn } from "@/lib/utils";

import { postJson } from "@/lib/api";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";

const ACCENT = "#00FF88";

const regField =
  "h-12 rounded-xl border border-white/[0.08] bg-[#0a0b0e] px-3.5 text-sm text-white outline-none transition placeholder:text-white/35 focus-visible:border-[#00FF88]/55 focus-visible:ring-2 focus-visible:ring-[#00FF88]/15";

function parseApproved(data: Record<string, unknown>) {
  return {
    address: String(data.address ?? ""),
    rib: String(data.rib ?? data.RIB ?? ""),
    iban: String(data.iban ?? data.IBAN ?? ""),
    card_last4: String(data.card_last4 ?? data.cardLast4 ?? ""),
  };
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
  const [sessionId, setSessionId] = React.useState("");

  const [step1Error, setStep1Error] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);

  const [otp, setOtp] = React.useState("");
  const [otpError, setOtpError] = React.useState("");
  const [cooldown2, setCooldown2] = React.useState(0);
  const [loading2, setLoading2] = React.useState(false);




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
      // Auto-approved after OTP; persist session and proceed to PIN step
      const p = parseApproved(data as Record<string, unknown>);
      const tok = extractToken(data as Record<string, unknown>);
      if (p.address) persistSession(tok, p.address);
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
    setLoadingPin(true);
    try {
      const { ok, data } = await postJson("/auth/register/set-pin", {
        session_id: sessionId,
        pin,
        pin_confirm: pinConfirm,
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


  const stepTitles = [
    "",
    "Personal info",
    "Verify your phone",
    "Set your PIN",
  ];


  return (
    <AuthPageShell>

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-6">
        <AuthBrand className="mb-7" />

        <AuthCard className="relative">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStep((s) => Math.max(1, s - 1));
              }}
              className="absolute top-6 left-6 z-10 flex items-center gap-1 text-sm text-white/55 hover:text-white"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          ) : null}

          <div className="mb-8 flex gap-2 pt-2">
            {[1, 2, 3].map((i) => (
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
            Step {step} of 3
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
              Set a 4-digit PIN to secure your transactions.
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
