import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Что? Где? Когда? — игровая платформа",
  description:
    "Телевизор, ведущий, администратор и игроки в одном интерфейсе CHGK.",
  icons: {
    icon: "/media/images/logo.png",
    apple: "/media/images/logo.png",
    shortcut: "/media/images/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${sans.variable} ${display.variable} antialiased bg-slate-950 text-amber-50`}
      >
        {children}
      </body>
    </html>
  );
}
