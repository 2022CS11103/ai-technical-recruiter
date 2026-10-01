"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy mock builder — send recruiters to the live job create flow. */
export default function NewInterviewRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/jobs/new");
  }, [router]);
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Opening job creator…
    </div>
  );
}
