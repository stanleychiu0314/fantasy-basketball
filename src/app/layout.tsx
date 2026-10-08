import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Google merged Big Shoulders Display into Big Shoulders.
const display = Big_Shoulders({ variable: "--font-display", subsets: ["latin"], weight: ["700", "800", "900"] });
const body = Hanken_Grotesk({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Gooners",
  description: "Live standings, weekly duo matchups and stakes for the Gooners fantasy basketball league.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Next.js requires a default export for layouts.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
