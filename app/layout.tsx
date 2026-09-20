import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reanalysis Legal | Source-Grounded Legal Document AI',
  description: 'Jurisdiction-aware, source-grounded AI analysis for legal documents.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
