"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getJson, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Clock,
  Shield,
  AlertCircle,
  Loader2,
  ChevronRight,
  CreditCard,
  Smartphone,
  Copy,
  ExternalLink,
  MessageCircle,
  Download,
} from "lucide-react";

interface IntentData {
  intent_id: string;
  amount: number;
  fee_amount: number;
  total: number;
  currency: string;
  description?: string;
  agent_name: string;
  status: string;
  expiry?: string;
  accepted_methods: string[];
  variable_amount: boolean;
  order_id?: string;
  checkout_theme: string;
  success_url?: string;
  env: string;
  created_at?: string;
}

interface TestCard {
  brand: string;
  number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
  behavior: string;
  description: string;
}

export default function CheckoutPage() {
  const params = useParams();
  const intentId = String(params?.intentId || "");

  const [intent, setIntent] = React.useState<IntentData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [env, setEnv] = React.useState<string>("sandbox");
  const [testCards, setTestCards] = React.useState<TestCard[]>([]);
  const [debugError, setDebugError] = React.useState("");

  React.useEffect(() => {
    if (!intentId) return;
    loadIntent();
    loadEnvironment();
  }, [intentId]);

  const loadIntent = async () => {
    // Create a fresh session from the link template
    const sessionRes = await postJson(
      `/gateway/v1/intents/${intentId}/session`,
      {},
    );
    if (sessionRes.ok && sessionRes.data.success) {
      const data = sessionRes.data as Record<string, unknown>;
      const intentData: IntentData = {
        intent_id: String(data.intent_id || ""),
        amount: Number(data.amount || 0),
        fee_amount: Number(data.fee_amount || 0),
        total: Number(data.total || data.amount || 0),
        currency: String(data.currency || "TND"),
        description: data.description ? String(data.description) : undefined,
        agent_name: String(data.agent_name || "NexaPay Merchant"),
        status: String(data.status || "unknown"),
        expiry: data.expiry ? String(data.expiry) : undefined,
        accepted_methods: Array.isArray(data.accepted_methods)
          ? data.accepted_methods.map(String)
          : ["wallet", "bank_card"],
        variable_amount: Boolean(data.variable_amount),
        order_id: data.order_id ? String(data.order_id) : undefined,
        checkout_theme: String(data.checkout_theme || "dark"),
        success_url: data.success_url ? String(data.success_url) : undefined,
        env: String(data.env || "sandbox"),
      };
      setIntent(intentData);
      setTheme(intentData.checkout_theme === "light" ? "light" : "dark");
      setEnv(intentData.env);
      setLoading(false);
      return;
    }

    // Fallback to public endpoint if session fails
    const res = await getJson(`/gateway/v1/intents/${intentId}/public`);
    setLoading(false);
    if (res.ok && res.data.success) {
      const data = res.data as Record<string, unknown>;
      const intentData: IntentData = {
        intent_id: String(data.intent_id || ""),
        amount: Number(data.amount || 0),
        fee_amount: Number(data.fee_amount || 0),
        total: Number(data.total || data.amount || 0),
        currency: String(data.currency || "TND"),
        description: data.description ? String(data.description) : undefined,
        agent_name: String(data.agent_name || "NexaPay Merchant"),
        status: String(data.status || "unknown"),
        expiry: data.expiry ? String(data.expiry) : undefined,
        accepted_methods: Array.isArray(data.accepted_methods)
          ? data.accepted_methods.map(String)
          : ["wallet", "bank_card"],
        variable_amount: Boolean(data.variable_amount),
        order_id: data.order_id ? String(data.order_id) : undefined,
        checkout_theme: String(data.checkout_theme || "dark"),
        success_url: data.success_url ? String(data.success_url) : undefined,
        env: String(data.env || "sandbox"),
        created_at: data.created_at ? String(data.created_at) : undefined,
      };
      setIntent(intentData);
      setTheme(intentData.checkout_theme === "light" ? "light" : "dark");
      setEnv(intentData.env);
    } else if (res.status === 404) {
      setError("not_found");
    } else {
      setError("generic");
    }
  };

  const loadEnvironment = async () => {
    const res = await getJson("/gateway/v1/environment");
    if (res.ok && res.data.success) {
      setEnv(String(res.data.environment || "sandbox"));
      if (Array.isArray(res.data.test_cards)) {
        setTestCards(res.data.test_cards as TestCard[]);
      }
    }
  };

  const isDark = theme === "dark";

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-screen items-center justify-center",
          isDark ? "bg-[#0b0b0b]" : "bg-[#F5F5F5]",
        )}
      >
        <Loader2
          className={cn(
            "h-8 w-8 animate-spin",
            isDark ? "text-[#00d4aa]" : "text-[#00AA55]",
          )}
        />
      </div>
    );
  }

  if (error === "not_found") {
    return <NotFoundScreen isDark={isDark} />;
  }

  if (!intent) {
    return <ErrorScreen isDark={isDark} onRetry={loadIntent} />;
  }

  if (intent.status === "succeeded") {
    return <AlreadyPaidScreen intent={intent} isDark={isDark} />;
  }

  if (
    intent.status === "expired" ||
    (intent.expiry && new Date(intent.expiry) < new Date())
  ) {
    return <ExpiredScreen agentName={intent.agent_name} isDark={isDark} />;
  }

  if (intent.status === "cancelled") {
    return <CancelledScreen isDark={isDark} />;
  }

  return (
    <CheckoutActive
      intent={intent}
      isDark={isDark}
      env={env}
      testCards={testCards}
      onRefresh={loadIntent}
    />
  );
}

function CheckoutActive({
  intent,
  isDark,
  env,
  testCards,
  onRefresh,
}: {
  intent: IntentData;
  isDark: boolean;
  env: string;
  testCards: TestCard[];
  onRefresh: () => void;
}) {
  const [activeMethod, setActiveMethod] = React.useState<string>(
    intent.accepted_methods[0] || "wallet",
  );
  const [enteredAmount, setEnteredAmount] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [result, setResult] = React.useState<
    "success" | "declined" | "insufficient_funds" | "error" | null
  >(null);
  const [debugError, setDebugError] = React.useState("");

  const sessionMinutes = 10;
  const effectiveCreatedAt = intent.created_at || new Date().toISOString();
  const sessionExpired = React.useMemo(() => {
    const created = new Date(effectiveCreatedAt).getTime();
    return Date.now() > created + sessionMinutes * 60 * 1000;
  }, [effectiveCreatedAt]);

  React.useEffect(() => {
    if (!sessionExpired) return;
    const t = setTimeout(() => onRefresh(), 2000);
    return () => clearTimeout(t);
  }, [sessionExpired, onRefresh]);

  const amount = intent.variable_amount
    ? Math.round(parseFloat(enteredAmount || "0") * 1000)
    : intent.amount;

  const formatAmount = (millimes: number) => {
    const tnd = (millimes / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${tnd} TND`;
  };

  return (
    <div
      className={cn(
        "min-h-screen pb-8",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold",
              isDark ? "bg-[#00d4aa] text-black" : "bg-[#00AA55] text-white",
            )}
          >
            N
          </div>
          <span
            className={cn(
              "text-lg font-bold",
              isDark ? "text-white" : "text-[#111]",
            )}
          >
            NexaPay
          </span>
        </div>
      </div>

      {/* Sandbox badge */}
      {env === "sandbox" && (
        <div className="mx-auto max-w-[480px] px-4 mb-4">
          <div className="flex items-center justify-center gap-2 rounded-full border border-[#FFB800]/30 bg-[#FFB800]/10 px-4 py-1.5 text-xs font-medium text-[#FFB800]">
            🧪 Sandbox Mode — Test cards only
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[480px] px-4 space-y-4">
        {/* Merchant info */}
        <div className="text-center">
          <h1 className="text-base font-semibold">{intent.agent_name}</h1>
          {intent.description && (
            <p
              className={cn(
                "mt-1 text-sm",
                isDark ? "text-[#888]" : "text-gray-500",
              )}
            >
              {intent.description}
            </p>
          )}
          {intent.order_id && (
            <p
              className={cn(
                "mt-1 text-xs",
                isDark ? "text-[#555]" : "text-gray-400",
              )}
            >
              Order #{intent.order_id}
            </p>
          )}
        </div>

        {/* Session timer */}
        {!result && (
          <SessionTimer
            createdAt={effectiveCreatedAt}
            minutes={sessionMinutes}
            isDark={isDark}
          />
        )}

        {/* Expiry countdown for payment link */}
        {intent.expiry && !result && (
          <ExpiryCountdown expiry={intent.expiry} isDark={isDark} />
        )}

        {/* Amount */}
        <div
          className={cn(
            "rounded-2xl p-6 text-center",
            isDark
              ? "bg-[#111] border border-white/[0.06]"
              : "bg-white border border-gray-200",
          )}
        >
          {intent.variable_amount ? (
            <div className="space-y-3">
              <label
                className={cn(
                  "block text-sm font-medium",
                  isDark ? "text-[#ccc]" : "text-gray-700",
                )}
              >
                Enter amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={enteredAmount}
                  onChange={(e) => setEnteredAmount(e.target.value)}
                  placeholder="0.000"
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-center text-2xl font-bold outline-none transition-colors",
                    isDark
                      ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                      : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                  )}
                />
                <span
                  className={cn(
                    "absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium",
                    isDark ? "text-[#666]" : "text-gray-400",
                  )}
                >
                  TND
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="text-4xl font-extrabold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className={isDark ? "text-[#00d4aa]" : "text-[#00AA55]"}>
                  {formatAmount(intent.amount)}
                </span>
              </div>
              {intent.fee_amount > 0 && (
                <>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className={isDark ? "text-[#666]" : "text-gray-400"}>
                      NexaPay fee: {formatAmount(intent.fee_amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className={isDark ? "text-[#888]" : "text-gray-500"}>
                      You pay:{" "}
                    </span>
                    <span
                      className="text-lg font-bold"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {formatAmount(intent.total)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Customer info — card only */}
        {activeMethod !== "wallet" && (
          <div
            className={cn(
              "rounded-2xl p-5 space-y-4",
              isDark
                ? "bg-[#111] border border-white/[0.06]"
                : "bg-white border border-gray-200",
            )}
          >
            <p
              className={cn(
                "text-sm font-medium",
                isDark ? "text-[#ccc]" : "text-gray-700",
              )}
            >
              Your Information
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className={cn(
                    "mb-1.5 block text-xs font-medium",
                    isDark ? "text-[#888]" : "text-gray-500",
                  )}
                >
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors",
                    isDark
                      ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                      : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                  )}
                />
              </div>
              <div>
                <label
                  className={cn(
                    "mb-1.5 block text-xs font-medium",
                    isDark ? "text-[#888]" : "text-gray-500",
                  )}
                >
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors",
                    isDark
                      ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                      : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                  )}
                />
              </div>
            </div>
            <div>
              <label
                className={cn(
                  "mb-1.5 block text-xs font-medium",
                  isDark ? "text-[#888]" : "text-gray-500",
                )}
              >
                Phone Number
              </label>
              <div className="relative">
                <span
                  className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 text-sm",
                    isDark ? "text-[#666]" : "text-gray-400",
                  )}
                >
                  +216
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) =>
                    setPhoneNumber(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="12345678"
                  maxLength={8}
                  className={cn(
                    "w-full rounded-xl pl-14 pr-4 py-3 text-sm outline-none transition-colors",
                    isDark
                      ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                      : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Payment method tabs */}
        <div className="flex gap-2">
          {intent.accepted_methods.map((method) => (
            <button
              key={method}
              onClick={() => setActiveMethod(method)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                activeMethod === method
                  ? isDark
                    ? "bg-[#00d4aa] text-black"
                    : "bg-[#00AA55] text-white"
                  : isDark
                    ? "bg-[#111] text-[#888] border border-white/[0.06]"
                    : "bg-white text-gray-500 border border-gray-200",
              )}
            >
              {method === "wallet" ? (
                <Smartphone className="h-4 w-4" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {method === "wallet" ? "NexaPay Wallet" : "Bank Card"}
            </button>
          ))}
        </div>

        {/* Payment form */}
        <div
          className={cn(
            "rounded-2xl p-5",
            isDark
              ? "bg-[#111] border border-white/[0.06]"
              : "bg-white border border-gray-200",
          )}
        >
          {activeMethod === "wallet" ? (
            <WalletForm
              intent={intent}
              amount={amount}
              isDark={isDark}
              processing={processing}
              phoneNumber={phoneNumber}
              onPhoneChange={setPhoneNumber}
              onResult={setResult}
              onProcessing={setProcessing}
              onSetError={setDebugError}
            />
          ) : (
            <CardForm
              intent={intent}
              amount={amount}
              isDark={isDark}
              env={env}
              testCards={testCards}
              processing={processing}
              firstName={firstName}
              lastName={lastName}
              phoneNumber={phoneNumber}
              onResult={setResult}
              onProcessing={setProcessing}
              onSetError={setDebugError}
            />
          )}
        </div>

        {/* Security footer */}
        <div
          className="flex items-center justify-center gap-1 pt-4 text-xs"
          style={{ color: isDark ? "#555" : "#999" }}
        >
          <Shield className="h-3 w-3" />
          Secured by NexaPay
        </div>
      </div>

      {/* Result overlays */}
      {result === "success" && (
        <SuccessOverlay intent={intent} isDark={isDark} amount={amount} />
      )}
      {(result === "declined" || result === "insufficient_funds") && (
        <DeclinedOverlay
          reason={result}
          isDark={isDark}
          onRetry={() => {
            setResult(null);
            setProcessing(false);
          }}
        />
      )}
      {result === "error" && (
        <ErrorOverlay
          isDark={isDark}
          debug={debugError}
          onRetry={() => {
            setResult(null);
            setProcessing(false);
            setDebugError("");
          }}
        />
      )}
    </div>
  );
}

function WalletForm({
  intent,
  amount,
  isDark,
  processing,
  phoneNumber,
  onPhoneChange,
  onResult,
  onProcessing,
  onSetError,
}: {
  intent: IntentData;
  amount: number;
  isDark: boolean;
  processing: boolean;
  phoneNumber: string;
  onPhoneChange: (v: string) => void;
  onResult: (
    r: "success" | "declined" | "insufficient_funds" | "error",
  ) => void;
  onProcessing: (p: boolean) => void;
  onSetError: (msg: string) => void;
}) {
  const [pin, setPin] = React.useState("");
  const [step, setStep] = React.useState<"pin" | "otp">("pin");
  const [otp, setOtp] = React.useState("");
  const [phoneHint, setPhoneHint] = React.useState("");
  const [devOtp, setDevOtp] = React.useState<string | null>(null);

  const walletPhone = phoneNumber ? `+216${phoneNumber}` : "";

  const handleRequestOtp = async () => {
    onProcessing(true);
    onSetError("");
    const res = await postJson(
      `/gateway/v1/intents/${intent.intent_id}/confirm`,
      {
        method: "wallet",
        phone: walletPhone,
        pin,
        customer_phone: walletPhone,
      },
    );
    onProcessing(false);

    if (res.ok && res.data.success && res.data.step === "otp_required") {
      setStep("otp");
      setPhoneHint(String(res.data.phone_hint || ""));
      if (res.data.dev_otp) setDevOtp(String(res.data.dev_otp));
    } else {
      const err = String(res.data.error || "");
      const msg = String(res.data.message || "");
      onSetError(msg || err || `HTTP ${res.status}`);
      if (err.includes("insufficient")) onResult("insufficient_funds");
      else if (err.includes("declined")) onResult("declined");
      else onResult("error");
    }
  };

  const handleVerifyOtp = async () => {
    onProcessing(true);
    onSetError("");
    const res = await postJson(
      `/gateway/v1/intents/${intent.intent_id}/confirm`,
      {
        method: "wallet",
        phone: walletPhone,
        pin,
        otp,
        customer_phone: walletPhone,
      },
    );
    onProcessing(false);

    if (res.ok && res.data.success) {
      onResult("success");
    } else {
      const err = String(res.data.error || "");
      const msg = String(res.data.message || "");
      onSetError(msg || err || `HTTP ${res.status}`);
      if (err.includes("insufficient")) onResult("insufficient_funds");
      else if (err.includes("declined")) onResult("declined");
      else onResult("error");
    }
  };

  const formatAmount = (millimes: number) => {
    const tnd = (millimes / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${tnd} TND`;
  };

  if (step === "otp") {
    return (
      <div className="space-y-4">
        <div
          className={cn(
            "rounded-xl p-4 text-center",
            isDark
              ? "bg-[#00d4aa]/5 border border-[#00d4aa]/10"
              : "bg-[#00AA55]/5 border border-[#00AA55]/10",
          )}
        >
          <p
            className={cn(
              "text-sm font-medium",
              isDark ? "text-[#00d4aa]" : "text-[#00AA55]",
            )}
          >
            Verification code sent
          </p>
          <p
            className={cn(
              "mt-1 text-xs",
              isDark ? "text-[#888]" : "text-gray-500",
            )}
          >
            Enter the 6-digit code sent to {phoneHint || "your phone"}
          </p>
          {devOtp && (
            <p className="mt-1 text-xs font-mono text-amber-400">
              Dev OTP: {devOtp}
            </p>
          )}
        </div>

        <div>
          <label
            className={cn(
              "mb-1.5 block text-sm font-medium",
              isDark ? "text-[#ccc]" : "text-gray-700",
            )}
          >
            Verification Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            maxLength={6}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors text-center tracking-[0.5em]",
              isDark
                ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
            )}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStep("pin");
              setOtp("");
              onSetError("");
            }}
            disabled={processing}
            className={cn(
              "flex-1 rounded-xl py-3 text-sm font-medium transition-all",
              isDark
                ? "bg-[#111] text-[#888] border border-white/[0.06] hover:text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:text-[#111]",
            )}
          >
            Back
          </button>
          <button
            onClick={handleVerifyOtp}
            disabled={processing || otp.length !== 6}
            className={cn(
              "flex-[2] flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
              processing || otp.length !== 6
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-90 active:scale-[0.98]",
              isDark ? "bg-[#00d4aa] text-black" : "bg-[#00AA55] text-white",
            )}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Verify & Pay {formatAmount(amount)} TND
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          className={cn(
            "mb-1.5 block text-sm font-medium",
            isDark ? "text-[#ccc]" : "text-gray-700",
          )}
        >
          Phone Number
        </label>
        <div className="relative">
          <span
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 text-sm",
              isDark ? "text-[#666]" : "text-gray-400",
            )}
          >
            +216
          </span>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ""))}
            placeholder="12345678"
            maxLength={8}
            className={cn(
              "w-full rounded-xl pl-14 pr-4 py-3 text-sm outline-none transition-colors",
              isDark
                ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
            )}
          />
        </div>
      </div>

      <div>
        <label
          className={cn(
            "mb-1.5 block text-sm font-medium",
            isDark ? "text-[#ccc]" : "text-gray-700",
          )}
        >
          PIN
        </label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit PIN"
          maxLength={6}
          className={cn(
            "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors text-center tracking-[0.5em]",
            isDark
              ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
              : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
          )}
        />
      </div>

      <button
        onClick={handleRequestOtp}
        disabled={processing || phoneNumber.length < 8 || pin.length < 6}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold transition-all",
          processing || phoneNumber.length < 8 || pin.length < 6
            ? "opacity-50 cursor-not-allowed"
            : "hover:opacity-90 active:scale-[0.98]",
          isDark ? "bg-[#00d4aa] text-black" : "bg-[#00AA55] text-white",
        )}
      >
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Send Verification Code
      </button>
    </div>
  );
}

function CardForm({
  intent,
  amount,
  isDark,
  env,
  testCards,
  processing,
  firstName,
  lastName,
  phoneNumber,
  onResult,
  onProcessing,
  onSetError,
}: {
  intent: IntentData;
  amount: number;
  isDark: boolean;
  env: string;
  testCards: TestCard[];
  processing: boolean;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  onResult: (
    r: "success" | "declined" | "insufficient_funds" | "error",
  ) => void;
  onProcessing: (p: boolean) => void;
  onSetError: (msg: string) => void;
}) {
  const [cardNumber, setCardNumber] = React.useState("");
  const [cardHolder, setCardHolder] = React.useState("");
  const [expiryMonth, setExpiryMonth] = React.useState("");
  const [expiryYear, setExpiryYear] = React.useState("");
  const [cvv, setCvv] = React.useState("");
  const [showTestCards, setShowTestCards] = React.useState(false);
  const [cardType, setCardType] = React.useState<string>("");

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "");
    const parts = [];
    for (let i = 0; i < digits.length; i += 4) {
      parts.push(digits.slice(i, i + 4));
    }
    return parts.join(" ");
  };

  const handleCardChange = (val: string) => {
    const formatted = formatCardNumber(val);
    setCardNumber(formatted);
    const digits = val.replace(/\D/g, "");
    if (digits.startsWith("4")) setCardType("visa");
    else if (digits.startsWith("5")) setCardType("mastercard");
    else setCardType("");
  };

  const autofillTestCard = (tc: TestCard) => {
    setCardNumber(formatCardNumber(tc.number));
    setCardHolder("Test User");
    setExpiryMonth(String(tc.expiry_month).padStart(2, "0"));
    setExpiryYear(String(tc.expiry_year));
    setCvv(tc.cvv);
    if (tc.number.startsWith("4")) setCardType("visa");
    else if (tc.number.startsWith("5")) setCardType("mastercard");
  };

  const handlePay = async () => {
    onProcessing(true);
    const confirmPayload: Record<string, unknown> = {
      card_number: cardNumber.replace(/\s/g, ""),
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      card_holder_name: cardHolder,
      cvv,
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_phone: phoneNumber ? `+216${phoneNumber}` : undefined,
    };
    if (intent.variable_amount && amount > 0) {
      confirmPayload.amount = amount;
    }
    const res = await postJson(
      `/gateway/v1/intents/${intent.intent_id}/confirm`,
      confirmPayload,
    );
    onProcessing(false);

    console.log("Card confirm response:", res.status, res.data);
    if (res.ok && res.data.success) {
      onResult("success");
    } else {
      const err = String(res.data.error || "");
      const msg = String(res.data.message || "");
      onSetError(msg || err || `HTTP ${res.status}`);
      if (err === "INVALID_TEST_CARD" || msg.includes("insufficient"))
        onResult("insufficient_funds");
      else if (msg.includes("declined") || err.includes("declined"))
        onResult("declined");
      else onResult("error");
    }
  };

  const formatAmount = (millimes: number) => {
    const tnd = (millimes / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${tnd} TND`;
  };

  const cardValid =
    cardNumber.replace(/\s/g, "").length >= 15 &&
    expiryMonth.length === 2 &&
    expiryYear.length === 4 &&
    cvv.length >= 3 &&
    cardHolder.trim().length >= 3;

  return (
    <div className="space-y-4">
      {/* Card preview */}
      <div
        className={cn(
          "relative mx-auto w-full max-w-[260px] overflow-hidden rounded-xl p-5",
          isDark ? "bg-[#1a1a1a]" : "bg-gray-100",
        )}
      >
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "text-xs font-medium",
              isDark ? "text-[#888]" : "text-gray-500",
            )}
          >
            {cardType === "visa"
              ? "VISA"
              : cardType === "mastercard"
                ? "MasterCard"
                : "Card"}
          </div>
          <CreditCard
            className={cn("h-5 w-5", isDark ? "text-[#666]" : "text-gray-400")}
          />
        </div>
        <div className="mt-4 text-lg font-mono tracking-wider">
          {cardNumber || "•••• •••• •••• ••••"}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className={cn(isDark ? "text-[#888]" : "text-gray-500")}>
            <div>{cardHolder || "CARDHOLDER"}</div>
          </div>
          <div className={cn(isDark ? "text-[#888]" : "text-gray-500")}>
            <div>
              {expiryMonth || "MM"}/{expiryYear.slice(2) || "YY"}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label
            className={cn(
              "mb-1.5 block text-sm font-medium",
              isDark ? "text-[#ccc]" : "text-gray-700",
            )}
          >
            Card Number
          </label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => handleCardChange(e.target.value)}
            placeholder="4242 4242 4242 4242"
            maxLength={19}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors",
              isDark
                ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
            )}
          />
        </div>

        <div>
          <label
            className={cn(
              "mb-1.5 block text-sm font-medium",
              isDark ? "text-[#ccc]" : "text-gray-700",
            )}
          >
            Cardholder Name
          </label>
          <input
            type="text"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value)}
            placeholder="JOHN DOE"
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors uppercase",
              isDark
                ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className={cn(
                "mb-1.5 block text-sm font-medium",
                isDark ? "text-[#ccc]" : "text-gray-700",
              )}
            >
              Expiry (MM/YY)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={expiryMonth}
                onChange={(e) =>
                  setExpiryMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="MM"
                maxLength={2}
                className={cn(
                  "w-full rounded-xl px-4 py-3 text-sm text-center outline-none transition-colors",
                  isDark
                    ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                    : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                )}
              />
              <input
                type="text"
                value={expiryYear}
                onChange={(e) =>
                  setExpiryYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="YYYY"
                maxLength={4}
                className={cn(
                  "w-full rounded-xl px-4 py-3 text-sm text-center outline-none transition-colors",
                  isDark
                    ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                    : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
                )}
              />
            </div>
          </div>
          <div>
            <label
              className={cn(
                "mb-1.5 block text-sm font-medium",
                isDark ? "text-[#ccc]" : "text-gray-700",
              )}
            >
              CVV
            </label>
            <input
              type="text"
              value={cvv}
              onChange={(e) =>
                setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="123"
              maxLength={4}
              className={cn(
                "w-full rounded-xl px-4 py-3 text-sm text-center outline-none transition-colors",
                isDark
                  ? "bg-[#0b0b0b] border border-white/[0.06] text-white placeholder-[#444] focus:border-[#00d4aa]/50"
                  : "bg-gray-50 border border-gray-200 text-[#111] placeholder-gray-300 focus:border-[#00AA55]/50",
              )}
            />
          </div>
        </div>
      </div>

      {/* Test cards hint */}
      {env === "sandbox" && testCards.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowTestCards(!showTestCards)}
            className={cn(
              "text-xs font-medium",
              isDark
                ? "text-[#FFB800] hover:text-[#FFB800]/80"
                : "text-amber-600 hover:text-amber-700",
            )}
          >
            🧪 Test cards {showTestCards ? "▲" : "▼"}
          </button>
          {showTestCards && (
            <div
              className={cn(
                "mt-2 overflow-hidden rounded-xl",
                isDark ? "bg-[#0b0b0b]" : "bg-gray-50",
              )}
            >
              <table className="w-full text-xs">
                <thead>
                  <tr
                    className={cn(
                      "border-b",
                      isDark ? "border-white/[0.06]" : "border-gray-200",
                    )}
                  >
                    <th
                      className={cn(
                        "px-3 py-2 text-left font-medium",
                        isDark ? "text-[#888]" : "text-gray-500",
                      )}
                    >
                      Brand
                    </th>
                    <th
                      className={cn(
                        "px-3 py-2 text-left font-medium",
                        isDark ? "text-[#888]" : "text-gray-500",
                      )}
                    >
                      Number
                    </th>
                    <th
                      className={cn(
                        "px-3 py-2 text-left font-medium",
                        isDark ? "text-[#888]" : "text-gray-500",
                      )}
                    >
                      Result
                    </th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {testCards.map((tc, i) => (
                    <tr
                      key={i}
                      onClick={() => autofillTestCard(tc)}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isDark
                          ? "border-b border-white/[0.04] hover:bg-white/[0.04]"
                          : "border-b border-gray-100 hover:bg-gray-100",
                      )}
                    >
                      <td className="px-3 py-2">{tc.brand}</td>
                      <td className="px-3 py-2 font-mono">
                        {tc.number.slice(0, 4)} {tc.number.slice(4, 8)}{" "}
                        {tc.number.slice(8, 12)} {tc.number.slice(12)}
                      </td>
                      <td className="px-3 py-2">
                        {tc.behavior === "success" ? (
                          <span className="text-[#00d4aa]">✓</span>
                        ) : (
                          <span className="text-red-500">✗</span>
                        )}{" "}
                        {tc.behavior}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            isDark ? "text-[#666]" : "text-gray-400",
                          )}
                        >
                          Autofill
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={processing || !cardValid}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold transition-all",
          processing || !cardValid
            ? "opacity-50 cursor-not-allowed"
            : "hover:opacity-90 active:scale-[0.98]",
          isDark ? "bg-[#00d4aa] text-black" : "bg-[#00AA55] text-white",
        )}
      >
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Pay {formatAmount(amount)} TND
      </button>
    </div>
  );
}

function ExpiryCountdown({
  expiry,
  isDark,
}: {
  expiry: string;
  isDark: boolean;
}) {
  const [left, setLeft] = React.useState("");
  const [urgent, setUrgent] = React.useState(false);

  React.useEffect(() => {
    const update = () => {
      const diff = new Date(expiry).getTime() - Date.now();
      if (diff <= 0) {
        setLeft("Expired");
        setUrgent(true);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
      setUrgent(mins < 2);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiry]);

  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
          urgent
            ? "bg-red-500/10 text-red-500 border border-red-500/20"
            : isDark
              ? "bg-[#111] text-[#888] border border-white/[0.06]"
              : "bg-white text-gray-500 border border-gray-200",
        )}
      >
        <Clock className="h-3 w-3" />
        Expires in {left}
      </div>
    </div>
  );
}

function SuccessOverlay({
  intent,
  isDark,
  amount,
}: {
  intent: IntentData;
  isDark: boolean;
  amount: number;
}) {
  const formatAmount = (millimes: number) => {
    const tnd = (millimes / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${tnd} TND`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: isDark ? "#0b0b0b" : "#F5F5F5" }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00d4aa]/10">
        <Check className="h-10 w-10 text-[#00d4aa]" />
      </div>
      <h2
        className={cn(
          "mt-6 text-2xl font-extrabold",
          isDark ? "text-white" : "text-[#111]",
        )}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Payment Successful
      </h2>
      <p
        className={cn(
          "mt-2 text-3xl font-bold",
          isDark ? "text-[#00d4aa]" : "text-[#00AA55]",
        )}
      >
        {formatAmount(amount)}
      </p>
      <p
        className={cn("mt-1 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        To: {intent.agent_name}
      </p>
      {intent.order_id && (
        <p
          className={cn(
            "mt-1 text-xs",
            isDark ? "text-[#555]" : "text-gray-400",
          )}
        >
          Order #{intent.order_id}
        </p>
      )}

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => {
            const receipt = `
<!DOCTYPE html><html><head><title>Receipt</title></head>
<body style="font-family:sans-serif;max-width:400px;margin:40px auto;padding:20px;border:1px solid #eee;border-radius:12px;">
<h2 style="text-align:center;margin-bottom:24px;">NexaPay Receipt</h2>
<p><strong>Merchant:</strong> ${intent.agent_name}</p>
<p><strong>Amount:</strong> ${formatAmount(amount)}</p>
<p><strong>Status:</strong> Paid</p>
<p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
${intent.order_id ? `<p><strong>Order:</strong> #${intent.order_id}</p>` : ""}
<p style="margin-top:24px;text-align:center;color:#888;font-size:12px;">Secured by NexaPay</p>
</body></html>`;
            const blob = new Blob([receipt], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `receipt-${intent.intent_id}.html`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all",
            isDark
              ? "border-white/[0.06] bg-[#111] text-white hover:bg-white/[0.04]"
              : "border-gray-200 bg-white text-[#111] hover:bg-gray-50",
          )}
        >
          <Download className="h-4 w-4" />
          Download Receipt
        </button>
        {intent.success_url && (
          <a
            href={intent.success_url}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
              isDark
                ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
                : "bg-[#00AA55] text-white hover:bg-[#00AA55]/90",
            )}
          >
            <ExternalLink className="h-4 w-4" />
            Return to {intent.agent_name}
          </a>
        )}
      </div>
    </div>
  );
}

function SessionTimer({
  createdAt,
  minutes,
  isDark,
}: {
  createdAt: string;
  minutes: number;
  isDark: boolean;
}) {
  const [remaining, setRemaining] = React.useState(0);
  const totalMs = minutes * 60 * 1000;

  React.useEffect(() => {
    const calc = () => {
      const created = new Date(createdAt).getTime();
      const deadline = created + totalMs;
      const diff = Math.max(0, deadline - Date.now());
      setRemaining(diff);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [createdAt, totalMs]);

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const expired = remaining <= 0;
  const pct = Math.min(100, Math.max(0, (remaining / totalMs) * 100));
  const urgent = remaining < 120000; // under 2 min

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        isDark ? "border-white/[0.06] bg-[#111]" : "border-gray-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock
            className={cn(
              "h-4 w-4",
              expired
                ? "text-red-500"
                : urgent
                  ? "text-amber-400"
                  : "text-[#00d4aa]",
            )}
          />
          <span
            className={cn(
              "text-xs font-semibold",
              expired
                ? "text-red-500"
                : urgent
                  ? "text-amber-400"
                  : isDark
                    ? "text-[#ccc]"
                    : "text-gray-700",
            )}
          >
            {expired
              ? "Session Expired"
              : `Session ends in ${m}m ${String(s).padStart(2, "0")}s`}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] font-medium",
            isDark ? "text-[#555]" : "text-gray-400",
          )}
        >
          {minutes} min limit
        </span>
      </div>
      <div
        className={cn(
          "h-1.5 w-full rounded-full overflow-hidden",
          isDark ? "bg-white/[0.04]" : "bg-gray-100",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            expired ? "bg-red-500" : urgent ? "bg-amber-400" : "bg-[#00d4aa]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {expired && (
        <p className="mt-1.5 text-[10px] text-red-500">
          Refresh the page to start a new session.
        </p>
      )}
    </div>
  );
}

function DeclinedOverlay({
  reason,
  isDark,
  onRetry,
}: {
  reason: string;
  isDark: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: isDark ? "#0b0b0b" : "#F5F5F5" }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
        <X className="h-10 w-10 text-red-500" />
      </div>
      <h2
        className={cn(
          "mt-6 text-2xl font-extrabold",
          isDark ? "text-white" : "text-[#111]",
        )}
      >
        Payment Declined
      </h2>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        {reason === "insufficient_funds"
          ? "Insufficient funds"
          : "Card declined"}
      </p>
      <button
        onClick={onRetry}
        className={cn(
          "mt-6 flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
          isDark
            ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
            : "bg-[#00AA55] text-white hover:bg-[#00AA55]/90",
        )}
      >
        Try Another Card
      </button>
    </div>
  );
}

function ErrorOverlay({
  isDark,
  onRetry,
  debug,
}: {
  isDark: boolean;
  onRetry: () => void;
  debug?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: isDark ? "#0b0b0b" : "#F5F5F5" }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
        <AlertCircle className="h-10 w-10 text-amber-500" />
      </div>
      <h2
        className={cn(
          "mt-6 text-2xl font-extrabold",
          isDark ? "text-white" : "text-[#111]",
        )}
      >
        Something went wrong
      </h2>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        Please try again.
      </p>
      {debug && (
        <div
          className={cn(
            "mt-3 max-w-xs rounded-lg p-3 text-xs font-mono",
            isDark ? "bg-[#111] text-red-400" : "bg-gray-100 text-red-600",
          )}
        >
          {debug}
        </div>
      )}
      <button
        onClick={onRetry}
        className={cn(
          "mt-6 flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
          isDark
            ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
            : "bg-[#00AA55] text-white hover:bg-[#00AA55]/90",
        )}
      >
        Retry
      </button>
    </div>
  );
}

function NotFoundScreen({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#333]">
        <AlertCircle className="h-10 w-10 text-[#666]" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Payment Link Not Found</h1>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        This payment link does not exist or has been removed.
      </p>
    </div>
  );
}

function AlreadyPaidScreen({
  intent,
  isDark,
}: {
  intent: IntentData;
  isDark: boolean;
}) {
  const formatAmount = (millimes: number) => {
    const tnd = (millimes / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${tnd} TND`;
  };

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00d4aa]/10">
        <Check className="h-10 w-10 text-[#00d4aa]" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Already Paid</h1>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        This payment has already been completed.
      </p>
      <p className="mt-4 text-xl font-bold text-[#00d4aa]">
        {formatAmount(intent.amount)}
      </p>
      <p
        className={cn("mt-1 text-sm", isDark ? "text-[#666]" : "text-gray-400")}
      >
        To: {intent.agent_name}
      </p>
    </div>
  );
}

function ExpiredScreen({
  agentName,
  isDark,
}: {
  agentName: string;
  isDark: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#333]">
        <Clock className="h-10 w-10 text-[#666]" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Link Expired</h1>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        This payment link has expired.
      </p>
      <p
        className={cn("mt-1 text-sm", isDark ? "text-[#666]" : "text-gray-400")}
      >
        Contact {agentName} for a new link.
      </p>
    </div>
  );
}

function CancelledScreen({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#333]">
        <X className="h-10 w-10 text-[#666]" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Cancelled</h1>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        This payment has been cancelled.
      </p>
    </div>
  );
}

function ErrorScreen({
  isDark,
  onRetry,
}: {
  isDark: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-[#F5F5F5] text-[#111]",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
        <AlertCircle className="h-10 w-10 text-amber-500" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Something went wrong</h1>
      <p
        className={cn("mt-2 text-sm", isDark ? "text-[#888]" : "text-gray-500")}
      >
        Please try again.
      </p>
      <button
        onClick={onRetry}
        className={cn(
          "mt-6 flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
          isDark
            ? "bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90"
            : "bg-[#00AA55] text-white hover:bg-[#00AA55]/90",
        )}
      >
        Retry
      </button>
    </div>
  );
}
