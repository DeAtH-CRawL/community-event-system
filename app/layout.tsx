import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ORGANIZATION_TITLE } from "@/src/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${ORGANIZATION_TITLE} - Event System`,
  description: "A trust-based community event entry and food counter system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-emerald-500/30 selection:text-emerald-200`}
      >
        <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-[100] backdrop-blur-md bg-white/80 dark:bg-slate-900/80">
          <div className="max-w-xl mx-auto px-4 pt-4 flex flex-col items-center">
            <h1 className="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-1 text-center">
              {ORGANIZATION_TITLE}
            </h1>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mb-1">
              Live Event Session
            </p>
          </div>
          <nav className="max-w-xl mx-auto px-4 pb-4 pt-2 flex items-center justify-between gap-4">
            <Link
              href="/entry"
              className="flex-1 text-center text-[11px] font-black tracking-[0.2em] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 px-3 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-500 dark:hover:text-emerald-400 active:scale-95 transition-all focus:ring-4 focus:ring-emerald-500/10 outline-none uppercase"
            >
              Entry
            </Link>
            <Link
              href="/food"
              className="flex-1 text-center text-[11px] font-black tracking-[0.2em] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 px-3 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-500 dark:hover:text-emerald-400 active:scale-95 transition-all focus:ring-4 focus:ring-emerald-500/10 outline-none uppercase"
            >
              Food
            </Link>
            {process.env.NODE_ENV === "development" && (
              <Link
                href="/admin"
                className="flex-1 text-center text-[11px] font-black tracking-[0.2em] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 px-3 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-500 dark:hover:text-emerald-400 active:scale-95 transition-all focus:ring-4 focus:ring-emerald-500/10 outline-none uppercase"
              >
                Admin
              </Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
