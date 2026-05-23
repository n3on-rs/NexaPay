"use client";

import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (full: string) => void;
  invalid?: boolean;
  placeholder?: string;
};

/** Stores full international format `216XXXXXXXX` (8 digits after country code). */
export function PhoneInputTN({
  id,
  value,
  onChange,
  invalid,
  placeholder = "XX XXX XXX",
}: Props) {
  const digits = value.replace(/\D/g, "");
  let local = "";
  if (digits.startsWith("216")) {
    local = digits.slice(3, 11);
  } else if (digits.length > 0) {
    local = digits.slice(0, 8);
  }

  return (
    <div
      className={cn(
        "flex h-12 w-full items-stretch overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0b0e] transition-colors focus-within:border-[#00d4aa]/55 focus-within:ring-2 focus-within:ring-[#00d4aa]/20",
        invalid && "border-red-500 ring-2 ring-red-500/25",
      )}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-r border-white/10 px-3.5"
        aria-hidden
      >
        <span className="text-[1.15rem] leading-none" title="Tunisia">
          🇹🇳
        </span>
        <span className="text-sm font-semibold tracking-wide text-white/90">
          +216
        </span>
      </div>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={local}
        className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-white outline-none placeholder:text-white/35"
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
          onChange(`216${raw}`);
        }}
      />
    </div>
  );
}
