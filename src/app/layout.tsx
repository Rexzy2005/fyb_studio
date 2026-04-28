import type { Metadata } from "next";
import { Geist, Geist_Mono, Ms_Madi } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeToggleFloating } from "@/components/theme/ThemeToggleFloating";
import { SessionProvider } from "@/components/auth/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const msMadi = Ms_Madi({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-ms-madi",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${msMadi.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <SessionProvider>
          <ThemeToggleFloating />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
