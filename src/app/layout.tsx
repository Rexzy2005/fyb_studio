import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ExpirySweeper } from "@/components/userDesigns/ExpirySweeper";
import { ToastProvider } from "@/components/ui/Toast";
import { SITE_DESCRIPTION, SITE_NAME, resolveSiteUrl } from "@/lib/site/metadata";

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
  // Full range so every Tailwind weight class (font-light to font-extrabold)
  // resolves to a real Plus Jakarta face, no fake-bolding from the browser.
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: SITE_NAME, url: "https://fybstudio.art" }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "FYB Studio link preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
