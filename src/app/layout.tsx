import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Ms_Madi,
  Bricolage_Grotesque,
  Fraunces,
} from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeToggleFloating } from "@/components/theme/ThemeToggleFloating";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ExpirySweeper } from "@/components/userDesigns/ExpirySweeper";

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

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${msMadi.variable} ${bricolage.variable} ${fraunces.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <SessionProvider>
          <ExpirySweeper />
          <ThemeToggleFloating />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
