import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrustRails',
  description: 'The SSL Trust Layer for Autonomous Agent Finance on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
