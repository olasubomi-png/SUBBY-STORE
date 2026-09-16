import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SUBBY STORE",
    template: "%s · SUBBY STORE",
  },
  description:
    "Launch an online store, accept Paystack payments in NGN, and manage orders from one dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 font-sans text-ink-950 antialiased">
        {children}
      </body>
    </html>
  );
}
