import { cn } from "@/lib/utils";

/** Circular / squircle slots, Kashy-style */
export const otpSlotCircle = (invalid?: boolean) =>
  cn(
    "flex size-11 rounded-full border border-white/[0.1] bg-[#0a0b0e] text-base font-semibold sm:size-12 sm:text-lg",
    "dark:bg-[#0a0b0e]",
    "dark:data-[active=true]:z-10 dark:data-[active=true]:border-[#00FF88] dark:data-[active=true]:ring-2 dark:data-[active=true]:ring-[#00FF88]/30",
    invalid &&
      "border-red-500 ring-2 ring-red-500/25 dark:data-[active=true]:border-red-500",
  );

export const pinSlotCircle = (invalid?: boolean) =>
  cn(
    "flex size-12 rounded-full border border-white/[0.1] bg-[#0a0b0e] text-xl font-semibold sm:size-14 sm:text-2xl",
    "dark:data-[active=true]:border-[#00FF88] dark:data-[active=true]:ring-2 dark:data-[active=true]:ring-[#00FF88]/30",
    invalid &&
      "border-red-500 ring-2 ring-red-500/25 dark:data-[active=true]:border-red-500",
  );
