import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "My Diary", template: "%s · My Diary" },
  description: "Your personal AI dashboard for tasks, goals, reminders, calendar, habits and notes.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#13110F" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('pad-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var v=JSON.parse(localStorage.getItem('pad-accent-vars')||'{}');if(v['--primary']&&(v['--primary']||'').toUpperCase()!=='#635BFF')for(var k in v)document.documentElement.style.setProperty(k,v[k]);if(localStorage.getItem('pad-density')==='compact')document.documentElement.classList.add('compact')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-m3-primary="#993399" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Roboto:wght@500&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Native looks only inside the phone apps (Material 3 on Android, Apple HIG on iPhone); inert in browsers. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://tgopinath.github.io/kolam-design-system/m3/kolam-m3.js" />
        <link rel="stylesheet" href="https://tgopinath.github.io/kolam-design-system/m3/kolam-m3.css" />
        <link rel="stylesheet" href="https://tgopinath.github.io/kolam-design-system/ios/kolam-ios.css" />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://tgopinath.github.io/kolam-design-system/ios/kolam-ios.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
