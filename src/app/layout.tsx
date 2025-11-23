
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
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
