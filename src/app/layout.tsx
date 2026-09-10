import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RCG Clocking App", template: "%s | RCG Clocking App" },
  description: "Clock in and out at Redcatch Community Garden.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#d7652f" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
