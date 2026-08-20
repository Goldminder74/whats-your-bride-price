import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What's Your Bride Price? African Culture Quiz",
  description: "15 joyful questions. One playful golden-cowrie result. Test your connection to African food, music, language, customs, art and history.",
  openGraph: {
    title: "What's Your Bride Price? African Culture Quiz",
    description: "How strong is your African culture connection? Take the 15-question challenge and share your golden-cowrie result.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "What's Your Bride Price? African Culture Quiz",
    description: "15 joyful questions. One highly shareable culture result.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}
