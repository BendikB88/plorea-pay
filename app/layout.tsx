import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Betaling · Plorea",
  description: "Sikker betaling drevet av done°",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="no" className={`${instrumentSans.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
