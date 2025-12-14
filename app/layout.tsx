import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: 'Zevy AI - Multi-Model Intelligence',
  description:
    'Advanced AI assistant created by Adam Zein Ziqry (founder) - powered by Groq, Gemini, and comprehensive knowledge integration',
  icons: {
    icon: '/zevy-logo.jpg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/zevy-logo.jpg" type="image/jpeg" />
      </head>
      <body>
        <Analytics />
        <SpeedInsights />
        {children}
      </body>
    </html>
  )
}
