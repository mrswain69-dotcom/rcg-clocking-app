import type { Metadata, Viewport } from "next";
import { Libre_Baskerville, Nunito_Sans } from "next/font/google";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";
import "./brand-overrides.css";

const uiFont = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const brandFont = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "RCG Clocking App", template: "%s | RCG Clocking App" },
  description: "Clock in and out at Redcatch Community Garden.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#16883c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${uiFont.variable} ${brandFont.variable}`}>
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
