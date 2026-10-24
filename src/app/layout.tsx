import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Baloo 2 (by Ek Type): rounded, friendly and very readable in Devanagari.
const baloo = Baloo_2({ subsets: ["devanagari", "latin"], variable: "--font-baloo", display: "swap" });
// Seven-segment digits, like the microwave's own display.
const dseg = localFont({ src: "./fonts/DSEG7Classic-Bold.woff2", variable: "--font-dseg", display: "swap" });

export const metadata: Metadata = {
  title: "रसोई सखी",
  description: "LG माइक्रोवेव (MJEN286UGWF) के बारे में हिंदी में बोलकर पूछिए, सखी बताएगी।",
  appleWebApp: { capable: true, title: "सखी", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#eaf4dc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className={`${baloo.variable} ${dseg.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
