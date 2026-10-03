import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Marine Survey Portal", template: "%s · Marine Survey Portal" },
  description: "RFQs, job orders, surveyor allocation, survey capture and report issuance for marine survey companies.",
  manifest: "/manifest.webmanifest",
  applicationName: "Marine Survey Portal",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b2545" },
    { media: "(prefers-color-scheme: dark)", color: "#07111d" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme before first paint (no flash). Storage may be unavailable → falls back to system.
const themeScript = `(function(){try{var t=localStorage.getItem('msp-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
