import './globals.css'
import type { Metadata } from 'next'

// Removed Google Fonts import
// const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Zevy AI - Dual-Engine Intelligence',
  description: 'Advanced AI assistant powered by Groq and Gemini',
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
      <body>{children}</body>
    </html>
  )
}