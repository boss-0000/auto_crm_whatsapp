import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoCRM · Atención automatizada por WhatsApp",
  description:
    "Bot con IA sobre WhatsApp Business API, presupuestos automáticos desde base propia y CRM con ruteo por sector para servicios automotrices.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
