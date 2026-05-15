"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/contexts/auth-context";
import { applyAgent } from "@/lib/api";
import { getSessionToken, getSessionAddress } from "@/lib/auth-utils";
import {
  ArrowLeft,
  Upload,
  Building2,
  FileText,
  MapPin,
  Check,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";

interface Municipality {
  Name: string;
  NameAr: string;
  Value: string;
  Delegations: Array<{
    Name: string;
    NameAr: string;
    Value: string;
    PostalCode: string;
    Latitude: number;
    Longitude: number;
  }>;
}

export default function AgentPage() {
  return (
    <ProtectedRoute>
      <AgentInner />
    </ProtectedRoute>
  );
}

function AgentInner() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [businessName, setBusinessName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [businessLicense, setBusinessLicense] = React.useState<File | null>(null);
  const [rneDoc, setRneDoc] = React.useState<File | null>(null);
  const [streetAddress, setStreetAddress] = React.useState("");
  const [delegation, setDelegation] = React.useState("");
  const [governorate, setGovernorate] = React.useState("");
  const [municipalities, setMunicipalities] = React.useState<Municipality[]>([]);
  const [govLoading, setGovLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const loadGovs = async () => {
      setGovLoading(true);
      try {
        const res = await fetch("/api/municipalities");
        if (res.ok) {
          const data = await res.json();
          setMunicipalities(data as Municipality[]);
        }
      } catch { /* ignore */ }
      setGovLoading(false);
    };
    loadGovs();
  }, []);

  const selectedGov = municipalities.find((m) => m.Value === governorate);
  const delegations = selectedGov?.Delegations.map((d) => d.Value) || [];

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setBusinessLicense(e.target.files[0]);
  };

  const handleRneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setRneDoc(e.target.files[0]);
  };

  const handleSubmit = async () => {
    setError("");
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) {
      setError("Session expired. Please log in again.");
      return;
    }
    if (!businessName || !taxId || !businessLicense) {
      setError("Please fill all required fields and upload the business license.");
      return;
    }
    if (!governorate || !delegation) {
      setError("Please select governorate and delegation.");
      return;
    }

    setSubmitting(true);
    const govName = municipalities.find((m) => m.Value === governorate)?.Name || governorate;
    const fullAddress = `${delegation}${streetAddress ? `, ${streetAddress}` : ""}`;

    const form = new FormData();
    form.append("business_name", businessName);
    form.append("business_type", "Agent");
    form.append("tax_registration_number", taxId);
    form.append("business_address", fullAddress);
    form.append("business_governorate", govName);
    form.append("business_description", "Agent application");
    form.append("expected_monthly_volume", "5000");
    form.append("business_license", businessLicense);
    if (rneDoc) form.append("rne_doc", rneDoc);

    try {
      const res = await applyAgent(address, token, form);
      if (res.ok) {
        const apiKey = (res.data as any).api_key as string | undefined;
        if (apiKey) {
          localStorage.setItem("nexapay_agent_api_key", apiKey);
        }
        setSubmitted(true);
      } else {
        setError(
          typeof res.data.error === "string" ? res.data.error : "Submission failed",
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#080808] text-white font-inter flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#00FF88]/10">
            <Check className="h-8 w-8 text-[#00FF88]" />
          </div>
          <h1 className="font-space-grotesk text-2xl font-bold text-white">Application Submitted</h1>
          <p className="mt-3 text-[14px] text-[#888]">
            Your agent application has been received. In development mode it is auto-approved.
          </p>
          <button
            onClick={() => router.push("/profile")}
            className="mt-8 w-full rounded-full bg-[#00FF88] py-3 text-[14px] font-semibold text-[#080808] transition-transform active:scale-[0.97]"
          >
            Back to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter">
      <main className="mx-auto max-w-lg px-4 pt-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-space-grotesk text-[24px] font-extrabold text-white">Become Agent</h1>
            <p className="text-[12px] text-[#666]">
              Submit a request to become an agent.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="mt-8 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold ${
                step >= 1
                  ? "bg-[#00FF88] text-[#080808]"
                  : "border border-white/10 text-[#555]"
              }`}
            >
              1
            </div>
            <span className={`text-[12px] ${step >= 1 ? "text-white" : "text-[#555]"}`}>
              Tax ID & Documents
            </span>
          </div>
          <div className="h-px flex-1 bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold ${
                step >= 2
                  ? "bg-[#00FF88] text-[#080808]"
                  : "border border-white/10 text-[#555]"
              }`}
            >
              2
            </div>
            <span className={`text-[12px] ${step >= 2 ? "text-white" : "text-[#555]"}`}>
              Location
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="mt-6 space-y-5">
            <section>
              <label className="flex items-center gap-2 text-[13px] font-medium text-white">
                <Building2 className="h-4 w-4 text-[#888]" />
                Name of the work space <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Enter name of the work space"
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#111] px-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00FF88]/40"
              />
            </section>

            <section>
              <label className="flex items-center gap-2 text-[13px] font-medium text-white">
                <FileText className="h-4 w-4 text-[#888]" />
                Tax Identification Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Enter tax identification number"
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#111] px-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00FF88]/40"
              />
            </section>

            {/* Business License */}
            <section>
              <p className="text-[13px] font-medium text-white">
                Business License (Patente) <span className="text-red-400">*</span>
              </p>
              <p className="text-[11px] text-[#555]">Upload business license document</p>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[#111] px-4 py-8 transition-colors hover:border-[#00FF88]/20">
                <Upload className="h-6 w-6 text-[#00FF88]" />
                <p className="mt-2 text-[13px] font-medium text-white">Click to upload</p>
                <p className="text-[11px] text-[#555]">or drag and drop</p>
                <p className="text-[10px] text-[#444]">image/*, .pdf (max 5.00 MB)</p>
                {businessLicense && (
                  <p className="mt-2 text-[12px] text-[#00FF88]">{businessLicense.name}</p>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleLicenseChange}
                />
              </label>
            </section>

            {/* RNE Document */}
            <section>
              <p className="text-[13px] font-medium text-white">RNE Document (Optional)</p>
              <p className="text-[11px] text-[#555]">Upload RNE document (optional)</p>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[#111] px-4 py-8 transition-colors hover:border-[#00FF88]/20">
                <Upload className="h-6 w-6 text-[#00FF88]" />
                <p className="mt-2 text-[13px] font-medium text-white">Click to upload</p>
                <p className="text-[11px] text-[#555]">or drag and drop</p>
                <p className="text-[10px] text-[#444]">image/*, .pdf (max 5.00 MB)</p>
                {rneDoc && (
                  <p className="mt-2 text-[12px] text-[#00FF88]">{rneDoc.name}</p>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleRneChange}
                />
              </label>
            </section>

            <button
              onClick={() => {
                if (!businessName || !taxId || !businessLicense) {
                  setError("Please fill all required fields and upload the business license.");
                  return;
                }
                setError("");
                setStep(2);
              }}
              className="mt-4 w-full rounded-full bg-[#00FF88] py-3.5 text-[14px] font-semibold text-[#080808] transition-transform active:scale-[0.97]"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="mt-6 space-y-5">
            <section>
              <label className="flex items-center gap-2 text-[13px] font-medium text-white">
                <MapPin className="h-4 w-4 text-[#888]" />
                Governorate / Region <span className="text-red-400">*</span>
              </label>
              <div className="relative mt-2">
                <select
                  value={governorate}
                  onChange={(e) => { setGovernorate(e.target.value); setDelegation(""); }}
                  disabled={govLoading}
                  className="h-12 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#111] px-4 pr-10 text-[14px] text-white outline-none transition-all focus:border-[#00FF88]/40 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111] text-white">Select governorate</option>
                  {municipalities.map((m) => (
                    <option key={m.Value} value={m.Value} className="bg-[#111] text-white">{m.Name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
              </div>
            </section>

            <section>
              <label className="flex items-center gap-2 text-[13px] font-medium text-white">
                <MapPin className="h-4 w-4 text-[#888]" />
                Delegation <span className="text-red-400">*</span>
              </label>
              <div className="relative mt-2">
                <select
                  value={delegation}
                  onChange={(e) => setDelegation(e.target.value)}
                  disabled={!governorate}
                  className="h-12 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#111] px-4 pr-10 text-[14px] text-white outline-none transition-all focus:border-[#00FF88]/40 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111] text-white">Select delegation</option>
                  {delegations.map((d, idx) => (
                    <option key={`${idx}-${d}`} value={d} className="bg-[#111] text-white">{d}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
              </div>
            </section>

            <section>
              <label className="flex items-center gap-2 text-[13px] font-medium text-white">
                <MapPin className="h-4 w-4 text-[#888]" />
                Street Address / City
              </label>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                placeholder="Enter street address and city"
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#111] px-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#00FF88]/40"
              />
            </section>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-full border border-white/[0.08] bg-transparent py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-white/[0.03]"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-full bg-[#00FF88] py-3.5 text-[14px] font-semibold text-[#080808] transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
