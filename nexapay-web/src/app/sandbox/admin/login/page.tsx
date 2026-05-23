"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api";
import { Shield, Lock, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"password" | "otp" | "totp_setup">("password");
  const [devOtp, setDevOtp] = React.useState("");
  const [qrCodeUrl, setQrCodeUrl] = React.useState("");
  const [adminId, setAdminId] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handlePassword = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await postJson("/admin/login", { username, password });
      if (res.ok) {
        const data = res.data as Record<string, unknown>;
        setAdminId(String(data.admin_id || ""));
        const nextStep = data.totp_qr_url ? "totp_setup" : "otp";
        setStep(nextStep);
        if (data.dev_otp) setDevOtp(String(data.dev_otp));
        if (data.totp_qr_url) setQrCodeUrl(String(data.totp_qr_url));
      } else {
        setError(String(res.data.error || "Invalid credentials"));
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  const handleOtp = async () => {
    if (!otp || otp.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await postJson("/admin/login/verify-otp", {
        admin_id: adminId,
        otp_code: otp,
      });
      if (res.ok) {
        const data = res.data as Record<string, unknown>;
        localStorage.setItem("admin_token", String(data.token || ""));
        localStorage.setItem("admin_username", String(data.username || ""));
        localStorage.setItem("admin_role", String(data.role || ""));
        router.push("/admin/dashboard");
      } else {
        setError(String(res.data.error || "Invalid OTP"));
        setOtp("");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00d4aa]/10">
            <Shield className="h-7 w-7 text-[#00d4aa]" />
          </div>
          <h1 className="text-xl font-bold text-white">NexaPay Admin</h1>
          <p className="mt-1 text-sm text-[#666]">Secure access portal</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-6">
          {step === "totp_setup" ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#00d4aa]/5 p-4 text-center">
                <p className="text-sm font-medium text-[#00d4aa]">
                  Set Up Two-Factor Authentication
                </p>
                <p className="mt-1 text-xs text-[#888]">
                  Scan this QR code with Google Authenticator
                </p>
              </div>
              {qrCodeUrl && (
                <div className="flex justify-center rounded-xl bg-white p-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
                    alt="TOTP QR Code"
                    className="h-48 w-48"
                  />
                </div>
              )}
              {devOtp && (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-center">
                  <p className="text-[10px] text-amber-400/60">Manual setup code</p>
                  <p className="font-mono text-xs text-amber-400">{devOtp}</p>
                </div>
              )}
              <button
                onClick={() => setStep("otp")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d4aa] py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#00d4aa]/90"
              >
                I've Scanned the QR Code — Continue
              </button>
            </div>
          ) : step === "password" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#ccc]">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-[#0b0b0b] px-4 py-3 text-sm text-white outline-none placeholder-[#444] focus:border-[#00d4aa]/50"
                  placeholder="admin"
                  onKeyDown={(e) => e.key === "Enter" && handlePassword()}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#ccc]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-[#0b0b0b] px-4 py-3 text-sm text-white outline-none placeholder-[#444] focus:border-[#00d4aa]/50"
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && handlePassword()}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}
              <button
                onClick={handlePassword}
                disabled={loading || !username || !password}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d4aa] py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#00d4aa]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#00d4aa]/5 p-4 text-center">
                <p className="text-sm font-medium text-[#00d4aa]">
                  Verification Required
                </p>
                <p className="mt-1 text-xs text-[#888]">
                  Enter the 6-digit code sent to your device
                </p>
                {devOtp && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-mono text-amber-400">
                    Demo OTP: {devOtp}
                  </p>
                )}
              </div>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full rounded-xl border border-white/[0.06] bg-[#0b0b0b] px-4 py-3 text-center text-sm tracking-[0.5em] text-white outline-none placeholder-[#444] focus:border-[#00d4aa]/50"
                  placeholder="000000"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && handleOtp()}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setStep("password");
                    setOtp("");
                    setError("");
                  }}
                  className="flex-1 rounded-xl border border-white/[0.06] bg-[#0b0b0b] py-3 text-sm font-medium text-[#888] transition-colors hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={handleOtp}
                  disabled={loading || otp.length !== 6}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#00d4aa] py-3 text-sm font-semibold text-black transition-all hover:bg-[#00d4aa]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Verify
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
