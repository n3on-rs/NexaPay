"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import {
  PinInputSix,
} from "@/components/auth/otp-inputs";
import { PhoneInputTN } from "@/components/auth/phone-input-tn";
import { RequiredLabel } from "@/components/auth/required-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  extractToken,
  messageFromResponse,
  persistSession,
} from "@/lib/auth-utils";
import { cn } from "@/lib/utils";

import { postJson } from "@/lib/api";
import {
  ArrowRight,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";

const ACCENT = "#00d4aa";

const regField =
  "h-12 rounded-xl border border-white/[0.08] bg-[#0a0b0e] px-3.5 text-sm text-white outline-none transition placeholder:text-white/35 focus-visible:border-[#00d4aa]/55 focus-visible:ring-2 focus-visible:ring-[#00d4aa]/15";


export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [cin, setCin] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [token, setToken] = React.useState("");

  const [step1Error, setStep1Error] = React.useState("");
  const [loading1, setLoading1] = React.useState(false);

  const [pin, setPin] = React.useState("");
  const [pinConfirm, setPinConfirm] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [loadingPin, setLoadingPin] = React.useState(false);

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
    if (!cin.trim()) {
      setStep1Error("Please enter your CIN number.");
      return;
    }
    setLoading1(true);
    try {
      const { ok, data } = await postJson("/auth/register/init", {
        full_name,
        phone,
        email,
        date_of_birth: dob,
        cin: cin.trim(),
      });
      if (!ok) {
        setStep1Error(messageFromResponse(data));
        return;
      }
      const addr = String(data.address ?? "");
      const tok = extractToken(data as Record<string, unknown>);
      if (!addr) {
        setStep1Error("Invalid response from server.");
        return;
      }
      setAddress(addr);
      setToken(tok);
      if (tok) persistSession(tok, addr);
      setStep(2);
    } catch {
      setStep1Error("Network error. Check your connection.");
    } finally {
      setLoading1(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    if (pin.length !== 6 || pinConfirm.length !== 6) {
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
        address,
        pin,
        pin_confirm: pinConfirm,
      });
      if (!ok) {
        setPinError(messageFromResponse(data));
        return;
      }
      const tok = extractToken(data as Record<string, unknown>);
      const addr = String(data.address ?? "");
      if (tok && addr) persistSession(tok, addr);
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
            {[1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-[#00d4aa]" : "bg-white/10",
                )}
              />
            ))}
          </div>

          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Step {step} of 2
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
              Set a 6-digit PIN to secure your transactions.
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
                  className="mt-0.5 size-4 shrink-0 rounded border-white/25 bg-[#0a0b0e] text-[#00d4aa] focus:ring-[#00d4aa]/40 focus:ring-offset-0"
                />
                <span>
                  I accept the{" "}
                  <Link
                    href="#"
                    className="inline-flex items-center gap-0.5 font-medium text-[#00d4aa] hover:underline"
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
                className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#00d4aa] text-base font-semibold text-[#0b0b0b] shadow-[0_0_36px_-10px_rgba(0,255,136,0.55)] hover:bg-[#33ffa3]"
              >
                {loading1 ? (
                  <Spinner className="size-5 text-[#0b0b0b]" />
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
            <form onSubmit={submitPin} className="mt-10 space-y-6">
              <p className="text-center text-sm font-medium text-white/80">
                Create your 6-digit transaction PIN
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <RequiredLabel>PIN</RequiredLabel>
                  <span className="text-[11px] text-white/35">6 digits</span>
                </div>
                <PinInputSix
                  value={pin}
                  onChange={setPin}
                  invalid={!!pinError}
                />
              </div>
              <div className="space-y-3">
                <RequiredLabel>Confirm PIN</RequiredLabel>
                <PinInputSix
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
                disabled={loadingPin || pin.length !== 6 || pinConfirm.length !== 6}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full font-semibold text-[#0b0b0b]"
                style={{ backgroundColor: ACCENT }}
              >
                {loadingPin ? (
                  <Spinner className="size-5 text-[#0b0b0b]" />
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
              className="font-semibold text-[#00d4aa] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </AuthCard>
      </div>
    </AuthPageShell>
  );
}
