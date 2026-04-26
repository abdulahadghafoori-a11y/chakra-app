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
  title: "Chakra App",
  description:
    "WhatsApp orders, Click-to-WhatsApp sessions, and Meta Conversions API",
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
          <SiteHeader />
          <main className="flex-1 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
