import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chakra App",
    template: "%s · Chakra App",
  },
  description:
    "WhatsApp orders, Click-to-WhatsApp sessions, and Meta Conversions API",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground flex min-h-dvh min-h-[100svh] flex-col touch-manipulation font-sans antialiased">
        <Providers>
          <a
            href="#main-content"
            className="bg-primary text-primary-foreground focus:not-sr-only sr-only fixed top-2 left-2 z-[100] rounded-lg px-3 py-2 text-sm font-medium shadow-lg focus:static focus:m-3"
          >
            Skip to main content
          </a>
          <SiteHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8"
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
