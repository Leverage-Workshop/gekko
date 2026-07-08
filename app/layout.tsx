import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AlertsCenter } from './components/alerts-center'

// Inter is the display typeface used by the DESIGN.md source site. Loaded via
// next/font (self-hosted, zero layout shift) and exposed as --font-display,
// which the Tailwind @theme token in globals.css consumes.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Gekko',
  description: 'Advisory-only tactical NQ-futures briefing system.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* feat-026/027: alerts opt-in + Realtime notification lifecycle —
            mounted in the layout so the subscription survives navigation. */}
        <AlertsCenter />
      </body>
    </html>
  )
}
