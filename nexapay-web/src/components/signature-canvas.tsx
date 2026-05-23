"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Pen, Type, Eraser, Check } from "lucide-react";

interface SignatureCanvasProps {
  onChange: (dataUrl: string) => void;
  onModeChange?: (mode: "draw" | "type") => void;
  className?: string;
}

export default function SignatureCanvas({ onChange, onModeChange, className }: SignatureCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = React.useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = React.useState("");
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [hasDrawn, setHasDrawn] = React.useState(false);

  const getCtx = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    return ctx;
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  React.useEffect(() => {
    initCanvas();
    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange("");
  };

  const renderTypedSignature = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!typedName.trim()) {
      onChange("");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ctx.font = "italic 400 32px 'Brush Script MT', 'Segoe Script', cursive";
    ctx.fillStyle = "#00d4aa";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, rect.width / 2, rect.height / 2);
    onChange(canvas.toDataURL("image/png"));
    setHasDrawn(true);
  };

  React.useEffect(() => {
    if (mode === "type") {
      renderTypedSignature();
    }
  }, [typedName, mode]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Mode Toggle */}
      <div className="flex items-center gap-2 self-center bg-white/5 rounded-full p-1 border border-white/10">
        <button
          type="button"
          onClick={() => { setMode("draw"); clear(); onModeChange?.("draw"); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
            mode === "draw" ? "bg-[#00d4aa] text-black" : "text-[#888] hover:text-white"
          )}
        >
          <Pen size={14} /> Draw
        </button>
        <button
          type="button"
          onClick={() => { setMode("type"); clear(); onModeChange?.("type"); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
            mode === "type" ? "bg-[#00d4aa] text-black" : "text-[#888] hover:text-white"
          )}
        >
          <Type size={14} /> Type
        </button>
      </div>

      {mode === "type" && (
        <input
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Type your full name"
          className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-base text-white outline-none focus:border-[#00d4aa] focus:ring-[3px] focus:ring-[#00d4aa]/10 transition-all placeholder:text-white/20"
        />
      )}

      {/* Canvas */}
      <div className="relative w-full h-40 rounded-xl bg-[#0b0b0b] border border-white/10 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[#333] text-sm font-medium">
              {mode === "draw" ? "Draw your signature here" : "Type your name above"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 text-xs font-bold text-[#888] hover:text-white transition-colors"
        >
          <Eraser size={14} /> Clear
        </button>
        {hasDrawn && (
          <span className="flex items-center gap-1 text-xs font-bold text-[#00d4aa]">
            <Check size={14} /> Signature captured
          </span>
        )}
      </div>
    </div>
  );
}
