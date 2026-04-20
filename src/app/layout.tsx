import "./globals.css";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AppProviders } from "./providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "EmagrecePlus Admin",
  description: "Administracao clinica e operacional",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} min-h-screen font-sans`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
