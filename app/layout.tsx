import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealPilot — Your personal shopping agent",
  description: "Find the deal, not just the product. Compare offers, explore a simulated negotiation, and stay in control of every purchase.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
