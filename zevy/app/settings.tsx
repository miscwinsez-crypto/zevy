'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Copy, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface ThemeColors {
  background: string
  sidebar: string
  panel: string
  border: string
  accent: string
  subdued: string
  secondary: string
  success: string
  error: string
}

const DEFAULT_DARK_PALETTE: ThemeColors = {
  background: '#050505',
  sidebar: '#0E0E0E',
  panel: '#101010',
  border: '#1F1F1F',
  accent: '#FFFFFF',
  subdued: '#8A8A8A',
  secondary: '#1A1A1A',
  success: '#10b981',
  error: '#ef4444'
}

const DEFAULT_LIGHT_PALETTE: ThemeColors = {
  background: '#F5F5F5',
  sidebar: '#FFFFFF',
  panel: '#FAFAFA',
  border: '#E5E5E5',
  accent: '#000000',
  subdued: '#666666',
  secondary: '#F0F0F0',
  success: '#059669',
  error: '#DC2626'
}

export default function Settings() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [customColors, setCustomColors] = useState<ThemeColors>(DEFAULT_DARK_PALETTE)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('guest')
  const [trait, setTrait] = useState('Straightforward')

  const currentPalette = theme === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE

  useEffect(() => {
    const savedTheme = localStorage.getItem('zevy_theme') as 'dark' | 'light' | null
    const savedColors = localStorage.getItem('zevy_custom_colors')
    const savedEmail = localStorage.getItem('zevy_email')
    const savedTrait = localStorage.getItem('zevy_trait')

    if (savedTheme) setTheme(savedTheme)
    if (savedColors) setCustomColors(JSON.parse(savedColors))
    if (savedEmail) setEmail(savedEmail)
    if (savedTrait) setTrait(savedTrait)
  }, [])

  const updateColor = (key: keyof ThemeColors, value: string) => {
    const updated = { ...customColors, [key]: value }
    setCustomColors(updated)
    localStorage.setItem('zevy_custom_colors', JSON.stringify(updated))
  }

  const resetColors = () => {
    const defaults = theme === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE
    setCustomColors(defaults)
    localStorage.setItem('zevy_custom_colors', JSON.stringify(defaults))
  }

  const copyEmail = () => {
    navigator.clipboard.writeText('zevy.cloud@gmail.com')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const colorKeys = Object.keys(customColors) as Array<keyof ThemeColors>

  return (
    <div style={{ background: currentPalette.background, color: currentPalette.accent }} className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/">
            <button className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-white transition-smooth">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>

        {/* Theme Customization */}
        <div className="p-6 rounded-lg mb-6" style={{ background: currentPalette.panel, border: `1px solid ${currentPalette.border}` }}>
          <h2 className="text-xl font-semibold mb-4">🎨 Theme Customization</h2>
          
          <div className="mb-6">
            <p className="text-sm mb-3" style={{ color: currentPalette.subdued }}>Select Theme:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className="px-4 py-2 rounded-lg transition-smooth text-sm font-semibold"
                style={{
                  background: theme === 'dark' ? currentPalette.accent : currentPalette.secondary,
                  color: theme === 'dark' ? currentPalette.background : currentPalette.accent
                }}
              >
                🌙 Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className="px-4 py-2 rounded-lg transition-smooth text-sm font-semibold"
                style={{
                  background: theme === 'light' ? currentPalette.accent : currentPalette.secondary,
                  color: theme === 'light' ? currentPalette.background : currentPalette.accent
                }}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {/* Color Picker Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {colorKeys.map((key) => (
              <div key={key}>
                <label className="text-xs font-semibold block mb-2" style={{ color: currentPalette.subdued }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customColors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="h-10 w-20 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={customColors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="flex-1 p-2 rounded text-xs focus:outline-none"
                    style={{ background: currentPalette.sidebar, border: `1px solid ${currentPalette.border}`, color: currentPalette.accent }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Reset Button */}
          <button
            onClick={resetColors}
            className="w-full py-2 rounded text-sm font-semibold transition-smooth"
            style={{ background: currentPalette.secondary, color: currentPalette.accent }}
          >
            Reset to Default
          </button>
        </div>

        {/* Account Info */}
        <div className="p-6 rounded-lg mb-6" style={{ background: currentPalette.panel, border: `1px solid ${currentPalette.border}` }}>
          <h2 className="text-xl font-semibold mb-4">👤 Account</h2>
          
          <div className="space-y-3">
            <div>
              <p className="text-xs mb-2" style={{ color: currentPalette.subdued }}>Email</p>
              <p className="font-semibold text-sm">{email}</p>
            </div>

            <div>
              <p className="text-xs mb-2" style={{ color: currentPalette.subdued }}>AI Trait</p>
              <p className="font-semibold text-sm">{trait}</p>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="p-6 rounded-lg mb-6" style={{ background: currentPalette.panel, border: `1px solid ${currentPalette.border}` }}>
          <h2 className="text-xl font-semibold mb-4">ℹ️ About Zevy AI</h2>
          
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-2">What is Zevy AI?</p>
              <p style={{ color: currentPalette.subdued }}>
                Zevy is an advanced AI assistant with dual-engine intelligence (Astra for speed, Vyra for depth), real-time web access, image generation capabilities, and adaptive personality traits.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-2">Creator</p>
              <p style={{ color: currentPalette.subdued }}>
                Built by Adam Zein Ziqry, a 15-year-old self-taught developer and future founder of Zevy Technologies.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-2">Core Values</p>
              <ul style={{ color: currentPalette.subdued }} className="list-disc list-inside space-y-1">
                <li>Obedient and user-focused</li>
                <li>Real-time information access</li>
                <li>Ethical and respectful</li>
                <li>Defensive of user interests</li>
                <li>Kind and professional</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-2">Features</p>
              <ul style={{ color: currentPalette.subdued }} className="list-disc list-inside space-y-1">
                <li>⚡ Astra - Fast responses</li>
                <li>✨ Vyra - Deep thinking</li>
                <li>🖼️ Nova - Image generation</li>
                <li>🌐 Web search integration</li>
                <li>🎨 Customizable themes</li>
                <li>📱 Persistent conversations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="p-6 rounded-lg" style={{ background: currentPalette.panel, border: `1px solid ${currentPalette.border}` }}>
          <h2 className="text-xl font-semibold mb-4">📧 Support</h2>
          
          <button
            onClick={copyEmail}
            className="w-full p-3 rounded-lg transition-smooth text-sm font-semibold flex items-center justify-between"
            style={{ background: currentPalette.sidebar, border: `1px solid ${currentPalette.border}` }}
          >
            <span style={{ color: currentPalette.success }}>zevy.cloud@gmail.com</span>
            {copied ? <CheckCircle size={16} style={{ color: currentPalette.success }} /> : <Copy size={16} />}
          </button>
          {copied && <p className="text-xs mt-2" style={{ color: currentPalette.success }}>✓ Copied to clipboard</p>}

          <div className="mt-4 space-y-2">
            <p className="text-xs" style={{ color: currentPalette.subdued }}>Follow Zevy:</p>
            <div className="flex gap-2">
              <a
                href="https://instagram.com/abbdamdam"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 p-2 rounded text-xs text-center transition-smooth"
                style={{ background: currentPalette.sidebar, color: currentPalette.accent }}
              >
                📷 Instagram
              </a>
              <a
                href="https://x.com/abdamzrock"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 p-2 rounded text-xs text-center transition-smooth"
                style={{ background: currentPalette.sidebar, color: currentPalette.accent }}
              >
                𝕏 Twitter
              </a>
            </div>
          </div>
        </div>

        {/* Version */}
        <div className="text-center mt-8">
          <p style={{ color: currentPalette.subdued }} className="text-xs">
            Zevy AI v1.0.0 • Created with ❤️ by Adam
          </p>
        </div>
      </div>
    </div>
  )
}
