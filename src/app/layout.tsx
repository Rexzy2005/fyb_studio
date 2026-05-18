import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ExpirySweeper } from "@/components/userDesigns/ExpirySweeper";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  // Full range so every Tailwind weight class (font-light → font-extrabold)
  // resolves to a real Plus Jakarta face, no fake-bolding from the browser.
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FYB Studio",
  description: "Design-led templates you can personalize and export as PNG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} min-h-screen antialiased`}
        style={{
          background: "var(--canvas)",
          color: "var(--ink)",
          // Site-wide default - every page, modal, and component that
          // doesn't set its own font-family inherits Plus Jakarta Sans.
          // Mono labels and Geist body usages keep working because they
          // set their own font-family inline or via CSS vars.
          fontFamily:
            "var(--font-plus-jakarta, var(--font-geist-sans)), system-ui, sans-serif",
        }}
      >
        <SessionProvider>
          <ToastProvider>
            <ExpirySweeper />
            {children}
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
