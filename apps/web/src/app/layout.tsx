import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import Providers from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

const appUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

// Embed metadata for Farcaster sharing
const frame = {
  version: "1",
  imageUrl: `${appUrl}/opengraph-image.png`,
  button: {
    title: "Launch MiniHunt",
    action: {
      type: "launch_frame",
      name: "MiniHunt",
      url: appUrl,
      splashImageUrl: `${appUrl}/icon.png`,
      splashBackgroundColor: "#ffffff",
    },
  },
};

export const metadata: Metadata = {
  title: "MiniHunt",
  description: "Bet on the best miniapps.",
  openGraph: {
    title: "MiniHunt",
    description: "Bet on the best miniapps.",
    images: [`${appUrl}/opengraph-image.png`],
  },
  other: {
    "fc:frame": JSON.stringify(frame),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="relative flex min-h-screen flex-col">
          <Providers>
            <main className="flex-1">{children}</main>
          </Providers>
        </div>
      </body>
    </html>
  );
}
