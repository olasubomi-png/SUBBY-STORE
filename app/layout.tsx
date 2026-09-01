import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUBBY STORE — Your business. Your online store.",
  description:
    "Create your online store, sell your products and accept payments — without needing a website developer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
