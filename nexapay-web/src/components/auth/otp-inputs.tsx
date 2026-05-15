"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { otpSlotCircle, pinSlotCircle } from "@/components/auth/otp-slot-styles";

export function OtpInputSix({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      inputMode="numeric"
      containerClassName="w-full justify-center"
    >
      <div className="flex items-center justify-center gap-1 sm:gap-2">
        <InputOTPGroup className="gap-1.5 sm:gap-2">
          {[0, 1, 2].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className={otpSlotCircle(invalid)}
            />
          ))}
        </InputOTPGroup>
        <span
          className="select-none px-0.5 pb-0.5 text-lg font-light text-white/25"
          aria-hidden
        >
          –
        </span>
        <InputOTPGroup className="gap-1.5 sm:gap-2">
          {[3, 4, 5].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className={otpSlotCircle(invalid)}
            />
          ))}
        </InputOTPGroup>
      </div>
    </InputOTP>
  );
}

export function PinInputFour({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <InputOTP
      maxLength={4}
      value={value}
      onChange={onChange}
      inputMode="numeric"
      containerClassName="w-full justify-center"
    >
      <div className="flex items-center justify-center gap-1 sm:gap-2">
        <InputOTPGroup className="gap-1.5 sm:gap-2">
          {[0, 1].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className={pinSlotCircle(invalid)}
            />
          ))}
        </InputOTPGroup>
        <span
          className="select-none px-0.5 pb-0.5 text-lg font-light text-white/25"
          aria-hidden
        >
          –
        </span>
        <InputOTPGroup className="gap-1.5 sm:gap-2">
          {[2, 3].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className={pinSlotCircle(invalid)}
            />
          ))}
        </InputOTPGroup>
      </div>
    </InputOTP>
  );
}
