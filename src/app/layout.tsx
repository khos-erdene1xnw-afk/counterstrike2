import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { CurrencyProvider } from '@/providers/currency-provider';
import { ToastProvider } from '@/providers/toast-provider';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });

export const metadata: Metadata = {
  title: 'CS2 GOLD | Premium CS2 Skin Marketplace',
  description: 'Buy, sell and trade CS2 skins securely. Mongolian QPay payments, instant MNT/USD pricing, Steam-verified escrow trading.',
  keywords: ['CS2', 'skins', 'marketplace', 'Steam', 'QPay', 'Mongolia', 'trading'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${jakarta.variable} ${grotesk.variable}`}>
      <body className="min-h-dvh font-sans antialiased selection:bg-gold-500 selection:text-black">
        <CurrencyProvider>
          <ToastProvider>
            <div className="flex min-h-dvh flex-col">
              <Navbar />
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8">{children}</main>
              <Footer />
            </div>
          </ToastProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
