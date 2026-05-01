import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RegOps AI",
  description:
    "Compliance-native AI back office for regulated fintech operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
