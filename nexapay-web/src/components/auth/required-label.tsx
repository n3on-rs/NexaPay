import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function RequiredLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn("text-sm font-medium text-white/90", className)}
    >
      {children}
      <span className="text-red-500" aria-hidden>
        {" "}
        *
      </span>
    </Label>
  );
}
