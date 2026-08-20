import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://whats-your-bride-price.ayo43077.chatgpt.site"),
  title: "What’s Your Bride Price? — The Pan-African Party Game",
  description:
    "Five regions. Sixty questions. One unforgettable, entirely playful reveal.",
  openGraph: {
    title: "What’s Your Bride Price?",
    description: "Choose your African edition and discover your ceremonial main-character energy.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "What’s Your Bride Price?",
    description: "Five regions. Sixty questions. One unforgettable reveal.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
