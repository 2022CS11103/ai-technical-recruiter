import type { Metadata } from "next";
import { Figtree, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI Technical Recruiter",
  description: "Conduct adaptive technical interviews with AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${figtree.variable} antialiased`}>{children}</body>
    </html>
  );
}
