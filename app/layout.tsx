import type { Metadata } from "next";
import "./globals.css";
import "./jewels.css";

const jewelFonts = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL("https://brideprice.classesforculture.com"),
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={jewelFonts} />
        <link rel="stylesheet" href={jewelFonts} />
      </head>
      <body>{children}</body>
    </html>
  );
}
