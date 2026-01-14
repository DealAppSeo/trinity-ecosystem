import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav } from "@/components/MobileNav";
import { NavBar } from "@/components/NavBar";
import { MockBanner } from "@/components/MockBanner";
import { Gatekeeper } from "@/components/Gatekeeper";

export const metadata: Metadata = {
  title: "Founders App | AI Symphony",
  description: "The autonomous operating system for your startup.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
  viewportFit: "cover",
};

import { ToastProvider } from "@/components/ui/Toast";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="font-display antialiased pt-16 pb-16 md:pb-0">
        <ToastProvider>
          <GlobalErrorBoundary>
            <Gatekeeper />
            <MockBanner />
            <NavBar />
            {children}
            <MobileNav />
          </GlobalErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  );
}
