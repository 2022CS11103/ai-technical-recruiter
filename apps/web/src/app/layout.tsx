import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZARA — AI Technical Recruiter",
  description: "Conduct adaptive technical interviews with AI.",
};

/**
 * Avoid next/font/google on Vercel — font CDN fetch failures crash SSR
 * with FUNCTION_INVOCATION_FAILED. System stacks stay reliable.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
