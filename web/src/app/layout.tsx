import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Radio_Canada } from "next/font/google";

import { SiteFooter } from "@/components/SiteFooter";

import "./globals.css";

// Body: Atkinson Hyperlegible Next, drawn by the Braille Institute for low-vision readers.
// Next has no fallback metrics for it yet, so builds log a harmless "Failed to find font override" warning.
const body = Atkinson_Hyperlegible_Next({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Display: Radio Canada, set condensed via its width axis for addresses and headings.
const plate = Radio_Canada({
  variable: "--font-plate",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Block Brief: check a Toronto rental before you sign",
    template: "%s | Block Brief",
  },
  description:
    "Paste a Toronto rental listing or search an address to see the building's City inspection record and what's around it, from open data, with every fact linked to its source.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a26" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${body.variable} ${plate.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
