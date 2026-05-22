"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { startKyc, finalizeKyc, getKycStatus, skipKyc, getAccountContract, signAccountContract, submitCin, uploadFacePhoto } from "@/lib/api";
import { getSessionToken } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import {
  Camera, Upload, CheckCircle2, XCircle, Loader2, Shield,
  ArrowLeft, RotateCcw, IdCard, ScanFace, AlertTriangle, ImageIcon,
  ScrollText
} from "lucide-react";
import SignatureCanvas from "@/components/signature-canvas";

type KycStep = "intro" | "cin-front" | "cin-back" | "uploading" | "face-photo" | "processing" | "cin-input" | "contract" | "success" | "failed";

export default function VerifyPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const token = getSessionToken() || "";

  const [step, setStep] = React.useState<KycStep>("intro");
  const [frontImage, setFrontImage] = React.useState<File | null>(null);
  const [backImage, setBackImage] = React.useState<File | null>(null);
  const [frontPreview, setFrontPreview] = React.useState("");
  const [backPreview, setBackPreview] = React.useState("");
  const [cameraSide, setCameraSide] = React.useState<"none" | "front" | "back" | "face">("none");
  const [sessionId, setSessionId] = React.useState("");
  const [error, setError] = React.useState("");
  const [failureReason, setFailureReason] = React.useState("");

  // Face photo state
  const [faceImage, setFaceImage] = React.useState<File | null>(null);
  const [facePreview, setFacePreview] = React.useState("");
  const faceVideoRef = React.useRef<HTMLVideoElement>(null);
  const faceCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const faceStreamRef = React.useRef<MediaStream | null>(null);

  // CIN manual input state
  const [manualCin, setManualCin] = React.useState("");
  const [cinError, setCinError] = React.useState("");
  const [cinLoading, setCinLoading] = React.useState(false);

  // Contract signing state
  const [contractText, setContractText] = React.useState("");
  const [contractHash, setContractHash] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [signatureData, setSignatureData] = React.useState("");
  const [signError, setSignError] = React.useState("");
  const [loadingSign, setLoadingSign] = React.useState(false);
  const [signedSuccess, setSignedSuccess] = React.useState(false);

  const cinVideoRef = React.useRef<HTMLVideoElement>(null);
  const cinCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const cinStreamRef = React.useRef<MediaStream | null>(null);

  // Check KYC status on mount
  React.useEffect(() => {
    if (!user?.address || !token) return;
    getKycStatus(user.address, token).then((res) => {
      if (res.ok) {
        const st = String(res.data.kyc_status || "unverified");
        const cinMissing = Boolean(res.data.cin_missing);
        if (st === "verified") {
          if (cinMissing) {
            setStep("cin-input");
            return;
          }
          const alreadySigned = Boolean(res.data.contract_signed);
          if (alreadySigned) {
            router.push("/dashboard");
          } else {
            setStep("contract");
          }
        } else if (st === "pending") {
          setSessionId(String(res.data.session_id || ""));
          setStep("processing");
        } else if (st === "failed") {
          setFailureReason(String(res.data.failure_reason || "Verification failed"));
          setStep("failed");
        }
        // skipped or unverified -> stay on intro
      }
    });
  }, [user?.address, token, router]);

  const handleGallerySelect = (side: "front" | "back") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (side === "front") {
      setFrontImage(file);
      setFrontPreview(url);
      setStep("cin-back");
    } else {
      setBackImage(file);
      setBackPreview(url);
    }
  };

  const startCinCamera = async (side: "front" | "back") => {
    setCameraSide(side);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      cinStreamRef.current = stream;
      if (cinVideoRef.current) {
        cinVideoRef.current.srcObject = stream;
        await cinVideoRef.current.play();
      }
    } catch {
      setError("Camera access denied. Please allow camera access or use gallery upload.");
      setCameraSide("none");
    }
  };

  const stopCinCamera = () => {
    if (cinStreamRef.current) {
      cinStreamRef.current.getTracks().forEach((t) => t.stop());
      cinStreamRef.current = null;
    }
    setCameraSide("none");
  };

  const captureCinPhoto = () => {
    if (!cinVideoRef.current || !cinCanvasRef.current) return;
    const video = cinVideoRef.current;
    const canvas = cinCanvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `cin_${cameraSide}_${Date.now()}.jpg`, { type: "image/jpeg" });
        const url = URL.createObjectURL(file);
        if (cameraSide === "front") {
          setFrontImage(file);
          setFrontPreview(url);
          stopCinCamera();
          setStep("cin-back");
        } else if (cameraSide === "back") {
          setBackImage(file);
          setBackPreview(url);
          stopCinCamera();
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  const handleUpload = async () => {
    if (!frontImage || !backImage || !user?.address) return;
    setStep("uploading");
    setError("");
    try {
      const res = await startKyc(user.address, token, frontImage, backImage);
      if (!res.ok) {
        const errMsg = String(res.data.error || res.data.message || "");
        const statusMsg = res.status === 502 ? "KYC service unavailable. Please try again in a moment."
          : res.status === 401 ? "Session expired. Please log in again."
          : res.status === 413 ? "Images too large. Please use smaller files."
          : errMsg || `Upload failed (${res.status})`;
        setError(statusMsg);
        setStep("cin-front");
        return;
      }
      const sid = String(res.data.session_id || "");
      if (!sid) {
        setError("Invalid response from server. Please try again.");
        setStep("cin-front");
        return;
      }
      setSessionId(sid);
      setStep("face-photo");
    } catch (e) {
      setError("Network error. Please check your connection and try again.");
      setStep("cin-front");
    }
  };

  // Demo: show "Verifying your identity..." for 6 seconds then auto-verify
  const runDemoVerify = async (sid: string) => {
    if (!user?.address) return;
    setStep("processing");
    // Show spinner for 6 seconds
    await new Promise((resolve) => setTimeout(resolve, 6000));
    try {
      const finRes = await finalizeKyc(user.address, token, sid);
      if (finRes.ok) {
        await refreshUser();
        const statusRes = await getKycStatus(user.address, token);
        const alreadySigned = statusRes.ok && Boolean(statusRes.data.contract_signed);
        if (alreadySigned) {
          setStep("success");
        } else {
          setStep("contract");
        }
      } else if (finRes.status === 409) {
        setError(String(finRes.data?.error || "This CIN is already in use."));
        setStep("cin-input");
      } else {
        setFailureReason("Could not finalize verification. Please try again.");
        setStep("failed");
      }
    } catch {
      setFailureReason("Could not finalize verification. Please try again.");
      setStep("failed");
    }
  };

  const handleSkip = async () => {
    if (!user?.address) return;
    try {
      await skipKyc(user.address, token);
      await refreshUser();
      router.push("/dashboard");
    } catch {
      setError("Could not skip verification. Please try again.");
    }
  };

  const fetchContract = React.useCallback(async () => {
    if (!user?.address || !token) return;
    try {
      const res = await getAccountContract(user.address, token);
      if (res.ok) {
        setContractText(String(res.data.contract_text || ""));
        setContractHash(String(res.data.doc_hash || ""));
      }
    } catch { /* ignore */ }
  }, [user?.address, token]);

  React.useEffect(() => {
    if (step === "contract" && !contractText) {
      fetchContract();
    }
  }, [step, contractText, fetchContract]);

  const submitSignature = async () => {
    if (!user?.address || !token) return;
    if (!signatureData) { setSignError("Please provide a signature"); return; }
    if (!termsAccepted) { setSignError("You must accept the Terms and Conditions"); return; }
    setLoadingSign(true); setSignError("");
    try {
      const { ok, data } = await signAccountContract(user.address, token, signatureData, "draw", true);
      if (!ok) {
        setSignError(String(data.error || "Failed to sign contract"));
        return;
      }
      setContractText(String(data.contract_text || contractText));
      setContractHash(String(data.doc_hash || ""));
      setSignedSuccess(true);
      setStep("success");
    } catch {
      setSignError("Network error. Please try again.");
    } finally { setLoadingSign(false); }
  };

  const handleSubmitCin = async () => {
    if (!user?.address || !token) return;
    const cin = manualCin.trim();
    if (!cin || cin.length < 5) {
      setCinError("Enter a valid CIN number");
      return;
    }
    setCinLoading(true); setCinError("");
    try {
      const { ok, data } = await submitCin(user.address, token, cin);
      if (!ok) {
        setCinError(String(data.error || "Failed to save CIN"));
        return;
      }
      await refreshUser();
      // After submitting CIN, go to contract step
      const statusRes = await getKycStatus(user.address, token);
      const alreadySigned = statusRes.ok && Boolean(statusRes.data.contract_signed);
      if (alreadySigned) {
        setStep("success");
      } else {
        setStep("contract");
      }
    } catch {
      setCinError("Network error. Please try again.");
    } finally { setCinLoading(false); }
  };

  const resetFlow = () => {
    setFrontImage(null);
    setBackImage(null);
    setFrontPreview("");
    setBackPreview("");
    setFaceImage(null);
    setFacePreview("");
    setSessionId("");
    setError("");
    setFailureReason("");
    setCameraSide("none");
    setContractText("");
    setContractHash("");
    setTermsAccepted(false);
    setSignatureData("");
    setSignError("");
    setSignedSuccess(false);
    setManualCin("");
    setCinError("");
    stopCinCamera();
    stopFaceCamera();
    setStep("intro");
  };

  // Face photo camera functions
  const startFaceCamera = async () => {
    setCameraSide("face");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      faceStreamRef.current = stream;
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        await faceVideoRef.current.play();
      }
    } catch {
      setError("Camera access denied. Please allow camera access.");
      setCameraSide("none");
    }
  };

  const stopFaceCamera = () => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
    setCameraSide("none");
  };

  const captureFacePhoto = () => {
    if (!faceVideoRef.current || !faceCanvasRef.current) return;
    const video = faceVideoRef.current;
    const canvas = faceCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `face_${Date.now()}.jpg`, { type: "image/jpeg" });
        const url = URL.createObjectURL(file);
        setFaceImage(file);
        setFacePreview(url);
        stopFaceCamera();
      },
      "image/jpeg",
      0.92,
    );
  };

  const submitFacePhoto = async () => {
    if (!faceImage || !user?.address || !sessionId) return;
    setStep("uploading");
    setError("");
    try {
      const res = await uploadFacePhoto(user.address, token, faceImage);
      if (!res.ok) {
        setError("Failed to upload face photo. Please try again.");
        setStep("face-photo");
        return;
      }
      // Demo: after face photo, run the 6-second verify
      await runDemoVerify(sessionId);
    } catch {
      setError("Network error. Please try again.");
      setStep("face-photo");
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter flex flex-col items-center selection:bg-[#00FF88] selection:text-black">
      {/* Header */}
      <div className="w-full max-w-lg px-4 pt-8 pb-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-2 text-[#888] hover:text-white transition-colors bg-white/5 rounded-full mb-4"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="w-full max-w-lg px-4 pb-12 flex-1 flex flex-col">
        {/* INTRO */}
        {step === "intro" && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-6 border border-[#00FF88]/20">
              <Shield className="w-9 h-9 text-[#00FF88]" />
            </div>
            <h1 className="text-2xl font-space-grotesk font-bold mb-2 text-center">Verify Your Identity</h1>
            <p className="text-[#888] text-center mb-8 text-sm leading-relaxed max-w-sm">
              To unlock all features, we need to verify your Tunisian CIN card.
            </p>

            <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 rounded-xl p-3 mb-6 w-full">
              <p className="text-xs text-[#aaa] leading-relaxed text-center">
                <span className="text-[#00FF88] font-bold">Demo Mode:</span> AI KYC verification is disabled. Identity will be auto-verified after document upload.
              </p>
            </div>

            <div className="w-full space-y-3 mb-8">
              {[
                { icon: IdCard, title: "Scan CIN Card", desc: "Take photos of front and back of your CIN" },
                { icon: ScanFace, title: "Face Photo", desc: "Take a selfie for verification" },
                { icon: CheckCircle2, title: "Instant Verification", desc: "Account unlocked in seconds" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="w-10 h-10 bg-[#00FF88]/10 rounded-lg flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-[#00FF88]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="text-xs text-[#888]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep("cin-front")}
              className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              Start Verification →
            </button>
            <button
              onClick={handleSkip}
              className="w-full h-12 rounded-full bg-white/5 border border-white/10 text-[#888] font-bold text-sm flex items-center justify-center hover:bg-white/10 transition-all mt-3"
            >
              Skip for now
            </button>
            <p className="text-xs text-[#555] text-center mt-3 max-w-xs">
              Some features will be limited until you verify your identity.
            </p>
          </div>
        )}

        {/* CIN FRONT */}
        {step === "cin-front" && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-4 border border-[#00FF88]/20">
              <IdCard className="w-7 h-7 text-[#00FF88]" />
            </div>
            <h2 className="text-xl font-space-grotesk font-bold mb-1">CIN Front Side</h2>
            <p className="text-[#888] text-center text-sm mb-6">
              Take a clear photo of the <strong className="text-white">front</strong> of your Tunisian CIN card
            </p>

            {error && (
              <div className="w-full text-red-500 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20 mb-4">{error}</div>
            )}

            {cameraSide === "front" ? (
              /* Camera overlay for front */
              <div className="w-full flex flex-col items-center">
                <div className="w-full aspect-[1.58] rounded-xl overflow-hidden border border-white/20 relative bg-black mb-4">
                  <video ref={cinVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={stopCinCamera}
                    className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                  <button
                    onClick={captureCinPhoto}
                    className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                  >
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </button>
                </div>
              </div>
            ) : frontPreview ? (
              <div className="w-full aspect-[1.58] rounded-xl overflow-hidden border border-[#00FF88]/30 mb-4 relative">
                <img src={frontPreview} alt="CIN Front" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-[#00FF88] rounded-full p-1">
                  <CheckCircle2 className="w-4 h-4 text-black" />
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 mb-4">
                <button
                  onClick={() => startCinCamera("front")}
                  className="w-full aspect-[1.58] rounded-xl border-2 border-dashed border-white/20 hover:border-[#00FF88]/50 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02]"
                >
                  <Camera className="w-8 h-8 text-[#888] mb-2" />
                  <p className="text-sm text-[#888] font-bold">Take Photo</p>
                  <p className="text-xs text-[#555] mt-1">Use your camera</p>
                </button>
                <label className="w-full h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all">
                  <ImageIcon className="w-5 h-5 text-[#888] mr-2" />
                  <span className="text-sm font-bold text-[#888]">Choose from Gallery</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleGallerySelect("front")} />
                </label>
              </div>
            )}

            {frontPreview && cameraSide !== "front" && (
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setFrontImage(null); setFrontPreview(""); }}
                  className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button
                  onClick={() => setStep("cin-back")}
                  className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                >
                  Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* CIN BACK */}
        {step === "cin-back" && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-4 border border-[#00FF88]/20">
              <IdCard className="w-7 h-7 text-[#00FF88]" />
            </div>
            <h2 className="text-xl font-space-grotesk font-bold mb-1">CIN Back Side</h2>
            <p className="text-[#888] text-center text-sm mb-6">
              Now capture the <strong className="text-white">back</strong> of your CIN card
            </p>

            {error && (
              <div className="w-full text-red-500 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20 mb-4">{error}</div>
            )}

            {cameraSide === "back" ? (
              /* Camera overlay for back */
              <div className="w-full flex flex-col items-center">
                <div className="w-full aspect-[1.58] rounded-xl overflow-hidden border border-white/20 relative bg-black mb-4">
                  <video ref={cinVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={stopCinCamera}
                    className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                  <button
                    onClick={captureCinPhoto}
                    className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                  >
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </button>
                </div>
              </div>
            ) : backPreview ? (
              <div className="w-full aspect-[1.58] rounded-xl overflow-hidden border border-[#00FF88]/30 mb-4 relative">
                <img src={backPreview} alt="CIN Back" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-[#00FF88] rounded-full p-1">
                  <CheckCircle2 className="w-4 h-4 text-black" />
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 mb-4">
                <button
                  onClick={() => startCinCamera("back")}
                  className="w-full aspect-[1.58] rounded-xl border-2 border-dashed border-white/20 hover:border-[#00FF88]/50 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02]"
                >
                  <Camera className="w-8 h-8 text-[#888] mb-2" />
                  <p className="text-sm text-[#888] font-bold">Take Photo</p>
                  <p className="text-xs text-[#555] mt-1">Use your camera</p>
                </button>
                <label className="w-full h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all">
                  <ImageIcon className="w-5 h-5 text-[#888] mr-2" />
                  <span className="text-sm font-bold text-[#888]">Choose from Gallery</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleGallerySelect("back")} />
                </label>
              </div>
            )}

            {backPreview && cameraSide !== "back" && (
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setBackImage(null); setBackPreview(""); }}
                  className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button
                  onClick={handleUpload}
                  className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                >
                  Upload & Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* FACE PHOTO */}
        {step === "face-photo" && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-4 border border-[#00FF88]/20">
              <ScanFace className="w-7 h-7 text-[#00FF88]" />
            </div>
            <h2 className="text-xl font-space-grotesk font-bold mb-1">Face Verification</h2>
            <p className="text-[#888] text-center text-sm mb-6">
              Take a selfie to verify your identity
            </p>
            <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 rounded-xl p-3 mb-6 w-full">
              <p className="text-xs text-[#aaa] leading-relaxed text-center">
                <span className="text-[#00FF88] font-bold">Demo Mode:</span> Face photo is accepted automatically. No AI processing.
              </p>
            </div>

            {error && (
              <div className="w-full text-red-500 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20 mb-4">{error}</div>
            )}

            {cameraSide === "face" ? (
              <div className="w-full flex flex-col items-center">
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden border border-white/20 relative bg-black mb-4">
                  <video ref={faceVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={stopFaceCamera}
                    className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                  <button
                    onClick={captureFacePhoto}
                    className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                  >
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </button>
                </div>
              </div>
            ) : facePreview ? (
              <div className="w-full aspect-[3/4] rounded-xl overflow-hidden border border-[#00FF88]/30 mb-4 relative">
                <img src={facePreview} alt="Face" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-[#00FF88] rounded-full p-1">
                  <CheckCircle2 className="w-4 h-4 text-black" />
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 mb-4">
                <button
                  onClick={startFaceCamera}
                  className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-white/20 hover:border-[#00FF88]/50 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02]"
                >
                  <Camera className="w-8 h-8 text-[#888] mb-2" />
                  <p className="text-sm text-[#888] font-bold">Take Selfie</p>
                  <p className="text-xs text-[#555] mt-1">Use front camera</p>
                </button>
              </div>
            )}

            {facePreview && cameraSide !== "face" && (
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setFaceImage(null); setFacePreview(""); }}
                  className="flex-1 h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button
                  onClick={submitFacePhoto}
                  className="flex-1 h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
                >
                  Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* UPLOADING */}
        {step === "uploading" && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500">
            <Loader2 className="w-12 h-12 text-[#00FF88] animate-spin mb-4" />
            <h2 className="text-xl font-space-grotesk font-bold mb-1">Uploading...</h2>
            <p className="text-[#888] text-sm">Processing your documents</p>
          </div>
        )}

        {/* PROCESSING */}
        {step === "processing" && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center border border-[#00FF88]/20">
                <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
              </div>
            </div>
            <h2 className="text-xl font-space-grotesk font-bold mb-2">Verifying your identity...</h2>
            <p className="text-[#888] text-center text-sm max-w-xs mb-4">
              Demo mode: auto-verifying your identity.
            </p>
            {error && (
              <div className="w-full text-yellow-500 text-sm bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20 mb-4 text-center">{error}</div>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-[#555] mb-6">
              <div className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
              Processing in background
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full h-12 rounded-full bg-white/5 border border-white/10 text-[#888] font-bold text-sm flex items-center justify-center hover:bg-white/10 transition-all"
            >
              Go to Dashboard →
            </button>
          </div>
        )}

        {/* CIN INPUT (manual fallback) */}
        {step === "cin-input" && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[440px] text-center z-10 pt-10">
              <div className="mx-auto w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-6 border border-[#00FF88]/20 shadow-[0_0_40px_rgba(0,255,136,0.15)]">
                <IdCard className="w-8 h-8 text-[#00FF88]" />
              </div>
              <h2 className="text-2xl sm:text-[32px] font-space-grotesk font-bold mb-2">Enter your CIN</h2>
              <p className="text-[#888] mb-6 sm:mb-8 text-base sm:text-lg">
                We couldn't read your CIN number from the document. Please enter it manually to continue.
              </p>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] uppercase tracking-wider text-[#888] font-bold text-left">CIN Number</label>
                  <input
                    type="text"
                    value={manualCin}
                    onChange={(e) => setManualCin(e.target.value.replace(/\D/g, '').slice(0, 20))}
                    placeholder="e.g. 14045739"
                    className="w-full h-14 rounded-xl bg-white/5 border border-white/10 outline-none px-6 text-base text-white font-inter placeholder:text-white/20 focus:border-[#00FF88] focus:ring-[3px] focus:ring-[#00FF88]/10 transition-all text-center tracking-[0.1em]"
                  />
                </div>

                {cinError && (
                  <p className="text-red-500 text-sm text-center bg-red-500/10 rounded-xl py-2 px-4 border border-red-500/20">
                    {cinError}
                  </p>
                )}

                <button onClick={handleSubmitCin} disabled={cinLoading || manualCin.trim().length < 5} className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,255,136,0.25)]">
                  {cinLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Continue →"}
                </button>

                <button onClick={() => router.push("/dashboard")} className="text-[#888] text-sm hover:text-white transition-colors">
                  I'll do this later
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONTRACT */}
        {step === "contract" && !signedSuccess && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 overflow-y-auto">
            <div className="w-full max-w-[640px] z-10 pt-4 pb-10">
              <div className="mx-auto w-14 h-14 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-3 border border-[#00FF88]/20">
                <ScrollText className="w-6 h-6 text-[#00FF88]" />
              </div>
              <h2 className="text-center text-xl sm:text-2xl font-space-grotesk font-bold mb-1">Account Opening Agreement</h2>
              <p className="text-center text-[#888] mb-5 text-sm">
                Review the contract, accept the Terms & Conditions, and sign to fully activate your account.
              </p>

              {/* Contract text viewer */}
              <div className="bg-[#0c0c0c] border border-white/10 rounded-xl mb-5 overflow-hidden">
                <div className="bg-white/5 px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#888] uppercase tracking-wider">Contract Document</span>
                  {contractHash && (
                    <span className="text-[10px] text-[#666] font-mono">Hash: {contractHash.slice(0, 16)}...</span>
                  )}
                </div>
                <div className="max-h-[320px] overflow-y-auto p-4 text-xs text-[#bbb] leading-relaxed whitespace-pre-wrap font-mono">
                  {contractText ? contractText : (
                    <div className="flex items-center justify-center py-10 text-[#555]">
                      <Loader2 className="animate-spin w-4 h-4 mr-2" /> Loading contract...
                    </div>
                  )}
                </div>
              </div>

              {/* Terms acceptance */}
              <label className="flex items-start gap-3 mb-5 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className={cn(
                    "w-5 h-5 rounded border transition-all flex items-center justify-center",
                    termsAccepted ? "bg-[#00FF88] border-[#00FF88]" : "bg-white/5 border-white/20 group-hover:border-white/40"
                  )}>
                    {termsAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                  </div>
                </div>
                <span className="text-sm text-[#bbb] leading-relaxed">
                  I have read and agree to the <span className="text-[#00FF88] font-bold">NexaPay Account Opening Agreement</span>, including the Terms of Service, AML/KYC policies, data processing agreement, and electronic signature consent. I understand this agreement is legally binding and will be anchored on the NexaPay blockchain.
                </span>
              </label>

              {/* Signature Canvas */}
              <div className={cn("transition-opacity", termsAccepted ? "opacity-100" : "opacity-40 pointer-events-none")}>
                <p className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">Electronic Signature</p>
                <SignatureCanvas onChange={(data) => setSignatureData(data)} className="mb-4" />
              </div>

              {signError && (
                <div className="text-red-500 text-sm text-center bg-red-500/10 rounded-xl py-2 px-4 border border-red-500/20 mb-4">
                  {signError}
                </div>
              )}

              <button
                onClick={submitSignature}
                disabled={!signatureData || !termsAccepted || loadingSign || !contractText}
                className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,255,136,0.25)]"
              >
                {loadingSign ? <Loader2 className="animate-spin w-5 h-5" /> : "Sign & Activate Account \u2192"}
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === "success" && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-[#00FF88] rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(0,255,136,0.3)]">
              <CheckCircle2 className="w-10 h-10 text-black" />
            </div>
            <h2 className="text-2xl font-space-grotesk font-bold mb-2">Identity Verified!</h2>
            <p className="text-[#888] text-center text-sm mb-8 max-w-xs">
              Your CIN has been verified, your contract is signed, and your account is now fully activated. All features are unlocked.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              Go to Dashboard →
            </button>
          </div>
        )}

        {/* FAILED */}
        {step === "failed" && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-space-grotesk font-bold mb-2">Verification Failed</h2>
            <p className="text-[#888] text-center text-sm mb-2 max-w-xs">{failureReason || "We couldn't verify your identity."}</p>
            <p className="text-[#555] text-center text-xs mb-8 max-w-xs">
              Please make sure your CIN photos are clear and try again with good lighting.
            </p>
            <button
              onClick={resetFlow}
              className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              <RotateCcw className="w-5 h-5 mr-2" /> Try Again
            </button>
          </div>
        )}
      </div>

      {/* Hidden canvas for CIN camera capture */}
      <canvas ref={cinCanvasRef} className="hidden" />
      {/* Hidden canvas for face camera capture */}
      <canvas ref={faceCanvasRef} className="hidden" />
    </div>
  );
}
