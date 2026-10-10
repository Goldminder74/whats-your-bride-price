import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./analyticsConsent.css";
import "./privacyControls.css";
import "./cowrieCommerce.css";
import "./privacyReview.css";
import "./royalReveal.css";
import "./dailyChallenge.css";
import "./mobile.css";
import "./information.css";
import { PRODUCT_SAFEGUARD } from "./productSafeguards";
import { createPublicAppUrl, PUBLIC_APP_ORIGIN } from "./publicAppOrigin";
import AnalyticsConsent from "./AnalyticsConsent";

const canonicalHomeUrl = createPublicAppUrl();
const socialImageUrl = createPublicAppUrl("/og-v2.png");

// Vinext beta.2 omits viewportFit when serializing Viewport. Emit one explicit
// tag below, suppressing its default width/scale tag. Keep pinch zoom available.
export const viewport: Viewport = {
  width: undefined,
  initialScale: undefined,
  themeColor: "#1d120b",
};

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_APP_ORIGIN),
  title: "What’s Your Bride Price? | The Pan-African Party Game",
  description: `Five regions. Sixty questions. One unforgettable reveal. ${PRODUCT_SAFEGUARD}`,
  alternates: {
    canonical: canonicalHomeUrl,
  },
  appleWebApp: {
    capable: true,
    title: "WYBP?",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "What’s Your Bride Price?",
    description: `Choose your African edition and test your culture knowledge. ${PRODUCT_SAFEGUARD}`,
    url: canonicalHomeUrl,
    images: [socialImageUrl],
  },
  twitter: {
    card: "summary_large_image",
    title: "What’s Your Bride Price?",
    description: `Five regions. Sixty questions. One unforgettable reveal. ${PRODUCT_SAFEGUARD}`,
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
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>{children}<AnalyticsConsent /></body>
    </html>
  );
}
