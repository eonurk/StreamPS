
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "StreamPS",
    description: "Twitch to Kick Restreamer",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // The preload adds `electron` to <html> before React hydrates, which trips the
        // attribute check. This only suppresses diffs on <html>, not the tree below it.
        <html lang="en" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
