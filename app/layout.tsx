import type { Metadata } from "next";
import "./globals.css";
import { createPublicAppUrl, PUBLIC_APP_ORIGIN } from "./publicAppOrigin";

const canonicalHomeUrl = createPublicAppUrl();
const socialImageUrl = createPublicAppUrl("/og-v2.png");

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_APP_ORIGIN),
  title: "What’s Your Bride Price? | The Pan-African Party Game",
  description:
    "Five regions. Sixty questions. One unforgettable, entirely playful reveal.",
  alternates: {
    canonical: canonicalHomeUrl,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WYBP?",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "What’s Your Bride Price?",
    description: "Choose your African edition and discover your ceremonial main-character energy.",
    url: canonicalHomeUrl,
    images: [socialImageUrl],
  },
  twitter: {
    card: "summary_large_image",
    title: "What’s Your Bride Price?",
    description: "Five regions. Sixty questions. One unforgettable reveal.",
    images: [socialImageUrl],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
