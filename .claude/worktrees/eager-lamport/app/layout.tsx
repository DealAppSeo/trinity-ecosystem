import type React from "react"
import type { Metadata } from "next"
import { Space_Grotesk, Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
})

export const metadata: Metadata = {
  title: "AISocialMirror – AI Reveals Your Hidden IQ, EQ & SQ",
  description: "Paste your posts privately. Get instant insights + a refined shareable version. Nothing stored.",
  generator: "v0.app",
  openGraph: {
    title: "AISocialMirror – AI Reveals Your Hidden IQ, EQ & SQ",
    description: "Paste your posts privately. Get instant insights + a refined shareable version. Nothing stored.",
    images: [
      {
        url: "/mirror-reflection-graphic-with-ai-digital-interfac.jpg",
        width: 1200,
        height: 630,
        alt: "AISocialMirror - Discover your IQ, EQ, and SQ through AI",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AISocialMirror – AI Reveals Your Hidden IQ, EQ & SQ",
    description: "Paste your posts privately. Get instant insights + a refined shareable version. Nothing stored.",
    images: ["/mirror-reflection-graphic-with-ai-digital-interfac.jpg"],
  },
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${inter.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
