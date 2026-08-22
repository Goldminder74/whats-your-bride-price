import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://whats-your-bride-price.ayo43077.chatgpt.site"),
  title: "What’s Your Bride Price? | The Pan-African Party Game",
  description:
    "Five regions. Sixty questions. One unforgettable, entirely playful reveal.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WYBP?",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "What’s Your Bride Price?",
    description: "Choose your African edition and discover your ceremonial main-character energy.",
    images: ["/og-v2.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "What’s Your Bride Price?",
    description: "Five regions. Sixty questions. One unforgettable reveal.",
    images: ["/og-v2.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-cowrie-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-cowrie-64.png", sizes: "64x64", type: "image/png" },
    ],
    shortcut: "/favicon-cowrie-32.png",
    apple: [{ url: "/favicon-cowrie-180.png", sizes: "180x180", type: "image/png" }],
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
