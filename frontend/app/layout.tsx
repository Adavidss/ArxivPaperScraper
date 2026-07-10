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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme before first paint (default: mono-dark). Kept as a
// parser-blocking inline script so non-default themes never flash.
const THEME_BOOT = `(function(){try{var t=JSON.parse(localStorage.getItem("ab:settings")||"{}").theme;document.documentElement.setAttribute("data-theme",t||"mono-dark");}catch(e){document.documentElement.setAttribute("data-theme","mono-dark");}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-canvas text-fg">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
        <TabBarLive />
        <SWRegister />
      </body>
    </html>
  );
}
