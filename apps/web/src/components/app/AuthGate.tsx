"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getRole, getToken, homeForRole } from "@/lib/api";

/** Client-side gate for recruiter/admin/portal shells. */
export function AuthGate({
  children,
  allowRoles,
}: {
  children: React.ReactNode;
  allowRoles?: Array<"recruiter" | "candidate" | "admin">;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }
    const role = (getRole() || "recruiter") as "recruiter" | "candidate" | "admin";
    if (allowRoles && !allowRoles.includes(role) && role !== "admin") {
      router.replace(homeForRole(role));
      return;
    }
    setReady(true);
  }, [router, pathname, allowRoles]);

  if (!ready) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }
  return <>{children}</>;
}
