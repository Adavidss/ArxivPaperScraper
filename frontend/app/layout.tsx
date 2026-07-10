import type { Metadata, Viewport } from "next";
import { SWRegister } from "@/components/ui/SWRegister";
import { TabBarLive } from "@/components/ui/TabBarLive";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Daily Drop — bite-sized arXiv",
  description:
    "Your daily research drop: new papers from the people you follow, distilled into swipeable bites.",
  applicationName: "Daily Drop",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Drop",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-canvas text-fg">
        {children}
        <TabBarLive />
        <SWRegister />
      </body>
    </html>
  );
}
