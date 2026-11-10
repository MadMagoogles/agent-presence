import "./globals.css";
export const metadata = { title: "Agent Presence", description: "A calm, motion-first presence widget for AI agents. Hover, drag, and inspect simulated agent states." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
