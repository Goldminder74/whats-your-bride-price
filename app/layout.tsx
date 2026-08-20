import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://whats-your-bride-price.ayo43077.chatgpt.site"),
  title: "What's Your Bride Price? African Culture Quiz",
  description: "Choose one of five African regional culture editions, add your portrait, earn a playful golden-cowrie result and nominate your next challenger.",
  openGraph: {
    title: "What's Your Bride Price? African Culture Quiz",
    description: "Choose a region, add your portrait, test your culture knowledge and nominate a friend to beat your result.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "What's Your Bride Price? The African Culture Quiz" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "What's Your Bride Price? African Culture Quiz",
    description: "Five regional editions, personalised portrait results and friend nominations.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}
