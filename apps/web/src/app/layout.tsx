import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter_Tight } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

// Three faces, three jobs.
//
// The previous set was Aptos with an Iowan Old Style display — both fonts that
// happen to ship with an operating system, so the app looked like a different
// product on Windows, macOS and Linux, and like nothing in particular on a
// Chromebook. These are loaded and subset with the app.
//
// Bricolage carries the personality and appears sparingly: the wordmark, page
// titles, big numbers. Enough character to be recognisable at a glance,
// without being tiring to read.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Inter Tight rather than plain Inter: this is a dense operator tool with a
// lot of labels in a small space, and the tighter cut fits more of them
// without dropping the size.
const body = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Timecodes, durations, percentages, ids — anything whose digits should line
// up between rows, and anything that came out of a machine rather than a
// person.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amplify",
  description: "One sermon becomes a week of content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
