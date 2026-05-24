"use client";

import * as React from "react";
import {
  Plus,
  X,
  Copy,
  Check,
  ExternalLink,
  Download,
  MessageCircle,
  QrCode,
  Link2,
  Smartphone,
  Sun,
  Moon,
  Clock,
  Hash,
  CreditCard,
  Wallet,
  Globe,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, formatMillimes } from "../layout";
import { getJson, postJson, deleteJson } from "@/lib/api";
import { getSessionAddress, getSessionToken } from "@/lib/auth-utils";
import { connectSSE } from "@/lib/sse";
import QRCodeLib from "qrcode";

interface PaymentLink {
  id: string;
  intent_id: string;
  name?: string;
  amount?: number;
  description?: string;
  status: string;
  created_at: string;
  pay_url?: string;
  expiry?: string;
  max_usages?: number;
  used_count?: number;
}

async function generateQRWithLogo(url: string, theme: "dark" | "light"): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;

  await QRCodeLib.toCanvas(canvas, url, {
    width: 400,
    margin: 2,
    color: { dark: "#00d4aa", light: theme === "dark" ? "#111111" : "#ffffff" },
  });

  const logoSize = 70;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // White circular background behind logo
  ctx.beginPath();
  ctx.arc(centerX, centerY, logoSize / 2 + 10, 0, 2 * Math.PI);
  ctx.fillStyle = theme === "dark" ? "#111111" : "#ffffff";
  ctx.fill();

  // Load and draw logo
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = "/logo.png";
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  ctx.drawImage(img, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);

  return canvas.toDataURL("image/png");
}

export default function NoCodePanel() {
  const { agent, apiKey } = useAgent();
  const safeApiKey = apiKey || "";
  const [subTab, setSubTab] = React.useState<"links" | "qr">("links");
  const [links, setLinks] = React.useState<PaymentLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  React.useEffect(() => {
    if (!safeApiKey) return;
    loadLinks();
  }, [safeApiKey]);

  // SSE listener for real-time payment notifications (fetch-based for auth)
  React.useEffect(() => {
    const address = getSessionAddress();
    const token = getSessionToken();
    if (!address || !token) return;
    const closeSSE = connectSSE(
      `/api/accounts/${address}/events`,
      token,
      (data) => {
        if (data.type === "payment_intent.succeeded") {
          showToast(`Payment received: ${(Number(data.amount || 0) / 1000).toFixed(3)} TND`, "success");
          loadLinks(true);
        }
      },
    );
    return () => closeSSE();
  }, [safeApiKey]);

  // Poll every 5 seconds for reliable updates
  React.useEffect(() => {
    if (!safeApiKey) return;
    const id = setInterval(() => loadLinks(true), 5000);
    return () => clearInterval(id);
  }, [safeApiKey]);

  const loadLinks = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await getJson("/gateway/v1/intents", { "X-API-Key": safeApiKey });
    if (res.ok && Array.isArray(res.data.intents)) {
      setLinks(res.data.intents as PaymentLink[]);
    }
    if (!silent) setLoading(false);
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab pills */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("links")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all border",
            subTab === "links"
              ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
              : "border-white/[0.06] bg-[#111] text-[#888] hover:text-white"
          )}
        >
          <Link2 className="h-4 w-4" />
          Payment Links
        </button>
        <button
          onClick={() => setSubTab("qr")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all border",
            subTab === "qr"
              ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
              : "border-white/[0.06] bg-[#111] text-[#888] hover:text-white"
          )}
        >
          <QrCode className="h-4 w-4" />
          Payment QR Codes
        </button>
      </div>

      {/* Create button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-full bg-[#00d4aa] px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-[#00d4aa]/20 transition-all hover:bg-[#00d4aa]/90 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          {subTab === "qr" ? "Create Payment QR" : "Create Payment Link"}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00d4aa]" />
        </div>
      ) : links.length === 0 ? (
        <EmptyState subTab={subTab} onCreate={() => setShowCreate(true)} />
      ) : subTab === "qr" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <QrCard
              key={link.intent_id}
              link={link}
              apiKey={safeApiKey}
              onCopy={() => showToast("QR copied to clipboard")}
              onDelete={() => { loadLinks(); showToast("QR deleted"); }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {links.map((link) => (
            <LinkCard
              key={link.intent_id}
              link={link}
              apiKey={safeApiKey}
              onCopy={() => showToast("Link copied to clipboard")}
              onDelete={() => { loadLinks(); showToast("Link deleted"); }}
            />
          ))}
        </div>
      )}

      {/* Invoices Coming Soon — only on Links tab */}
      {subTab === "links" && <InvoicesComingSoon />}

      {/* Create Panel */}
      {showCreate && (
        <CreateLinkPanel
          apiKey={safeApiKey}
          businessName={(agent?.business_name as string | undefined) || "Your Business"}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            loadLinks();
            showToast("Payment link created successfully");
          }}
          subTab={subTab}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-xl",
              toast.type === "success"
                ? "bg-[#00d4aa] text-black"
                : "bg-red-500 text-white"
            )}
          >
            {toast.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ subTab, onCreate }: { subTab: "links" | "qr"; onCreate: () => void }) {
  const isQr = subTab === "qr";
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[#111] p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00d4aa]/10">
        {isQr ? <QrCode className="h-8 w-8 text-[#00d4aa]" /> : <Link2 className="h-8 w-8 text-[#00d4aa]" />}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">
        {isQr ? "No QR codes yet" : "No payment links yet"}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-[#888]">
        {isQr
          ? "Create your first payment QR code to start accepting in-person payments."
          : "Create your first payment link to start accepting payments without any code."}
      </p>
      <button
        onClick={onCreate}
        className="mt-6 flex items-center gap-2 rounded-full bg-[#00d4aa] px-5 py-2.5 text-sm font-semibold text-black"
      >
        <Plus className="h-4 w-4" />
        {isQr ? "Create Payment QR" : "Create Payment Link"}
      </button>
    </div>
  );
}

function DeleteButton({ intentId, apiKey, onDeleted }: { intentId: string; apiKey: string; onDeleted: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    const res = await deleteJson(`/gateway/v1/intents/${intentId}`, { "X-API-Key": apiKey });
    setDeleting(false);
    if (res.ok) {
      setOpen(false);
      onDeleted();
    } else {
      const msg = String(res.data.error || res.data.message || `Error ${res.status}`);
      setError(msg);
      console.error("DELETE_LINK_ERROR:", res.status, res.data);
    }
  };

  return (
    <>
      <ActionButton onClick={() => { setOpen(true); setError(""); }} tooltip="Delete">
        <Trash2 className="h-4 w-4 text-red-400" />
      </ActionButton>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#111] border border-white/[0.06] p-6">
            <h3 className="text-lg font-semibold text-white">Delete Payment Link?</h3>
            <p className="mt-2 text-sm text-[#888]">
              This will permanently remove the link. Customers will no longer be able to access it.
            </p>
            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-white/[0.06] bg-[#0b0b0b] py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LinkCard({
  link,
  onCopy,
  onDelete,
  apiKey,
}: {
  link: PaymentLink;
  onCopy: () => void;
  onDelete: () => void;
  apiKey: string;
}) {
  const handleCopy = () => {
    if (link.pay_url) {
      navigator.clipboard.writeText(link.pay_url);
      onCopy();
    }
  };

  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-[#111] p-5 transition-all hover:border-white/[0.12]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-[15px] font-semibold text-white">
              {link.name || `Payment Link #${link.intent_id.slice(0, 8)}`}
            </h4>
          </div>
          <p className="mt-1 truncate text-sm text-[#888]">{link.description || "No description"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#666]">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {link.created_at ? new Date(link.created_at).toLocaleDateString() : "—"}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              {link.max_usages ? `${link.used_count || 0}/${link.max_usages}` : `${link.used_count || 0}/∞`}
            </span>
            {link.amount && (
              <span className="font-medium text-white">{formatMillimes(link.amount)}</span>
            )}
            {!link.amount && <span className="text-[#888]">Variable amount</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ActionButton onClick={handleCopy} tooltip="Copy link">
            <Copy className="h-4 w-4" />
          </ActionButton>
          <ShareButton link={link} />
          <DeleteButton intentId={link.intent_id} apiKey={apiKey} onDeleted={onDelete} />
        </div>
      </div>
    </div>
  );
}

function ShareButton({ link }: { link: PaymentLink }) {
  const [open, setOpen] = React.useState(false);
  const [qrUrl, setQrUrl] = React.useState("");

  React.useEffect(() => {
    if (open && link.pay_url) {
      generateQRWithLogo(link.pay_url, "dark").then(setQrUrl);
    }
  }, [open, link.pay_url]);

  const handleWhatsApp = () => {
    const text = link.amount
      ? `Pay ${(link.amount / 1000).toFixed(3)} TND to me via NexaPay: ${link.pay_url}`
      : `Pay me via NexaPay: ${link.pay_url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleCopyForInstagram = () => {
    if (link.pay_url) {
      navigator.clipboard.writeText(`Pay me on NexaPay: ${link.pay_url}`);
    }
  };

  return (
    <>
      <ActionButton onClick={() => setOpen(true)} tooltip="Share">
        <ExternalLink className="h-4 w-4" />
      </ActionButton>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#111] border border-white/[0.06] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Share Payment Link</h3>
              <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-[#888] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* QR */}
            <div className="flex flex-col items-center mb-4">
              {qrUrl ? (
                <img src={qrUrl} alt="Payment QR" className="h-32 w-32 rounded-xl" />
              ) : (
                <div className="h-32 w-32 flex items-center justify-center rounded-xl bg-[#0b0b0b]">
                  <Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" />
                </div>
              )}
              <span className="mt-2 text-xs text-[#666]">Scan to pay</span>
            </div>

            {/* Link box */}
            <div className="mb-4 rounded-xl bg-[#0b0b0b] p-3">
              <p className="truncate text-xs text-[#00d4aa] font-mono">{link.pay_url}</p>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (link.pay_url) navigator.clipboard.writeText(link.pay_url);
                  setOpen(false);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] py-2.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Link
              </button>
              <button
                onClick={() => {
                  if (link.pay_url) window.open(link.pay_url, "_blank");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] py-2.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#00d4aa]/10 py-2.5 text-xs font-medium text-[#00d4aa] transition-colors hover:bg-[#00d4aa]/20"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </button>
              <button
                onClick={handleCopyForInstagram}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] py-2.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Copy for IG
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QrCard({
  link,
  onCopy,
  onDelete,
  apiKey,
}: {
  link: PaymentLink;
  onCopy: () => void;
  onDelete: () => void;
  apiKey: string;
}) {
  const [qrUrl, setQrUrl] = React.useState("");

  React.useEffect(() => {
    if (link.pay_url) {
      generateQRWithLogo(link.pay_url, "dark").then(setQrUrl);
    }
  }, [link.pay_url]);

  const handleCopy = () => {
    if (link.pay_url) {
      navigator.clipboard.writeText(link.pay_url);
      onCopy();
    }
  };

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `nexapay-qr-${link.intent_id}.png`;
    a.click();
  };

  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-[#111] p-5 transition-all hover:border-white/[0.12]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="truncate text-[15px] font-semibold text-white">
          {link.name || `QR #${link.intent_id.slice(0, 8)}`}
        </h4>
      </div>
      <div className="flex items-center justify-center rounded-xl bg-[#0b0b0b] p-4">
        {qrUrl ? (
          <img src={qrUrl} alt="Payment QR" className="h-40 w-40 rounded-lg" />
        ) : (
          <div className="h-40 w-40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#00d4aa]" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[#666]">
        <span>{link.amount ? formatMillimes(link.amount) : "Variable"}</span>
        <span>{link.max_usages ? `${link.used_count || 0}/${link.max_usages}` : `${link.used_count || 0}/∞`}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <ActionButton onClick={handleCopy} tooltip="Copy link">
          <Copy className="h-4 w-4" />
        </ActionButton>
        <ActionButton onClick={handleDownload} tooltip="Download QR">
          <Download className="h-4 w-4" />
        </ActionButton>
        <DeleteButton intentId={link.intent_id} apiKey={apiKey} onDeleted={onDelete} />
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  tooltip,
  children,
}: {
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-[#888] transition-all hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </button>
  );
}

function CreateLinkPanel({
  apiKey,
  businessName,
  onClose,
  onSuccess,
  subTab,
}: {
  apiKey: string;
  businessName: string;
  onClose: () => void;
  onSuccess: () => void;
  subTab: "links" | "qr";
}) {
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [maxUsages, setMaxUsages] = React.useState("");
  const [methods, setMethods] = React.useState({ wallet: true, card: true, edinar: false });
  const [feeAmount, setFeeAmount] = React.useState<number | null>(null);
  const [feeDescription, setFeeDescription] = React.useState("");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  // Fetch fee preview when amount changes
  React.useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setFeeAmount(null);
      setFeeDescription("");
      return;
    }
    const millimes = Math.round(parseFloat(amount) * 1000);
    getJson(`/gateway/v1/fees/preview?amount=${millimes}&fee_type=gateway`, { "X-API-Key": apiKey })
      .then(res => {
        if (res.ok) {
          setFeeAmount(Number((res.data as any).fee_amount) ?? null);
          setFeeDescription(String((res.data as any).fee_description ?? ""));
        }
      })
      .catch(() => {});
  }, [amount, apiKey]);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{ url: string; ref: string } | null>(null);
  const [error, setError] = React.useState("");
  const [qrDataUrl, setQrDataUrl] = React.useState("");

  const previewAmount = Math.round(parseFloat(amount || "0") * 1000);

  React.useEffect(() => {
    if (result?.url) {
      generateQRWithLogo(result.url, theme).then(setQrDataUrl);
    }
  }, [result, theme]);

  const handleGenerate = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      return;
    }
    setLoading(true);
    setError("");
    const body: Record<string, unknown> = {
      description: description || name || "Payment",
      currency: "TND",
      amount: Math.round(parseFloat(amount) * 1000),
      accepted_methods: Object.entries(methods)
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
    if (expiry) body.expiry = new Date(expiry).toISOString();
    if (maxUsages) body.max_usages = parseInt(maxUsages);

    try {
      const res = await postJson("/gateway/v1/intents", body, { "X-API-Key": apiKey });
      setLoading(false);
      if (res.ok) {
        const data = res.data;
        const ref = String(data.intent_id || data.id || "");
        setResult({
          url: String(data.checkout_url || `https://nexapay.space/p/${ref}`),
          ref,
        });
        onSuccess();
      } else {
        const msg = String(res.data.error || res.data.message || `Error ${res.status}`);
        setError(msg);
        console.error("CREATE_LINK_ERROR:", res.status, res.data);
      }
    } catch (e) {
      setLoading(false);
      setError("Network error. Please try again.");
      console.error("CREATE_LINK_EXCEPTION:", e);
    }
  };

  const handleCopy = () => {
    if (result?.url) navigator.clipboard.writeText(result.url);
  };

  const handleShareWhatsApp = () => {
    if (!result) return;
    const text = `Pay me ${amount} TND via NexaPay: ${result.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `nexapay-qr-${result?.ref}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full max-w-[420px] overflow-y-auto bg-[#0b0b0b] shadow-2xl",
          "sm:border-l sm:border-white/[0.06]"
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0b0b0b]/95 px-6 py-4 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">
            {subTab === "qr" ? "Create Payment QR" : "Create Payment Link"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-[#888] transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          {result ? (
            <SuccessState
              result={result}
              qrDataUrl={qrDataUrl}
              variableAmount={false}
              amount={amount}
              subTab={subTab}
              onCopy={handleCopy}
              onShareWhatsApp={handleShareWhatsApp}
              onDownloadQR={handleDownloadQR}
              onClose={onClose}
              onNew={() => {
                setResult(null);
                setName("");
                setAmount("");
                setDescription("");
                setExpiry("");
                setMaxUsages("");
              }}
            />
          ) : (
            <>
              {/* Form fields */}
              <div className="space-y-5">
                <Field label="Link name" optional>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Summer Sale"
                    className="w-full rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:border-[#00d4aa]/50 transition-colors"
                  />
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[#ccc]">Amount</label>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="10.000"
                      min="0"
                      step="0.001"
                      className="w-full rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 pr-12 text-sm text-white placeholder-[#444] outline-none focus:border-[#00d4aa]/50 transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-[#666]">TND</span>
                  </div>
                </div>

                <Field label="Description" optional>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Shown to the payer on checkout"
                    maxLength={200}
                    rows={3}
                    className="w-full rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:border-[#00d4aa]/50 transition-colors resize-none"
                  />
                  <p className="mt-1 text-right text-[11px] text-[#555]">{description.length}/200</p>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expiry date" optional>
                    <input
                      type="date"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-[#00d4aa]/50 transition-colors"
                    />
                  </Field>
                  <Field label="Max usages" optional>
                    <input
                      type="number"
                      value={maxUsages}
                      onChange={(e) => setMaxUsages(e.target.value)}
                      placeholder="Unlimited"
                      min="1"
                      className="w-full rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:border-[#00d4aa]/50 transition-colors"
                    />
                  </Field>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#ccc]">Accepted payment methods</label>
                  <div className="flex flex-wrap gap-2">
                    <MethodToggle
                      active={methods.wallet}
                      onToggle={() => setMethods((m) => ({ ...m, wallet: !m.wallet }))}
                      icon={<Wallet className="h-4 w-4" />}
                      label="NexaPay Wallet"
                    />
                    <MethodToggle
                      active={methods.card}
                      onToggle={() => setMethods((m) => ({ ...m, card: !m.card }))}
                      icon={<CreditCard className="h-4 w-4" />}
                      label="Bank Card"
                    />
                    <MethodToggle
                      active={methods.edinar}
                      onToggle={() => setMethods((m) => ({ ...m, edinar: !m.edinar }))}
                      icon={<Globe className="h-4 w-4" />}
                      label="e-DINAR"
                    />
                  </div>
                </div>

                {(amount && parseFloat(amount) > 0) && (
                  <div className="rounded-xl bg-[#111] border border-white/[0.06] px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#888]">Customer pays</span>
                      <span className="text-sm text-white font-medium">
                        {((parseFloat(amount) * 1000) + (feeAmount ?? 0)).toLocaleString()} millimes
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#888]">NexaPay fee</span>
                      <span className="text-sm text-[#00d4aa] font-medium">
                        {feeAmount != null ? `${feeAmount.toLocaleString()} millimes` : "..."}
                      </span>
                    </div>
                    {feeDescription && (
                      <div className="text-[11px] text-[#555] pt-1 border-t border-white/[0.04]">
                        Fee formula: {feeDescription}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#ccc]">Checkout theme</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all",
                        theme === "dark"
                          ? "border-[#00d4aa]/50 bg-[#00d4aa]/5 text-[#00d4aa]"
                          : "border-white/[0.06] bg-[#111] text-[#888] hover:text-white"
                      )}
                    >
                      <Moon className="h-4 w-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all",
                        theme === "light"
                          ? "border-[#00d4aa]/50 bg-[#00d4aa]/5 text-[#00d4aa]"
                          : "border-white/[0.06] bg-[#111] text-[#888] hover:text-white"
                      )}
                    >
                      <Sun className="h-4 w-4" />
                      Light
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[#111] p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#666]">Live Preview</p>
                <PhoneMockup
                  businessName={businessName}
                  amount={previewAmount}
                  variableAmount={false}
                  description={description}
                  theme={theme}
                />
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d4aa] px-4 py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#00d4aa]/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {subTab === "qr" ? "Generate QR Code" : "Generate Link"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[#ccc]">
        {label}
        {optional && <span className="text-[11px] text-[#555]">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function MethodToggle({
  active,
  onToggle,
  icon,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all",
        active
          ? "border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]"
          : "border-white/[0.06] bg-[#111] text-[#888] hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PhoneMockup({
  businessName,
  amount,
  variableAmount,
  description,
  theme,
}: {
  businessName: string;
  amount: number;
  variableAmount: boolean;
  description: string;
  theme: "dark" | "light";
}) {
  const isDark = theme === "dark";
  return (
    <div className="mx-auto w-[200px] rounded-[24px] border-4 border-[#222] bg-[#1a1a1a] p-2 shadow-xl">
      <div
        className={cn(
          "rounded-[18px] p-4",
          isDark ? "bg-[#111]" : "bg-white"
        )}
      >
        <div className="mb-3 flex items-center justify-center">
          <div className={cn("h-1 w-16 rounded-full", isDark ? "bg-[#333]" : "bg-gray-200")} />
        </div>
        <div className={cn("text-center text-xs font-semibold", isDark ? "text-white" : "text-gray-900")}>
          {businessName}
        </div>
        <div className="mt-3 text-center">
          {variableAmount ? (
            <div className={cn("text-2xl font-bold", isDark ? "text-white" : "text-gray-900")}>—</div>
          ) : (
            <div className={cn("text-2xl font-bold", isDark ? "text-[#00d4aa]" : "text-green-600")}>
              {formatMillimes(amount)}
            </div>
          )}
          <div className={cn("mt-1 text-[10px]", isDark ? "text-[#666]" : "text-gray-500")}>TND</div>
        </div>
        {description && (
          <div className={cn("mt-2 text-center text-[10px] leading-tight", isDark ? "text-[#888]" : "text-gray-600")}>
            {description}
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <div
            className={cn(
              "w-full rounded-lg py-2 text-center text-[10px] font-semibold",
              isDark ? "bg-[#00d4aa] text-black" : "bg-green-600 text-white"
            )}
          >
            Pay Now
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessState({
  result,
  qrDataUrl,
  variableAmount,
  amount,
  subTab,
  onCopy,
  onShareWhatsApp,
  onDownloadQR,
  onClose,
  onNew,
}: {
  result: { url: string; ref: string };
  qrDataUrl: string;
  variableAmount: boolean;
  amount: string;
  subTab: "links" | "qr";
  onCopy: () => void;
  onShareWhatsApp: () => void;
  onDownloadQR: () => void;
  onClose: () => void;
  onNew: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const isQr = subTab === "qr";

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#00d4aa]/10">
          <Check className="h-7 w-7 text-[#00d4aa]" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white">
          {isQr ? "QR Code ready!" : "Payment link ready!"}
        </h3>
        <p className="mt-1 text-sm text-[#888]">
          {isQr ? "Scan this QR to get paid instantly" : "Share this link to get paid instantly"}
        </p>
      </div>

      {/* QR Code — prominent for QR tab */}
      {qrDataUrl && (
        <div className={cn(
          "flex flex-col items-center rounded-xl border p-4",
          isQr ? "bg-[#0b0b0b] border-[#00d4aa]/20" : "bg-[#111] border-white/[0.06]"
        )}>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#666]">QR Code</p>
          <img src={qrDataUrl} alt="Payment QR" className={cn("rounded-xl", isQr ? "h-56 w-56" : "h-48 w-48")} />
        </div>
      )}

      {/* Link box — hidden for QR tab */}
      {!isQr && (
        <div className="rounded-xl bg-[#111] border border-[#00d4aa]/20 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Payment URL</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-lg bg-[#0b0b0b] px-3 py-2.5 text-sm text-[#00d4aa]">
              {result.url}
            </div>
            <button
              onClick={handleCopy}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00d4aa]/10 text-[#00d4aa] transition-colors hover:bg-[#00d4aa]/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-[#555]">Ref: {result.ref}</p>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {!isQr && (
          <>
            <ActionBtn onClick={handleCopy} icon={<Copy className="h-4 w-4" />} label="Copy Link" />
            <ActionBtn
              onClick={() => window.open(result.url, "_blank")}
              icon={<ExternalLink className="h-4 w-4" />}
              label="Open"
            />
          </>
        )}
        <ActionBtn onClick={onShareWhatsApp} icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
        <ActionBtn onClick={onDownloadQR} icon={<Download className="h-4 w-4" />} label="Download QR" />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onNew}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-[#111] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.04]"
        >
          <Plus className="h-4 w-4" />
          Create Another
        </button>
        <button
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#00d4aa] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#00d4aa]/90"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl bg-[#111] border border-white/[0.06] px-3 py-2.5 text-xs font-medium text-white transition-all hover:bg-white/[0.04]"
    >
      {icon}
      {label}
    </button>
  );
}

function InvoicesComingSoon() {
  const [notified, setNotified] = React.useState(false);

  return (
    <div className="rounded-2xl border border-dashed border-[rgba(0,255,136,0.2)] bg-[#111] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00d4aa]/5 mx-auto">
        <Smartphone className="h-7 w-7 text-[#00d4aa]/60" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">Invoicing — Coming Soon</h3>
      <p className="mt-2 max-w-sm mx-auto text-sm text-[#888]">
        Generate professional invoices with automatic payment collection. Coming in the next update.
      </p>
      <button
        onClick={() => setNotified(true)}
        disabled={notified}
        className={cn(
          "mt-5 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
          notified
            ? "bg-[#00d4aa]/10 text-[#00d4aa] cursor-default"
            : "bg-white/[0.04] text-white hover:bg-white/[0.08]"
        )}
      >
        {notified ? "We'll notify you ✓" : "Notify me"}
      </button>
    </div>
  );
}
