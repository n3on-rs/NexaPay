"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00d4aa] border-t-transparent" />
    </div>
  );
}
