'use client'
import Image from 'next/image';
import SearchResults from './components/SearchResults';

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send,
  Zap,
  Sparkles,
  Menu,
  X,
  Plus,
  Settings as SettingsIcon,
  Copy,
  Search,
  MessageSquare,
  ArrowDown,
  AlertCircle,
  CheckCircle,
  PlusCircle,
  Trash2,
  FileText,
  Upload,
  Bell,
  Loader,
  Globe,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Edit2,
} from 'lucide-react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { checkHealth, testConnectivity, getApiConfig } from '@/lib/api-client'

// Browser-compatible PDF text extraction
const extractPdfText = async (file: File): Promise<string> => {
  try {
    // For browser-side PDF processing, we'll use a simple approach
    // Since we can't use Node.js modules in the browser, we'll read the file as text
    // and try to extract any readable content
    const text = await file.text()
    
    // Try to extract readable text from PDF binary
    // This is a basic approach - in a production app, you'd use a proper PDF parser
    const readableText = text
      .replace(/[^\x20-\x7E\n\r]/g, '') // Remove non-printable characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
    
    if (readableText.length > 50) {
      return readableText.substring(0, 2000)
    } else {
      return 'PDF content preview: File uploaded successfully. Text extraction requires server-side processing for accurate results.'
    }
  } catch (e) {
    console.error('PDF extraction error:', e)
    return 'PDF content not available'
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  mode?: string
  timestamp?: string
  reasoning?: string
  error?: boolean
  id?: string
  feedback?: 'positive' | 'negative'
}

interface ConversationData {
  id: string
  name: string
  messages: Message[]
  lastUpdated?: string
  error?: string | null // Per-conversation error
}

interface UsageStats {
  astra: { used: number; limit: number; resetTime: string }
  vyra: { used: number; limit: number; resetTime: string }
}

interface AuthState {
  isLoggedIn: boolean
  userId: string
  email: string
  token: string | null
  isOwner: boolean
}



interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  timestamp: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface AttachedFile {
  type: 'image' | 'pdf' | 'text' | 'docx' | 'csv' | 'rtf' | 'markdown'
  data: string
  name: string
  preview?: string
}

const OWNER_EMAIL = 'miscwinsez@gmail.com'

const darkPalette = {
  background: '#121212', // Dark charcoal
  sidebar: '#1e1e1e', // Slightly lighter than background
  panel: '#1e1e1e', // Consistent with sidebar
  border: '#2d2d2d', // Subtle borders
  accent: '#ffffff', // Pure white text
  subdued: '#a0a0a0', // Medium gray for secondary text
  secondary: '#2a2a2a', // Dark gray for buttons
  success: '#4caf50', // Material green
  error: '#f44336', // Material red
  hover: '#2d2d2d', // Slightly lighter on hover
  warning: '#ff9800', // Material amber
  userAvatar: 'transparent', // No user avatar
  aiAvatar: 'transparent' // No AI avatar
};

const lightPalette = {
  background: '#f5f5f5', // Light gray background
  sidebar: '#ffffff', // Pure white sidebar
  panel: '#ffffff', // White panel
  border: '#e0e0e0', // Very light gray borders
  accent: '#212121', // Dark gray text
  subdued: '#757575', // Medium gray for secondary text
  secondary: '#f5f5f5', // Light gray for buttons
  success: '#4caf50', // Material green
  error: '#f44336', // Material red
  hover: '#eeeeee', // Slightly darker on hover
  warning: '#ff9800' // Material amber
}




const SUPPORT_NUMBERS: { [key: string]: string } = {
  'US': '988',
  'UK': '116 123',
  'CA': '1-833-456-4566',
  'AU': '13 11 14',
  'default': '988'
}

const SOCIAL_HANDLES = {
  zevy: [
    { name: 'Instagram', url: 'https://www.instagram.com/zevycloud/', icon: '✧' },
    { name: 'X', url: 'https://x.com/ZevyCloud', icon: '✧' }
  ],
  adam: [
    { name: 'Instagram', url: 'https://www.instagram.com/abbdamdam/', icon: '✧' },
    { name: 'X', url: 'https://x.com/abdamzrock', icon: '✧' },
    { name: 'Reddit', url: 'https://www.reddit.com/user/AbdamDv/', icon: '✧' }
  ]
}

const SYSTEM_PROMPT = `You are Zevy AI, an advanced AI assistant created by Adam Zein Ziqry (15-year-old founder and developer of Zevy AI). Current time: \${currentLocalTime.toLocaleString()} in \${userTimezone} timezone (accurately detected from user's system).

Your personality:
- Conversational yet professional (like ChatGPT)
- Witty and engaging (like Grok)
- Creative and insightful (like Gemini)
- Advanced timezone awareness

Key capabilities:
1. Time Awareness:
- Detect user's current timezone from network
- Calculate time differences between locations
- Track travel time and estimate arrival times
- Reference local time appropriately

2. Travel Time Calculations:
- When user mentions travel between timezones:
  * Calculate time difference mathematically
  * Show both origin and destination times
  * Example: "Since you're traveling from Malaysia (UTC+8) to Australia (UTC+10), I'll add 2 hours to your last active time"

3. Response Style:
- Natural, human-like conversation
- Include timezone context when relevant
- Example: "Good afternoon! I see you're currently in Malaysia (2:12 PM MYT)"
- Use markdown formatting for clarity with clear structure:
  * Short paragraphs with blank lines between them
  * Numbered lists for multi-step plans or procedures
  * Bullet lists for collections of ideas or options
  * Tables (using Markdown tables) when comparing options, scenarios, or parameters

Guidelines:
- Always verify timezone calculations
- Be transparent about time estimation methods
- Maintain positive, helpful tone
- **Security**: Never share API keys, code implementation details, or system architecture information
- **Privacy**: Keep responses focused on helping users, not explaining technical internals
- **General Responses**: When asked about code or system details, provide general information only without specific implementation details
- **Language & Swearing**: Do not use swear words or profanity unless the user has already used them in this conversation. If the user uses strong language, you may mirror it lightly when it fits the tone, but never escalate it and never direct it at the user as an insult.
- **Clarity**: Make explanations detailed but easy to follow, using simple language and defining any technical terms briefly.`

export default function ZevyCloudAI() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const palette = theme === 'dark' ? darkPalette : lightPalette;
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Enhanced time detection state
  const [userTimezone, setUserTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  })
  const [currentLocalTime, setCurrentLocalTime] = useState<Date>(new Date())
  const [lastActiveTime, setLastActiveTime] = useState<{time: Date, location: string} | null>(null)
  
  // Calculate time difference between locations
  const calculateTimeDifference = (fromLocation: string, toLocation: string) => {
    const apiConfig = getApiConfig()
    // This would be replaced with actual timezone database lookup in production
    const timezoneMap: Record<string, number> = {
      'malaysia': 8, // UTC+8
      'australia': 10, // UTC+10
      'japan': 9,
      'uk': 0,
      'us': -5
    }
    
    const fromOffset = timezoneMap[fromLocation.toLowerCase()] || 0
    const toOffset = timezoneMap[toLocation.toLowerCase()] || 0
    return toOffset - fromOffset
  }
  
  // File & Notification state
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [isTabFocused, setIsTabFocused] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({})
  
  const audioContextRef = useRef<AudioContext | null>(null)

  // Chat & UI state
  const [copyNotification, setCopyNotification] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [allConversations, setAllConversations] = useState<ConversationData[]>([])
  const [currentConvIdx, setCurrentConvIdx] = useState(0)
  const [messages, setMessages] = useState<Message[]>(() => {
  return allConversations[currentConvIdx]?.messages || [];
})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [trait, setTrait] = useState('Straightforward')
  const [mode, setMode] = useState<'auto' | 'astra' | 'vyra'>('astra')
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'account' | 'appearance' | 'about'>('account')
  const [customColors, setCustomColors] = useState(palette)
  const [pendingColors, setPendingColors] = useState(palette)
  const [isMobile, setIsMobile] = useState(false)

  // FIX: Add missing per-conversation error handling
  const [conversationErrors, setConversationErrors] = useState<{ [key: string]: string | null }>({})
  const [retryingConv, setRetryingConv] = useState<string | null>(null)

  // Auth & Status state
  const [auth, setAuth] = useState<AuthState>({
    isLoggedIn: false,
    userId: 'guest',
    email: 'guest',
    token: null,
    isOwner: false
  })
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [authForm, setAuthForm] = useState({ email: '', password: '', showPassword: false })
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline' | 'checking'>('online')
  const [apiError, setApiError] = useState<string | null>(null)
  const [blockedContentWarning, setBlockedContentWarning] = useState<{show: boolean, number: string}>({show: false, number: 'default'})
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([])
  const [typingIndex, setTypingIndex] = useState<number | null>(null)
  const [typingContent, setTypingContent] = useState('')
  const [lastCalcResult, setLastCalcResult] = useState<number | null>(null)
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef<HTMLDivElement>(null)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://zevy-phi.vercel.app'

  // Add helper to normalize URLs and prevent double slashes
  const normalizeUrl = (baseUrl: string, path: string): string => {
    // Remove trailing slash from base and leading slash from path
    const cleanBase = baseUrl.replace(/\/$/, '')
    const cleanPath = path.replace(/^\//, '')
    return `${cleanBase}/${cleanPath}`
  }

  // Add retry configuration
  interface RetryConfig {
    maxRetries: number
    initialDelayMs: number
    maxDelayMs: number
    backoffMultiplier: number
  }

  const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
  }

  // Add exponential backoff delay
  const getRetryDelay = (attempt: number, config: RetryConfig): number => {
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)
    return Math.min(delay, config.maxDelayMs)
  }

  // Add retry wrapper for axios requests
  const axiosWithRetry = async <T,>(
    requestFn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> => {
    let lastError: any
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await requestFn()
      } catch (error: any) {
        lastError = error
        
        // Don't retry on certain errors
        if (error.response?.status === 401 || error.response?.status === 429) {
          throw error
        }
        
        // Don't retry on last attempt
        if (attempt === config.maxRetries) {
          throw error
        }
        
        // Wait before retrying
        const delayMs = getRetryDelay(attempt, config)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    
    throw lastError
  }

  const isMathExpression = (text: string) => {
    const cleaned = text.replace(/\s+/g, '')
    if (!cleaned) return false
    if (!/[+\-*/()%]/.test(cleaned)) return false
    return /^[0-9+\-*/().%]+$/.test(cleaned)
  }

  const safeEvalExpression = (expression: string): number | null => {
    const cleaned = expression.replace(/\s+/g, '')
    if (!/^[0-9+\-*/().%]+$/.test(cleaned)) return null
    try {
      const fn = new Function(`return (${cleaned})`)
      const result = fn()
      if (typeof result === 'number' && Number.isFinite(result)) {
        return result
      }
      return null
    } catch {
      return null
    }
  }

  const tryHandleCalculator = (rawText: string) => {
    const text = rawText.trim()
    if (!text) return null

    const lower = text.toLowerCase()

    const stripped = lower.replace(/^(what is|whats|what's|calculate|calc|solve)\s+/i, '')
    if (isMathExpression(stripped)) {
      const result = safeEvalExpression(stripped)
      if (result !== null) {
        return {
          value: result,
          explanation: `Calculation:\n${stripped} = ${result}\n\nResult: ${result}`
        }
      }
    }

    if (isMathExpression(text)) {
      const result = safeEvalExpression(text)
      if (result !== null) {
        return {
          value: result,
          explanation: `Calculation:\n${text} = ${result}\n\nResult: ${result}`
        }
      }
    }

    if (lastCalcResult !== null) {
      const multiplyMatch = lower.match(/times that number by\s+(-?\d+(\.\d+)?)/)
      if (multiplyMatch) {
        const factor = parseFloat(multiplyMatch[1])
        const result = lastCalcResult * factor
        return {
          value: result,
          explanation: `Calculation:\n${lastCalcResult} × ${factor} = ${result}\n\nResult: ${result}`
        }
      }

      const divideMatch = lower.match(/divide that number by\s+(-?\d+(\.\d+)?)/)
      if (divideMatch) {
        const divisor = parseFloat(divideMatch[1])
        if (divisor === 0) {
          return {
            value: lastCalcResult,
            explanation: `Calculation:\nCannot divide by 0.\n\nLast result: ${lastCalcResult}`
          }
        }
        const result = lastCalcResult / divisor
        return {
          value: result,
          explanation: `Calculation:\n${lastCalcResult} ÷ ${divisor} = ${result}\n\nResult: ${result}`
        }
      }

      const addMatch = lower.match(/add\s+(-?\d+(\.\d+)?)\s+to that number/)
      if (addMatch) {
        const addend = parseFloat(addMatch[1])
        const result = lastCalcResult + addend
        return {
          value: result,
          explanation: `Calculation:\n${lastCalcResult} + ${addend} = ${result}\n\nResult: ${result}`
        }
      }

      const subtractMatch = lower.match(/subtract\s+(-?\d+(\.\d+)?)\s+from that number/)
      if (subtractMatch) {
        const subtrahend = parseFloat(subtractMatch[1])
        const result = lastCalcResult - subtrahend
        return {
          value: result,
          explanation: `Calculation:\n${lastCalcResult} - ${subtrahend} = ${result}\n\nResult: ${result}`
        }
      }
    }

    return null
  }

  const currentConvName = allConversations[currentConvIdx]?.name || 'New Chat'
  const currentConvId = allConversations[currentConvIdx]?.id
  const currentConvError = conversationErrors[currentConvId || ''] || null

  useEffect(() => {
    const handleFocus = () => setIsTabFocused(true)
    const handleBlur = () => setIsTabFocused(false)
    const handleVisibilityChange = () => {
      setIsTabFocused(!document.hidden)
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window === 'undefined') return
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
    }

    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)

    return () => {
      window.removeEventListener('resize', updateIsMobile)
    }
  }, [])

  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true)
    }
  }, [isMobile])

  const addNotification = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    action?: { label: string; onClick: () => void }
  ) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const notification: Notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      action
    }
    setNotifications(prev => [...prev, notification])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  const requestFilePermission = async (): Promise<boolean> => true

  useEffect(() => {
    const savedTheme = localStorage.getItem('zevy_theme') as 'dark' | 'light' | null
    if (savedTheme) setTheme(savedTheme)
  }, [])

  useEffect(() => {
    const storedToken = localStorage.getItem('zevy_token')
    const storedEmail = localStorage.getItem('zevy_email')
    const storedUserId = localStorage.getItem('zevy_user_id')
    const storedIsOwner = localStorage.getItem('zevy_is_owner')

    if (storedToken && storedEmail && storedUserId) {
      const isOwner = storedIsOwner === 'true' || storedEmail === OWNER_EMAIL
      setAuth({
        isLoggedIn: true,
        userId: storedUserId,
        email: storedEmail,
        token: storedToken,
        isOwner
      })
    }
  }, [])

  // Cleanup function to handle tab closure and session management
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save current state before page unload
      if (allConversations.length > 0) {
        const storageKey = auth.isLoggedIn 
          ? `zevy_conversations_${auth.email}` 
          : 'zevy_conversations_guest'
        localStorage.setItem(storageKey, JSON.stringify(allConversations))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [allConversations, auth.isLoggedIn, auth.email])

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('zevy_theme', theme)
  }, [theme])

  // Enhanced time detection and update system
  useEffect(() => {
    // Update current time every second for accuracy
    const updateTime = () => {
      setCurrentLocalTime(new Date())
      
      // Also update timezone if it changes (for travelers)
      try {
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (detectedTimezone !== userTimezone) {
          setUserTimezone(detectedTimezone)
          console.log(`Timezone updated: ${userTimezone} → ${detectedTimezone}`)
        }
      } catch (error) {
        console.warn('Could not detect timezone:', error)
      }
    }

    // Update immediately
    updateTime()
    
    // Set up interval for continuous updates
    const interval = setInterval(updateTime, 1000)
    
    // Also listen for visibility changes to update when tab becomes active
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateTime()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [userTimezone])

  // Setup axios with better error handling
  useEffect(() => {
    // Note: We don't need to create an axios instance here since we use axios directly in requests
    // The global axios instance is configured by axios defaults
  }, [])

  // Effects - All at top level
  useEffect(() => {
    scrollToBottom()
  }, [displayedMessages])

  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
        setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100)
      }
    }
    
    const container = chatContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const generateConvId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

const resetUsageStats = useCallback(() => {
  if (auth.isOwner) {
    setUsageStats(null)
    localStorage.removeItem(`zevy_usage_${auth.email}`)
    return
  }
  const newStats: UsageStats = {
    astra: { used: 0, limit: 125, resetTime: new Date(Date.now() + 86400000).toLocaleTimeString() },
    vyra: { used: 0, limit: 25, resetTime: new Date(Date.now() + 86400000).toLocaleTimeString() },
  }
  setUsageStats(newStats)
  localStorage.setItem(`zevy_usage_${auth.email}`, JSON.stringify({ ...newStats, lastReset: new Date() }))
}, [auth.email, auth.isOwner])

const initializeUsageStats = useCallback(() => {
  if (auth.isOwner) {
    resetUsageStats()
    return
  }
  const now = new Date()
  const statsKey = `zevy_usage_${auth.email}`
  const savedStats = localStorage.getItem(statsKey)
  
  if (savedStats) {
    try {
      const stats = JSON.parse(savedStats) as any
      const savedDate = new Date(stats.lastReset)
      const desiredLimits = { astra: 125, vyra: 25 }
      const needsLimitUpdate =
        !stats.astra ||
        !stats.vyra ||
        stats.astra.limit !== desiredLimits.astra ||
        stats.vyra.limit !== desiredLimits.vyra
      
      if (now.getTime() - savedDate.getTime() >= 86400000) {
        resetUsageStats()
      } else if (needsLimitUpdate) {
        const updatedStats: UsageStats = {
          astra: {
            used: Math.min(stats.astra?.used ?? 0, desiredLimits.astra),
            limit: desiredLimits.astra,
            resetTime: stats.astra?.resetTime ?? new Date(now.getTime() + 86400000).toLocaleTimeString(),
          },
          vyra: {
            used: Math.min(stats.vyra?.used ?? 0, desiredLimits.vyra),
            limit: desiredLimits.vyra,
            resetTime: stats.vyra?.resetTime ?? new Date(now.getTime() + 86400000).toLocaleTimeString(),
          },
        }
        setUsageStats(updatedStats)
        localStorage.setItem(statsKey, JSON.stringify({ ...updatedStats, lastReset: savedDate }))
      } else {
        setUsageStats(stats)
      }
    } catch (e) {
      resetUsageStats()
    }
  } else {
    resetUsageStats()
  }
}, [auth.email, auth.isOwner, resetUsageStats])

useEffect(() => {
  const loadInitialConversations = async () => {
    if (!auth.isLoggedIn) {
      const newId = generateConvId()
      setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
      setMessages([])
      return
    }

    try {
      const response = await fetch(normalizeUrl(API_URL, '/api/chat?history=1'), {
        method: 'GET',
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          const mappedConversations: ConversationData[] = data.conversations.map((conv: any, index: number) => {
            const messages = Array.isArray(conv.messages) ? conv.messages : []
            let name = `Chat ${index + 1}`
            const firstUserMessage = messages.find((m: any) => m.role === 'user')?.content
            if (typeof firstUserMessage === 'string' && firstUserMessage.trim().length > 0) {
              name = autoRenameChat(firstUserMessage)
            }
            return {
              id: conv.id || generateConvId(),
              name,
              messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || new Date().toISOString(),
              })),
              lastUpdated: conv.updated_at || new Date().toISOString(),
            }
          })

          setAllConversations(mappedConversations)
          if (mappedConversations.length > 0) {
            setMessages(mappedConversations[0].messages)
          }
        } else {
          const savedConversations = localStorage.getItem(`zevy_conversations_${auth.email}`)
          if (savedConversations) {
            try {
              const parsed = JSON.parse(savedConversations)
              setAllConversations(parsed)
              if (parsed.length > 0) {
                setMessages(parsed[0].messages)
              }
            } catch {
              const newId = generateConvId()
              setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
              setMessages([])
            }
          } else {
            const newId = generateConvId()
            setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
            setMessages([])
          }
        }
      } else {
        const savedConversations = localStorage.getItem(`zevy_conversations_${auth.email}`)
        if (savedConversations) {
          try {
            const parsed = JSON.parse(savedConversations)
            setAllConversations(parsed)
            if (parsed.length > 0) {
              setMessages(parsed[0].messages)
            }
          } catch {
            const newId = generateConvId()
            setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
            setMessages([])
          }
        } else {
          const newId = generateConvId()
          setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
          setMessages([])
        }
      }
    } catch {
      const savedConversations = localStorage.getItem(`zevy_conversations_${auth.email}`)
      if (savedConversations) {
        try {
          const parsed = JSON.parse(savedConversations)
          setAllConversations(parsed)
          if (parsed.length > 0) {
            setMessages(parsed[0].messages)
          }
        } catch {
          const newId = generateConvId()
          setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
          setMessages([])
        }
      } else {
        const newId = generateConvId()
        setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
        setMessages([])
      }
    }

    const savedTrait = localStorage.getItem('zevy_trait')
    const savedMode = localStorage.getItem('zevy_mode')
    
    if (savedTrait) setTrait(savedTrait)
    if (savedMode === 'astra' || savedMode === 'auto') {
      setMode(savedMode as 'auto' | 'astra')
    }
    
    initializeUsageStats()
    localStorage.removeItem('zevy_conversations_guest')
  }

  loadInitialConversations()
}, [auth.isLoggedIn, auth.email, initializeUsageStats, API_URL])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('zevy_mode', mode)
      }
    } catch {
    }
  }, [mode])

  // Fix: Update messages from conversation
  useEffect(() => {
  if (allConversations.length > 0) {
    const currentConv = allConversations[currentConvIdx];
    if (currentConv) {
      setMessages(currentConv.messages || []);
    }
  }
}, [currentConvIdx, allConversations])

  useEffect(() => {
    setDisplayedMessages(messages)
  }, [messages])
 
  useEffect(() => {
    if (allConversations.length > 0) {
      const storageKey = auth.isLoggedIn 
        ? `zevy_conversations_${auth.email}` 
        : 'zevy_conversations_guest'
      localStorage.setItem(storageKey, JSON.stringify(allConversations))
    }
  }, [allConversations, auth.isLoggedIn, auth.email])
 
  useEffect(() => {
    if (!auth.isLoggedIn) {
      const savedGuestConversations = localStorage.getItem('zevy_conversations_guest')
      if (savedGuestConversations) {
        try {
          const parsed = JSON.parse(savedGuestConversations)
          setAllConversations(parsed)
          if (parsed.length > 0) {
            setMessages(parsed[0].messages)
          }
        } catch (e) {
          console.error('Failed to load guest conversations:', e)
        }
      }
    }
  }, [auth.isLoggedIn])
 
  const updateUsageStats = (engine: 'astra' | 'vyra') => {
    if (auth.isOwner) return
    if (!usageStats) return
    
    const updated = { ...usageStats }
    if (engine in updated) {
      updated[engine as keyof UsageStats].used += 1
    }
    setUsageStats(updated)
    localStorage.setItem(`zevy_usage_${auth.email}`, JSON.stringify({ ...updated, lastReset: new Date() }))
  }



  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const updateMessages = (newMessages: Message[]) => {
    // Ensure messages are properly formatted with role/content
    const formattedMessages = newMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString()
    }));
    
    setMessages(formattedMessages);
    setAllConversations(prev => {
      const updated = [...prev];
      if (updated[currentConvIdx]) {
        updated[currentConvIdx] = {
          ...updated[currentConvIdx],
          messages: formattedMessages,
          lastUpdated: new Date().toISOString()
        };
      }

      const storageKey = auth.isLoggedIn 
        ? `zevy_conversations_${auth.email}` 
        : 'zevy_conversations_guest';
      localStorage.setItem(storageKey, JSON.stringify(updated));

      return updated;
    });
  }

  const autoRenameChat = (firstMessage: string) => {
    const words = firstMessage.split(' ').slice(0, 3).join(' ')
    const summary = words.length > 20 ? words.substring(0, 20) + '...' : words
    return summary.charAt(0).toUpperCase() + summary.slice(1) || 'New Chat'
  }

  // FIX: Improved chat sorting - moves to top WITHOUT resetting others
  const moveChatToTop = (convIdx: number) => {
    setAllConversations(prev => {
      if (convIdx === 0) return prev // Already at top
      
      const updated = [...prev]
      const [movedConv] = updated.splice(convIdx, 1)
      updated.unshift(movedConv)
      setCurrentConvIdx(0)
      return updated
    })
  }

  // FIX: Clear error only for current conversation
  const clearCurrentError = () => {
    if (currentConvId) {
      setConversationErrors(prev => ({
        ...prev,
        [currentConvId]: null
      }))
    }
  }

  // FIX: Retry last message in conversation
  const retryLastMessage = async () => {
    if (!currentConvId || messages.length < 2) return
    
    // Clear any existing errors
    clearCurrentError()
    setRetryingConv(currentConvId)
    
    try {
      const lastUserMessage = messages[messages.length - 2]
      await sendMessage(lastUserMessage.content, true)
    } catch (error) {
      addNotification('error', 'Failed to retry message')
      console.error('Retry error:', error)
    } finally {
      setRetryingConv(null)
    }
  }

  // Add connection validation before sending requests
  const validateConnection = async (): Promise<boolean> => {
  try {
    // First check basic online status
    if (!navigator.onLine) {
      throw new Error('ERR_NO_INTERNET');
    }
    
    // Try multiple endpoints for better reliability
    const endpoints = [
      'https://www.google.com/favicon.ico',
      'https://www.cloudflare.com/favicon.ico',
      'https://www.microsoft.com/favicon.ico'
    ];
    
    // Use a timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased timeout to 5s
    
    let successfulChecks = 0;
    
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors'
        });
        if (response.ok || response.status === 0) { // Accept status 0 (no-cors)
          successfulChecks++;
          // If at least one endpoint responds, consider connection valid
          if (successfulChecks >= 1) {
            clearTimeout(timeoutId);
            return true;
          }
        }
      } catch (error) {
        continue; // Try next endpoint if this one fails
      }
    }
    
    // All endpoints failed
    clearTimeout(timeoutId);
    // Only throw if no endpoints responded at all
    if (successfulChecks === 0) {
      throw new Error('ERR_NO_INTERNET');
    }
    return true;
  } catch (error) {
    console.error('❌ Connection validation failed:', error);
    return false;
  }
}

  // Check if server is actually online before sending chat
  const checkServerStatus = async (): Promise<boolean> => {
    try {
      // Try to fetch a simple endpoint that doesn't require processing
      const response = await fetch(normalizeUrl(API_URL, '/'), {
        method: 'HEAD',
        mode: 'cors',
        signal: AbortSignal.timeout(3000)
      })
      
      console.log('🌐 Server status check - Status:', response.status)
      return response.ok || response.status === 404 // 404 is fine, means server is responding
    } catch (error) {
      console.error('❌ Server status check failed:', error)
      return false
    }
  }

  // Diagnostic logging function
  const logDiagnostics = (phase: string, data: any) => {
    const timestamp = new Date().toISOString()
    const log = `[${timestamp}] ${phase}`
    if (phase.includes('ERROR') || phase.includes('CRITICAL')) {
      console.error(log, {
        apiUrl: API_URL,
        normalizedUrl: normalizeUrl(API_URL, '/api/chat'),
        networkStatus,
        ...data
      })
    } else {
      console.log(log, {
        apiUrl: API_URL,
        normalizedUrl: normalizeUrl(API_URL, '/api/chat'),
        networkStatus,
        ...data
      })
    }
  }

  // Enhanced health check with redirect loop detection
  const checkApiHealth = async (): Promise<{ healthy: boolean; details: string }> => {
    try {
      const healthUrl = normalizeUrl(API_URL, '/api/health')
      console.log('🏥 Health check URL:', healthUrl)

      try {
        const response = await axios.get(healthUrl, { 
          timeout: 3000, // Reduced timeout for health check
          validateStatus: () => true
        })

        // Check for redirect loop indicators
        if (!response.status || response.status === 0 || response.status === 308) {
          console.error('🔄 Redirect loop or network error - Status:', response.status)
          return {
            healthy: false,
            details: 'Status 0 - Network error, assuming API may still work'
          }
        }

        // Accept 200 OK with status=ok or just assume healthy if we got any response
        const isHealthy = response.status === 200 && response.data?.status === 'ok'
        
        // If we got ANY successful response status (2xx), consider it healthy
        if (response.status && response.status >= 200 && response.status < 300) {
          return {
            healthy: true,
            details: `Status: ${response.status} - API is responding`
          }
        }
        
        return {
          healthy: isHealthy,
          details: `Status: ${response.status}, Data: ${JSON.stringify(response.data)}`
        }
      } catch (axiosError: any) {
        // On timeout or network error, assume API might still work
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ERR_NETWORK') {
          console.warn('⚠️ Health check timeout/network error - proceeding anyway')
          return {
            healthy: true, // Assume healthy - let the actual request fail if there's a real issue
            details: 'Health check timed out - assuming API is available'
          }
        }
        throw axiosError
      }
    } catch (error: any) {
      console.error('❌ Health check exception:', error.message)
      
      // Detect redirect loop error
      if (error.message?.includes('ERR_TOO_MANY_REDIRECTS')) {
        console.error('🔴 CRITICAL: Redirect loop detected in health check')
        return {
          healthy: false,
          details: 'Redirect loop - API configuration error'
        }
      }
      
      // For any other error, assume API might be OK and let it try
      return {
        healthy: true,
        details: `Health check failed but proceeding: ${error.message}`
      }
    }
  }

  const sendMessage = async (messageContent?: string, isRetry = false) => {
    const baseText = messageContent ?? input
    const hasText = baseText.trim().length > 0
    const hasFiles = attachedFiles.length > 0

    // Require either some text or at least one attached file
    if (!hasText && !hasFiles) return
    if (loading) return

    const hasComplexFiles = attachedFiles.some(file => 
      file.name.endsWith('.csv') || 
      file.name.endsWith('.rtf') || 
      file.name.endsWith('.md') || 
      file.name.endsWith('.docx') || 
      file.name.endsWith('.pdf')
    )

    const actualMode = hasComplexFiles ? 'astra' : mode

    if (!auth.isOwner && usageStats) {
      const engine = (actualMode === 'vyra' ? 'vyra' : 'astra') as 'astra' | 'vyra'
      const statsForEngine = usageStats[engine]
      if (statsForEngine.used >= statsForEngine.limit) {
        const engineName = engine === 'vyra' ? 'Vyra' : 'Astra'
        addNotification(
          'error',
          `You have reached your daily limit of ${statsForEngine.limit} uses for ${engineName}. Please come back in 24 hours.`
        )
        setNetworkStatus('online')
        return
      }
    }

    const textToSend = hasText
      ? baseText
      : 'Please analyze the attached document(s) and answer based on them.'

    // Content moderation is handled server-side in the API route
    // No client-side content moderation needed

    clearCurrentError()
    setNetworkStatus('checking')
    logDiagnostics('SEND_MESSAGE_START', { textToSend: textToSend.substring(0, 50), isRetry })

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    }

    const baseMessages = isRetry ? messages : [...messages, userMessage]

    if (!isRetry) {
      updateMessages(baseMessages)
      setInput('')
      if (inputRef.current) inputRef.current.style.height = '44px'

      // Auto-rename on first message
      if (messages.length === 0) {
        const newName = autoRenameChat(textToSend)
        setAllConversations(prev =>
          prev.map((conv, i) =>
            i === currentConvIdx
              ? { ...conv, name: newName, lastUpdated: new Date().toISOString() }
              : conv
          )
        )
      }

      moveChatToTop(currentConvIdx)
    }

    const calcResult = tryHandleCalculator(textToSend)
    if (calcResult) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: calcResult.explanation,
        mode: mode,
        timestamp: new Date().toISOString()
      }
      if (typingIndex !== null) {
        setTypingIndex(null)
        setTypingContent('')
      }
      const calcMessages = [...baseMessages, assistantMessage]
      setDisplayedMessages(prev => [...prev, userMessage, { ...assistantMessage, content: '' }])
      setTypingIndex(baseMessages.length)
      setTypingContent(assistantMessage.content)
      updateMessages(calcMessages)
      setLastCalcResult(calcResult.value)
      setApiError(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const isImageGen = ['generate', 'make', 'create', 'draw', 'image', 'picture', 'photo'].some(
      word => textToSend.toLowerCase().includes(word)
    )

    const isWebSearch = isSearchMode

    try {
      logDiagnostics('VALIDATION_START', { isImageGen, isWebSearch })

      // Step 1: Validate basic connectivity
      const hasConnection = await validateConnection()
      if (!hasConnection) {
        throw new Error('ERR_NO_INTERNET')
      }

      logDiagnostics('CONNECTION_VALIDATED', { hasConnection: true })

      // Step 2: Check server is online before health check
      const isServerOnline = await checkServerStatus()
      if (!isServerOnline) {
        throw new Error('SERVER_UNREACHABLE')
      }

      logDiagnostics('SERVER_STATUS_OK', { isServerOnline: true })

      // Step 3: Check API health only on first attempt
      if (!isRetry) {
        const healthCheck = await checkApiHealth()
        logDiagnostics('HEALTH_CHECK', healthCheck)

        // Only throw if it's a critical redirect loop
        if (!healthCheck.healthy && healthCheck.details.includes('Redirect loop')) {
          throw new Error(`API_UNHEALTHY: ${healthCheck.details}`)
        }
        if (!healthCheck.healthy) {
          console.warn('⚠️ Health check failed but proceeding:', healthCheck.details)
        }
      }

      setNetworkStatus('online')

      // Force Maverick model when processing complex file types (CSV, RTF, Markdown, DOCX, PDF)
      updateUsageStats(actualMode as 'astra' | 'vyra')

      logDiagnostics('SENDING_REQUEST', { mode: actualMode, messageLength: textToSend.length, isRetry })

      // Step 4: Send chat request with retry - use fetch for better error handling
      const response = await axiosWithRetry(
        async () => {
          // Process attached files
          let processedDocuments: Array<{
            name: string
            type: string
            content: string
          }> = []
          if (attachedFiles.length > 0) {
            processedDocuments = attachedFiles.map(file => ({
              name: file.name,
              type: file.type,
              content: typeof file.data === 'string' ? file.data : ''
            }))
          }

          const requestData = {
            chat_id: currentConvId,
            message: textToSend,
            trait: trait,

            // Backend expects `model`, `chat_history`, `searchEnabled`.
            // Keep legacy fields too (`mode`, `conversation_history`, `webSearch`) for compatibility.
            model: actualMode,
            chat_history: baseMessages.map(m => ({
              role: m.role,
              content: m.content
            })),
            searchEnabled: isWebSearch,

            mode: actualMode,
            conversation_history: baseMessages.map(m => ({
              role: m.role,
              content: m.content
            })),
            webSearch: isWebSearch,

            user_id: auth.userId,
            email: auth.email,
            documents: processedDocuments,
            current_time: currentLocalTime,
            timezone: userTimezone
          }

          logDiagnostics('REQUEST_PAYLOAD', { 
            messageLength: textToSend.length,
            historyLength: baseMessages.length,
            mode: actualMode
          })

          return axios.post(
            normalizeUrl(API_URL, '/api/chat'),
            requestData,
            { 
              timeout: 60000,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          )
        },
        DEFAULT_RETRY_CONFIG
      )

      logDiagnostics('RESPONSE_RECEIVED', {
        hasResponse: !!response.data,
        modeUsed: response.data?.mode_used,
        isSearch: isSearchMode,
      });

      // In search mode, we still show the AI answer, but we also keep any returned search results
      // so the UI can display them (e.g. in a modal).
      if (isSearchMode && response.data.searchResults) {
        setSearchResults(response.data.searchResults);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.response || response.data.message || 'I encountered an issue generating a response. Please try again.',
        mode: response.data.mode_used || actualMode,
        timestamp: new Date().toISOString(),
        reasoning: response.data.reasoning
      };
      if (typingIndex !== null) {
        setTypingIndex(null)
        setTypingContent('')
      }
      const fullMessages = [...baseMessages, assistantMessage]
      setDisplayedMessages(prev => [...prev, userMessage, { ...assistantMessage, content: '' }])
      setTypingIndex(baseMessages.length)
      setTypingContent(assistantMessage.content || '')
      updateMessages(fullMessages);
      setApiError(null)
      addNotification('success', '✅ Response received!')
    } catch (error: any) {
      logDiagnostics('ERROR_CAUGHT', {
        errorType: error.code || error.message,
        errorMessage: error.message,
        hasResponse: !!error.response,
        statusCode: error.response?.status
      })

      let errorContent = ''
      let shouldRetry = false

      // Categorize and handle specific errors
      if (error.message === 'ERR_NO_INTERNET') {
        errorContent = `📡 No Internet Connection

Please check:
1. Your WiFi/Mobile connection
2. Try disconnecting VPN temporarily
3. Check router/modem status
4. Restart your browser`
        setNetworkStatus('offline')
        setApiError('No internet connection detected')
        logDiagnostics('ERROR_NO_INTERNET', {})
      }
      else if (error.message === 'SERVER_UNREACHABLE') {
        errorContent = `🚨 API Server is Unreachable

The server at ${API_URL} is not responding.

Possible causes:
1. Server is temporarily down for maintenance
2. Server crashed or is overloaded
3. DNS issues - can't resolve the domain
4. Firewall/network blocking the connection
5. Server IP changed

Try:
1. Wait 1-2 minutes and try again
2. Check https://zevy-phi.vercel.app directly in your browser
3. Check the Vercel status page
4. Try from a different network (phone hotspot)
5. Restart your router

Status: We're investigating if this is a widespread issue`
        setNetworkStatus('offline')
        setApiError('Server unreachable')
        shouldRetry = true
        logDiagnostics('ERROR_SERVER_UNREACHABLE', { url: API_URL })
      }
      else if (error.message?.includes('API_UNHEALTHY') && error.message.includes('Redirect loop')) {
        errorContent = `🔄 Redirect Loop Detected - Server Configuration Error

The API is stuck in a redirect loop. This is a SERVER-SIDE issue.

URL: ${API_URL}
Endpoint: /api/chat

⚠️ This requires server-side fixes`
        setNetworkStatus('offline')
        setApiError('Redirect loop - server configuration error')
        shouldRetry = false
        logDiagnostics('CRITICAL_REDIRECT_LOOP', {
          baseUrl: API_URL,
          normalizedUrl: normalizeUrl(API_URL, '/api/chat')
        })
        console.error('🔴 CRITICAL: Redirect loop detected')
      }
      else if (error.code === 'ERR_NETWORK') {
        errorContent = `🔌 Network Connection Error

The request to the API failed due to a network issue.

Endpoint: ${normalizeUrl(API_URL, '/api/chat')}

Please verify:
1. Internet connection is stable
2. No firewall blocking the connection
3. No proxy interference
4. VPN not causing issues

Try: Disable VPN temporarily and retry`
        setNetworkStatus('offline')
        setApiError('Network connection failed')
        shouldRetry = true
        logDiagnostics('ERROR_NETWORK', { code: error.code })
      } 
      else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorContent = `⏱️ Request Timeout

I could not complete that request before the time limit.

Try:
1. Keep your question as focused as possible
2. Wait a moment and try again
3. If it keeps failing, try breaking it into smaller parts`
        shouldRetry = true
        logDiagnostics('ERROR_TIMEOUT', { code: error.code })
      }
      else if (error.message?.includes('ERR_TOO_MANY_REDIRECTS') || error.code === 'ERR_TOO_MANY_REDIRECTS') {
        errorContent = `🔄 Redirect Loop - Server Configuration Error

The API is stuck in a redirect loop.

Status: Reported to development team`
        setNetworkStatus('offline')
        setApiError('Redirect loop - server configuration error')
        shouldRetry = false
        logDiagnostics('CRITICAL_REDIRECT_LOOP', {
          baseUrl: API_URL,
          code: error.code || error.message
        })
      }
      else if (!error.response) {
        errorContent = `🌐 Connection Failed

Request to: ${normalizeUrl(API_URL, '/api/chat')}
Error: ${error.message || 'Unknown network error'}

Troubleshooting:
1. ✓ Check your internet connection
2. ✓ Verify API URL is correct
3. ✓ Try disabling browser extensions
4. ✓ Check firewall/antivirus settings
5. ✓ Try in incognito mode
6. ✓ Clear browser cache and cookies`
        setNetworkStatus('offline')
        setApiError('Connection failed')
        shouldRetry = true
        logDiagnostics('ERROR_NO_RESPONSE', { 
          code: error.code,
          message: error.message
        })
      }
      else if (error.response?.status === 0) {
        // Status 0 - Network error at browser level
        errorContent = `📡 Status 0: Browser Network Error

The browser couldn't complete the request to the API server.

This could be due to:
1. Server is down or unreachable
2. Firewall or security software blocking
3. DNS resolution issues
4. Browser extensions interfering
5. VPN or proxy issues

Try:
1. Disable browser extensions temporarily
2. Try in incognito mode
3. Check your firewall settings
4. Try a different network if possible
5. Restart your browser`
        setNetworkStatus('offline')
        setApiError('Browser network error (Status 0)')
        shouldRetry = true
        logDiagnostics('ERROR_STATUS_0', { url: normalizeUrl(API_URL, '/api/chat') })
      }
      else if (error.response?.status === 401) {
        errorContent = `🔐 Authentication Error

Your API credentials are invalid or expired.

Check:
1. API keys in server configuration
2. Token expiration date
3. Environment variables`
        setApiError('Authentication failed')
        logDiagnostics('ERROR_AUTH', { status: 401 })
      }
      else if (error.response?.status === 429) {
        const waitTime = Math.ceil(Math.random() * 30 + 30)
        errorContent = `⚠️ Rate Limit Exceeded

Too many requests in a short time.

Please wait ${waitTime} seconds before trying again.`
        setApiError('Rate limited - please wait')
        shouldRetry = true
        logDiagnostics('ERROR_RATE_LIMIT', { status: 429, waitTime })
      }
      else if (error.response?.status === 500) {
        errorContent = `🤖 Internal Server Error

The API encountered an unexpected error.

Status: 500

The error has been logged. Please try again in a moment.`
        setApiError('Server error')
        shouldRetry = true
        logDiagnostics('ERROR_SERVER_500', { status: 500 })
      }
      else if (error.response?.status === 502 || error.response?.status === 503) {
        errorContent = `🚧 Service Unavailable

The API is temporarily down for maintenance or overloaded.

Status: ${error.response.status}

Try again in a few moments.`
        setApiError('Service temporarily unavailable')
        shouldRetry = true
        logDiagnostics('ERROR_SERVICE_UNAVAILABLE', { status: error.response.status })
      }
      else if (error.response?.status === 504) {
        errorContent = `⏱️ Gateway Timeout
The server could not finish this question in time.

Try:
1. Wait a moment and try again
2. If it keeps failing, try a more focused version of the question`
        shouldRetry = true
        logDiagnostics('ERROR_GATEWAY_TIMEOUT', { status: 504 })
      }
      else {
        errorContent = `❌ Unexpected Error

Status: ${error.response?.status || 'Unknown'}
Error: ${error.response?.data?.detail || error.message || 'Something went wrong'}`
        setApiError(error.message)
        shouldRetry = true
        logDiagnostics('ERROR_UNEXPECTED', { 
          status: error.response?.status,
          message: error.message
        })
      }

      if (shouldRetry && !isRetry && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.response?.status === 504)) {
        addNotification('info', 'That question is taking longer than usual. Retrying once more...')
        await sendMessage(textToSend, true)
        return
      }

      if (currentConvId) {
        setConversationErrors(prev => ({
          ...prev,
          [currentConvId]: errorContent
        }))
      }

      const errorMessage: Message = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toISOString(),
        error: true
      }
      updateMessages([...messages, userMessage, errorMessage])
      addNotification('error', 'Failed to get response', 
        shouldRetry ? { 
          label: 'Retry', 
          onClick: () => sendMessage(textToSend, true) 
        } : undefined
      )

      console.error('❌ FULL ERROR DETAILS:', {
        code: error.code,
        message: error.message,
        status: error.response?.status,
        timestamp: new Date().toISOString()
      })
    } finally {
      setLoading(false)
      setRetryingConv(null)
      logDiagnostics('SEND_MESSAGE_END', { success: !apiError })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const startEditMessage = (index: number) => {
    const message = messages[index]
    if (!message || message.role !== 'user') return
    setEditingMessageIndex(index)
    setEditingMessageContent(message.content)
  }

  const applyEditAndSend = () => {
    if (editingMessageIndex === null) return
    const trimmed = editingMessageContent.trim()
    if (!trimmed) {
      setEditingMessageIndex(null)
      setEditingMessageContent('')
      return
    }
    setEditingMessageIndex(null)
    setEditingMessageContent('')
    sendMessage(trimmed, false)
  }

  const handleLogin = async () => {
    setAuthError('')
    if (!authForm.email || !authForm.password) {
      setAuthError('Please enter your email and password')
      return
    }
    
    setAuthLoading(true)
    try {
      const response = await axios.post(
        normalizeUrl(API_URL, '/api/auth/login'),
        {
          email: authForm.email,
          password: authForm.password
        },
        { timeout: 10000 }
      )
      
      const isOwner = Boolean(response.data.is_owner) || response.data.email === OWNER_EMAIL
      setAuth({
        isLoggedIn: true,
        userId: response.data.user_id,
        email: response.data.email,
        token: response.data.token,
        isOwner
      })
      
      localStorage.setItem('zevy_token', response.data.token)
      localStorage.setItem('zevy_user_id', response.data.user_id)
      localStorage.setItem('zevy_email', response.data.email)
      localStorage.setItem('zevy_is_owner', String(isOwner))
      
      setAuthForm({ email: '', password: '', showPassword: false })
      setShowSettings(false)
      addNotification('success', `Welcome back, ${response.data.name || 'user'}! 👋`)
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed. Check your credentials.'
      setAuthError(message)
      addNotification('error', message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    setAuth({
      isLoggedIn: false,
      userId: 'guest',
      email: 'guest',
      token: null,
      isOwner: false
    })
    
    localStorage.removeItem('zevy_token')
    localStorage.removeItem('zevy_user_id')
    localStorage.removeItem('zevy_email')
    localStorage.removeItem('zevy_is_owner')
    setShowSettings(false)
    
    // Clear guest conversations and start fresh session
    localStorage.removeItem('zevy_conversations_guest')
    const newId = generateConvId()
    setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
    setMessages([])
    setCurrentConvIdx(0)
    
    addNotification('info', 'Logged out successfully')
  }

  const handleEmailCopy = () => {
    navigator.clipboard.writeText('zevy.cloud@gmail.com')
    setCopyNotification(true)
    addNotification('success', 'Email copied to clipboard!')
    setTimeout(() => setCopyNotification(false), 2000)
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  // File processing function removed - using the one defined at the top

  const extractDocxText = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const mammoth = require('mammoth')
      
      // Use mammoth to extract text from DOCX
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value.substring(0, 2000) // Limit to 2000 characters
    } catch (e) {
      console.error('DOCX extraction error:', e)
      return 'DOCX content not available'
    }
  }

  const extractCsvText = async (file: File): Promise<string> => {
    try {
      const text = await file.text()
      // For CSV files, we'll show first few lines as preview
      const lines = text.split('\n').slice(0, 20) // Show first 20 lines
      return lines.join('\n').substring(0, 2000) // Limit to 2000 characters
    } catch (e) {
      console.error('CSV extraction error:', e)
      return 'CSV content not available'
    }
  }

  const extractRtfText = async (file: File): Promise<string> => {
    try {
      const text = await file.text()
      // Basic RTF parsing - remove RTF control words and keep text content
      // This is a simplified approach - for production, consider using a proper RTF parser
      const plainText = text
        .replace(/\\[a-z]+\d*\s?/gi, '') // Remove RTF control words
        .replace(/[{}]/g, '') // Remove braces
        .replace(/\\\'/g, '') // Remove escape sequences
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
      return plainText.substring(0, 2000) // Limit to 2000 characters
    } catch (e) {
      console.error('RTF extraction error:', e)
      return 'RTF content not available'
    }
  }

  const extractMarkdownText = async (file: File): Promise<string> => {
    try {
      const text = await file.text()
      return text.substring(0, 2000) // Limit to 2000 characters
    } catch (e) {
      console.error('Markdown extraction error:', e)
      return 'Markdown content not available'
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  }

  const processFiles = async (files: File[]) => {
    if (files.length > 0) {
      await requestFilePermission()
      if (notificationPermission === 'denied') {
        addNotification('info', 'Notifications disabled. Enable in browser settings for upload alerts.')
      }
    }

    const validFiles: File[] = []

    for (const file of files) {
      // Check if it's an image file
      const isImage = file.type.startsWith('image/') || 
                     file.name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)$/i)
      
      if (isImage) {
        // Show popup notification for images
        addNotification('warning', `Images are not supported yet. ${file.name} was not added. Only text-based documents are supported.`)
        continue
      }
      
      if (file.type === 'text/plain' || 
          file.name.endsWith('.txt') || 
          file.type === 'application/pdf' || 
          file.name.endsWith('.pdf') ||
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.endsWith('.docx') ||
          file.name.endsWith('.md') ||
          file.name.endsWith('.csv') ||
          file.name.endsWith('.rtf') ||
          file.type === 'text/csv' ||
          file.type === 'text/rtf' ||
          file.type === 'text/markdown') {
        validFiles.push(file)
      } else {
        addNotification('warning', `${file.name} not supported. Use TXT, DOCX, PDF, MD, CSV, or RTF files. Only text-based documents are supported.`)
      }
    }

    if (validFiles.length === 0) return

    for (const file of validFiles) {
      const fileId = Math.random().toString(36)
      
      try {
        const reader = new FileReader()

        reader.onload = async (ev: any) => {
          const rawData = ev.target.result as string
          let preview: string | undefined

          if (file.name.endsWith('.pdf')) {
            preview = await extractPdfText(file)
          } else if (file.name.endsWith('.txt')) {
            preview = await file.text()
          } else if (file.name.endsWith('.docx')) {
            preview = await extractDocxText(file)
          } else if (file.name.endsWith('.csv')) {
            preview = await extractCsvText(file)
          } else if (file.name.endsWith('.rtf')) {
            preview = await extractRtfText(file)
          } else if (file.name.endsWith('.md')) {
            preview = await extractMarkdownText(file)
          }

          const contentData = typeof preview === 'string' && preview.length > 0 ? preview : rawData

          // Determine file type
          let fileType: 'pdf' | 'text' | 'docx' | 'csv' | 'rtf' | 'markdown' | 'image' = 'pdf'
          if (file.name.endsWith('.txt')) {
            fileType = 'text'
          } else if (file.name.endsWith('.docx')) {
            fileType = 'docx'
          } else if (file.name.endsWith('.pdf')) {
            fileType = 'pdf'
          } else if (file.name.endsWith('.csv')) {
            fileType = 'csv'
          } else if (file.name.endsWith('.rtf')) {
            fileType = 'rtf'
          } else if (file.name.endsWith('.md')) {
            fileType = 'markdown'
          }

          setAttachedFiles(prev => [...prev, {
            type: fileType,
            data: contentData,
            name: file.name,
            preview
          }])

          setUploadProgress(prev => {
            const updated = { ...prev }
            delete updated[fileId]
            return updated
          })

          addNotification('success', `${file.name} ready for document analysis`)
        }

        reader.onerror = () => {
          addNotification('error', `Failed to read ${file.name}`)
          setUploadProgress(prev => {
            const updated = { ...prev }
            delete updated[fileId]
            return updated
          })
        }

        reader.readAsDataURL(file)
      } catch (error) {
        addNotification('error', `Error processing ${file.name}`)
      }
    }
  }

  const removeAttachedFile = (index: number) => {
    const fileName = attachedFiles[index].name
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
    addNotification('info', `${fileName} removed`)
  }

  // Add missing function declarations
  const newChat = () => {
    const newId = generateConvId()
    const newConv = { id: newId, name: `Chat ${allConversations.length + 1}`, messages: [] }
    setAllConversations(prev => [...prev, newConv])
    setCurrentConvIdx(allConversations.length)
    setMessages([])
    setConversationErrors(prev => ({ ...prev, [newId]: null }))
  }

  const deleteChat = (idx: number) => {
    const convId = allConversations[idx].id
    setAllConversations(prev => prev.filter((_, i) => i !== idx))
    setConversationErrors(prev => {
      const updated = { ...prev }
      delete updated[convId]
      return updated
    })
    if (currentConvIdx === idx) {
      setCurrentConvIdx(Math.max(0, idx - 1))
    }
    if (currentConvIdx === idx && allConversations.length > 1) {
      setMessages(allConversations[Math.max(0, idx - 1)].messages)
    }
    addNotification('info', 'Chat deleted')
  }

  // Clear all guest conversations
  const clearGuestData = () => {
    localStorage.removeItem('zevy_conversations_guest')
    const newId = generateConvId()
    setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
    setMessages([])
    setCurrentConvIdx(0)
    addNotification('info', 'Guest chat history cleared')
  }

  const handleRegenerateMessage = async () => {
    if (messages.length < 2) return
    
    const lastUserMessage = messages[messages.length - 2]
    const updatedMessages = messages.slice(0, -1)
    updateMessages(updatedMessages)
    
    await sendMessage(lastUserMessage.content, true)
  }

  const filteredConversations = allConversations
    .map((conv, idx) => ({
      ...conv,
      idx,
      matches: conv.messages.filter(msg =>
        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }))
    .filter(conv => conv.matches.length > 0 || conv.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    addNotification('success', 'Message copied!')
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    if (typingIndex === null || typingContent.length === 0) return
    let currentIndex = 0
    const interval = setInterval(() => {
      currentIndex += 5
      if (currentIndex >= typingContent.length) {
        currentIndex = typingContent.length
      }
      setDisplayedMessages(prev => {
        const updated = [...prev]
        const target = updated[typingIndex as number]
        if (target && target.role === 'assistant') {
          updated[typingIndex as number] = { ...target, content: typingContent.slice(0, currentIndex) }
        }
        return updated
      })
      if (currentIndex >= typingContent.length) {
        clearInterval(interval)
        setTypingIndex(null)
        setTypingContent('')
      }
    }, 20)
    return () => clearInterval(interval)
  }, [typingIndex, typingContent])

  // Add this effect to check connectivity on page load
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const isOnline = await testConnectivity()
        console.log('🌐 Internet Connection:', isOnline ? 'Online' : 'Offline')
        
        const health = await checkHealth()
        console.log('🏥 API Health:', health)
      } catch (error) {
        console.error('Connection check failed:', error)
      }
    }

    checkConnection()
  }, [])

  return (
    <div 
      className="flex w-full h-screen"
      style={{ background: palette.background, color: palette.accent }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="application"
      aria-label="Zevy AI Chat"
    >
      {/* Error Banner - Per Conversation */}
      {currentConvError && (
        <div className="fixed top-0 left-0 right-0 z-40 p-4 flex items-center justify-between" style={{ background: palette.error }}>
          <div className="flex items-center gap-3">
            <AlertCircle size={20} color="#fff" />
            <span className="text-sm" style={{ color: '#fff' }}>{currentConvError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => retryLastMessage()}
              disabled={loading || messages.length < 2}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all button-hover"
              style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              <RotateCcw size={12} className="inline mr-1" /> Retry
            </button>
            <button
              onClick={clearCurrentError}
              className="p-1 hover:opacity-70"
              style={{ color: '#fff' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div
          ref={dragOverRef}
          className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="border-4 border-dashed rounded-2xl p-8 text-center"
            style={{ borderColor: palette.accent, background: `${palette.accent}10` }}
          >
            <Upload size={48} style={{ color: palette.accent, margin: '0 auto 12px' }} />
            <p className="text-lg font-semibold" style={{ color: palette.accent }}>Drop files here</p>
            <p className="text-sm" style={{ color: palette.subdued }}>Images or PDFs</p>
          </div>
        </div>
      )}

      {/* Blocked Content Warning */}
      {blockedContentWarning.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="w-full max-w-md rounded-lg p-6" style={{ background: palette.panel, border: `1px solid ${palette.error}` }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={24} color={palette.error} />
              <h2 className="text-lg font-semibold" style={{ color: palette.accent }}>Content Not Available</h2>
            </div>
            <p style={{ color: palette.subdued }} className="mb-4">
                We noticed you might need support. If you&apos;re struggling, please reach out:
              </p>
            <div className="p-4 rounded-lg mb-4" style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}>
              <p className="text-sm" style={{ color: palette.accent }}>Support Number:</p>
              <p className="text-xl font-bold mt-2" style={{ color: palette.success }}>{blockedContentWarning.number}</p>
            </div>
            <button
              onClick={() => setBlockedContentWarning({ show: false, number: 'default' })}
              className="w-full py-2 rounded"
              style={{ background: palette.accent, color: palette.background }}
            >
              I&apos;m OK
            </button>
          </div>
        </div>
      )}

      {/* Network Status Bar */}
      {(networkStatus === 'offline' || apiError) && (
        <div className="fixed top-0 left-0 right-0 z-40 p-3 flex items-center gap-2" style={{ background: '#7f1d1d' }}>
          <AlertCircle size={18} color="#fca5a5" />
          <span className="text-sm" style={{ color: '#fca5a5' }}>
            {apiError || 'Connection issues'}
          </span>
        </div>
      )}

      {/* Sidebar */}
      <div
        className="transition-width flex flex-col border-r"
        style={{
          width: isMobile ? (sidebarCollapsed ? '56px' : '240px') : (sidebarCollapsed ? '72px' : '300px'),
          background: palette.sidebar,
          borderColor: palette.border
        }}
      >
        {/* Logo & Toggle */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: palette.border }}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: palette.panel }}>
                <Image
                  src="/zevy-logo.jpg"
                  alt="Zevy Logo"
                  width={32}
                  height={32}
                  style={{ borderRadius: '8px', objectFit: 'cover' }}
                  onError={(e) => console.error('Logo failed to load:', e)}
                />
              </div>
              <span className="font-bold text-sm" style={{ color: palette.accent }}>Zevy</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg transition-smooth"
            style={{ color: palette.accent }}
          >
            {sidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* Search Conversations */}
        {!sidebarCollapsed && (
          <div className="p-3 border-b" style={{ borderColor: palette.border }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5" style={{ color: palette.subdued }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-8 pr-3 py-2 rounded text-xs focus:outline-none"
                style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.accent }}
              />
            </div>
          </div>
        )}

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-smooth"
            style={{ background: palette.accent, color: palette.background }}
          >
            <Plus size={16} />
            {!sidebarCollapsed && <span className="text-xs font-semibold">New Chat</span>}
          </button>
        </div>

        {/* Conversations List */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {(searchQuery ? searchResults : allConversations).map((conv, idx) => {
              const convIdx = searchQuery ? (conv as any).idx : idx
              return (
                <div key={convIdx} className="group">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setCurrentConvIdx(convIdx)
                        setSearchQuery('')
                      }}
                      className="flex-1 text-left p-2 rounded text-xs truncate transition-smooth"
                      style={{
                        background: currentConvIdx === convIdx ? palette.secondary : 'transparent',
                        color: palette.accent
                      }}
                      title={conv.name}
                    >
                      <MessageSquare size={12} className="inline mr-1" />
                      {conv.name}
                    </button>
                    <button
                      onClick={() => deleteChat(convIdx)}
                      className="p-1 rounded hover:bg-opacity-10 hover:bg-white opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={12} style={{ color: palette.error }} />
                    </button>
                  </div>
                  {searchQuery && (conv as any).matches.length > 0 && (
                    <div className="pl-4 text-xs" style={{ color: palette.subdued }}>
                      {(conv as any).matches.length} match{(conv as any).matches.length > 1 ? 'es' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}



        {/* User */}
        <div className="p-3 border-t space-y-2" style={{ borderColor: palette.border }}>
          {auth.isLoggedIn ? (
            <>
              <button
                className="w-full flex items-center gap-2 p-2 rounded text-xs"
                style={{ background: palette.secondary, color: palette.accent, cursor: 'default' }}
              >
                <CheckCircle size={14} style={{ color: palette.success }} />
                {!sidebarCollapsed && <span className="truncate text-xs">Logged in</span>}
              </button>
              
              <button
                onClick={() => {
                  setShowSettings(true)
                  setSettingsTab('account')
                }}
                className="w-full flex items-center gap-2 p-2 rounded text-xs transition-colors"
                style={{ color: palette.accent }}
              >
                <SettingsIcon size={14} />
                {!sidebarCollapsed && <span>Settings</span>}
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full flex items-center gap-2 p-2 rounded text-xs"
                style={{ background: palette.secondary, color: palette.accent, cursor: 'default' }}
              >

                {!sidebarCollapsed && <span className="truncate text-xs">Guest</span>}
              </button>
              
              <button
                onClick={() => {
                  setShowSettings(true)
                  setSettingsTab('account')
                }}
                className="w-full flex items-center gap-2 p-2 rounded text-xs transition-colors"
                style={{ color: palette.accent }}
              >
                <SettingsIcon size={14} />
                {!sidebarCollapsed && <span>Settings</span>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col">
        {/* Header - ChatGPT Style */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: palette.border, background: palette.panel }}>
          <div className="flex items-center gap-3 flex-1">
            <h1 className="text-sm font-semibold" style={{ color: palette.accent }}>{currentConvName}</h1>
            <div className="w-2 h-2 rounded-full" style={{ background: networkStatus === 'online' ? palette.success : palette.error }}></div>
            {loading && (
              <div className="flex items-center gap-1 text-xs" style={{ color: palette.subdued }}>
                <Loader size={12} className="animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {auth.isOwner && (
            <div className="flex items-center gap-4 text-xs" style={{ color: palette.subdued }}>
              <div className="flex items-center gap-1">
                <span title="Astra">⚡</span>
                <span>∞</span>
              </div>
              <div className="flex items-center gap-1">
                <span title="Vyra">✨</span>
                <span>∞</span>
              </div>
            </div>
          )}

          {!auth.isOwner && usageStats && (
            <div className="flex items-center gap-4 text-xs" style={{ color: palette.subdued }}>
              <div className="flex items-center gap-1">
                <span title="Astra">⚡</span>
                <span>{usageStats.astra.used}/{usageStats.astra.limit}</span>
              </div>
              <div className="flex items-center gap-1">
                <span title="Vyra">✨</span>
                <span>{usageStats.vyra.used}/{usageStats.vyra.limit}</span>
              </div>

            </div>
          )}
        </div>

        {/* Messages - ChatGPT/Grok/Gemini Style */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
          style={{
            background: palette.background
          }}
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-0">
                <div
                  className="rounded-2xl sm:rounded-3xl px-4 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-10 shadow-[0_18px_60px_rgba(0,0,0,0.7)] border space-y-6 sm:space-y-8"
                  style={{
                    background: `radial-gradient(circle at top, ${palette.panel} 0, ${palette.background} 55%)`,
                    borderColor: palette.border
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: palette.secondary }}
                      >
                        <Image
                          src="/zevy-logo.jpg"
                          alt="Zevy AI"
                          width={40}
                          height={40}
                          style={{ borderRadius: '12px', objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em]" style={{ color: palette.subdued }}>
                          Zevy AI
                        </p>
                        <p className="text-sm font-medium" style={{ color: palette.accent }}>
                          Astra • Vyra • Web search
                        </p>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs">
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full"
                        style={{ background: palette.secondary, color: palette.accent }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: palette.success }} />
                        Ready
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3 text-center sm:text-left">
                    <h2
                      className="text-xl sm:text-2xl lg:text-4xl font-semibold tracking-tight"
                      style={{ color: palette.accent }}
                    >
                      How can I help?
                    </h2>
                    <p
                      className="text-xs sm:text-sm lg:text-base max-w-xl mx-auto sm:mx-0"
                      style={{ color: palette.subdued }}
                    >
                      Ask anything, or start with a preset. Vyra gives deep debate-style reasoning,
                      Astra keeps things fast and focused.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] sm:text-xs">
                    {[
                      { label: '✨ Vyra Deep Reasoning', value: 'vyra' },
                      { label: '⚡ Astra Fast', value: 'astra' },
                      { label: '🌐 Vector Web Search', value: 'search' }
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={() => {
                          if (item.value === 'vyra' || item.value === 'astra') {
                            setMode(item.value as 'vyra' | 'astra')
                          }
                          if (item.value === 'search') {
                            setIsSearchMode(true)
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full button-hover"
                        style={{
                          background:
                            item.value === 'search' && isSearchMode ? '#22c55e' : palette.secondary,
                          color:
                            item.value === 'search' && isSearchMode ? '#ffffff' : palette.accent,
                          border:
                            item.value === 'search' && isSearchMode
                              ? '1px solid #16a34a'
                              : `1px solid ${palette.border}`
                        }}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 pt-1">
                    {[
                      { icon: '🔍', title: 'Research', desc: 'Find latest info' },
                      { icon: '💡', title: 'Brainstorm', desc: 'Generate ideas' },
                      { icon: '🧠', title: 'Explain', desc: 'Simplify topics' },
                      { icon: '📄', title: 'Scan Document', desc: 'Check document' }
                    ].map((item) => (
                      <button
                        key={item.title}
                        onClick={() => setInput(`${item.title}: `)}
                        className="p-3 sm:p-4 rounded-xl text-left transition-all button-hover border"
                        style={{
                          background: palette.panel,
                          borderColor: palette.border,
                          boxShadow: '0 14px 40px rgba(0,0,0,0.4)'
                        }}
                      >
                        <p className="text-2xl mb-2">{item.icon}</p>
                        <p className="text-sm font-semibold mb-0.5" style={{ color: palette.accent }}>
                          {item.title}
                        </p>
                        <p className="text-xs" style={{ color: palette.subdued }}>{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {displayedMessages.map((message, idx) => (
                <div key={message.id || idx} className={`fade-in ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
                  {message.role === 'assistant' && (
                    <div className="flex w-full group justify-start">
                      <div className="flex-1 max-w-2xl">
                        {message.error ? (
                          <div className="p-3 rounded-lg" style={{ background: palette.error, color: '#fff' }}>
                            <p className="text-sm">{message.content}</p>
                          </div>
                        ) : (
                          <>
                            {message.mode && (
                              <div className="text-xs mb-2 flex items-center gap-2" style={{ color: palette.subdued }}>
                                <span>
                                  {message.mode === 'astra' && '⚡ Fast'}
                                  {message.mode === 'vyra' && '✨ Deep'}
                                </span>
                                <span>•</span>
                                <span>{formatTimestamp(message.timestamp)}</span>
                              </div>
                            )}
                            <div 
                              className="p-3 rounded-lg prose prose-sm max-w-none markdown"
                              style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.accent }}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ node, href, ...props }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="chat-link"
                                      {...props}
                                    />
                                  ),
                                  sup: ({ node, ...props }) => (
                                    <sup style={{ fontSize: '0.8em', verticalAlign: 'super' }} {...props} />
                                  )
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          </>
                        )}

                        {/* Message Actions - ChatGPT Style */}
                        {!message.error && (
                          <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyMessage(message.content)}
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary }}
                              title="Copy"
                            >
                              <Copy size={14} style={{ color: palette.subdued }} />
                            </button>
                            <button
                              onClick={() => {}}
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary }}
                              title="Good response"
                            >
                              <ThumbsUp size={14} style={{ color: palette.subdued }} />
                            </button>
                            <button
                              onClick={() => {}}
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary }}
                              title="Bad response"
                            >
                              <ThumbsDown size={14} style={{ color: palette.subdued }} />
                            </button>
                            <button
                              onClick={handleRegenerateMessage}
                              disabled={loading}
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary, opacity: loading ? 0.5 : 1 }}
                              title="Regenerate"
                            >
                              <RotateCcw size={14} style={{ color: palette.subdued }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {message.role === 'user' && (
                    <div className="flex justify-end w-full gap-2 items-center">
                      <div className="max-w-2xl p-3 rounded-lg" style={{ background: palette.hover, color: '#fff' }}>
                        <p className="text-sm">{message.content}</p>
                      </div>
                      <button
                        onClick={() => startEditMessage(idx)}
                        className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                        style={{ background: palette.secondary }}
                        title="Edit and resend"
                      >
                        <Edit2 size={14} style={{ color: palette.subdued }} />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 p-4 rounded-lg" style={{ background: palette.panel, border: `1px solid ${palette.border}` }}>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: palette.hover, animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: palette.hover, animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: palette.hover, animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className="fixed bottom-32 right-6 p-2 rounded-full transition-all button-hover shadow-lg"
              style={{ background: palette.hover, color: '#fff' }}
            >
              <ArrowDown size={16} />
            </button>
          )}
        </div>

        <div className="p-3 sm:p-4" style={{ background: palette.background }}>
          <div className="max-w-4xl mx-auto">
            {attachedFiles.length > 0 && (
              <div className="mb-4 space-y-2">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg flex items-start gap-3"
                    style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}
                  >
                    <div
                      className="w-12 h-12 rounded flex items-center justify-center"
                      style={{ background: palette.panel }}
                    >
                      <FileText size={20} style={{ color: palette.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: palette.accent }}>
                        {file.name}
                      </p>
                    </div>
                    <button onClick={() => removeAttachedFile(idx)}>
                      <X size={16} style={{ color: palette.error }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {editingMessageIndex !== null && (
                <div className="p-3 rounded-lg flex items-center gap-2" style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}>
                  <input
                    value={editingMessageContent}
                    onChange={e => setEditingMessageContent(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        applyEditAndSend()
                      }
                    }}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: palette.accent }}
                    placeholder="Edit your message"
                  />
                  <button
                    onClick={applyEditAndSend}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold button-hover"
                    style={{ background: palette.accent, color: palette.background }}
                  >
                    Send
                  </button>
                  <button
                    onClick={() => {
                      setEditingMessageIndex(null)
                      setEditingMessageContent('')
                    }}
                    className="p-1.5 rounded-lg button-hover"
                    style={{ background: palette.secondary }}
                  >
                    <X size={14} style={{ color: palette.subdued }} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsSearchMode(!isSearchMode);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs button-hover"
                  style={{
                    background: isSearchMode ? '#22c55e' : palette.secondary,
                    color: isSearchMode ? '#ffffff' : palette.accent,
                    border: isSearchMode ? '1px solid #16a34a' : `1px solid ${palette.border}`
                  }}
                >
                  <Globe size={14} />
                  <span>{isSearchMode ? 'Vector Search On' : 'Vector'}</span>
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs button-hover"
                    style={{ background: palette.secondary, color: palette.accent, border: `1px solid ${palette.border}` }}
                  >
                    {mode === 'astra' ? <Zap size={12} /> : <Sparkles size={12} />}
                    <span>{mode === 'astra' ? 'Astra' : 'Vyra'}</span>
                    <ChevronDown size={14} />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute bottom-full mb-2 min-w-[160px] rounded-lg shadow-lg" style={{ background: palette.secondary, border: `1px solid ${palette.border}` }}>
                      <button
                        onClick={() => {
                          setMode('astra')
                          setShowModelDropdown(false)
                        }}
                        className="w-full flex items-center gap-2 p-2 text-xs"
                        style={{ color: palette.accent }}
                      >
                        <Zap size={12} />
                        <span>Astra</span>
                      </button>
                      <button
                        onClick={() => {
                          setMode('vyra')
                          setShowModelDropdown(false)
                        }}
                        className="w-full flex items-center gap-2 p-2 text-xs"
                        style={{ color: palette.accent }}
                      >
                        <Sparkles size={12} />
                        <span>Vyra</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="Message Zevy or attach documents for analysis..."
                  className="flex-1 p-3 rounded-xl resize-none focus:outline-none text-sm transition-all"
                  style={{
                    background: palette.panel,
                    border: `1px solid ${palette.border}`,
                    color: palette.accent,
                    minHeight: '60px',
                    boxShadow: `0 2px 4px ${palette.border}20`
                  }}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl transition-all button-hover"
                  style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}
                >
                  <Plus size={16} style={{ color: palette.accent }} />
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.docx,.pdf,.md,.csv,.rtf"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      processFiles(Array.from(e.target.files))
                    }
                  }}
                  className="hidden"
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl transition-all button-hover"
                  style={{ background: palette.hover, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 :  1 }}
                >
                  <Send size={16} color="#fff" />
                </button>
              </div>

              <p className="text-xs text-center" style={{ color: palette.subdued }}>
                Zevy may make mistakes. Check before going with it.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* In-App Notifications Container - Improved */}
      <div className="fixed top-4 right-4 z-[1000] space-y-3 max-w-sm pointer-events-none">
        {notifications.map((notif) => {
          const bgColor = notif.type === 'success' ? '#0ea5e9' : 
                         notif.type === 'error' ? '#ef4444' :
                         notif.type === 'warning' ? '#f59e0b' : '#3b82f6'
          
          return (
            <div
              key={notif.id}
              className="p-4 rounded-xl shadow-xl flex items-start gap-3 pointer-events-auto notification-enter backdrop-blur-sm"
              style={{
                background: bgColor,
                color: '#fff'
              }}
            >
              {notif.type === 'success' && <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />}
              {notif.type === 'error' && <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
              {notif.type === 'warning' && <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
              {notif.type === 'info' && <Bell size={18} className="flex-shrink-0 mt-0.5" />}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{notif.message}</p>
                {notif.action && (
                  <button
                    onClick={() => {
                      notif.action?.onClick()
                      setNotifications(prev => prev.filter(n => n.id !== notif.id))
                    }}
                    className="text-xs mt-1 underline hover:opacity-80 transition-opacity"
                  >
                    {notif.action.label}
                  </button>
                )}
              </div>
              
              <button
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                className="flex-shrink-0 ml-2 hover:opacity-70 transition-opacity mt-0.5"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Settings Modal - Better Colors & Hover */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl" style={{ background: palette.panel, border: `1px solid ${palette.border}` }}>
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b" style={{ background: palette.panel, borderColor: palette.border }}>
              <h2 className="text-2xl font-bold" style={{ color: palette.accent }}>Settings</h2>
              <button 
                onClick={() => setShowSettings(false)} 
                className="p-2 rounded-lg transition-all button-hover"
                style={{ background: palette.secondary }}
              >
                <X size={24} style={{ color: palette.accent }} />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 pb-1 border-b" style={{ borderColor: palette.border }}>
              <div
                className="inline-flex items-center justify-center gap-1 rounded-xl p-1"
                style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}
              >
                <button
                  onClick={() => setSettingsTab('account')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: settingsTab === 'account' ? palette.hover : 'transparent',
                    color: settingsTab === 'account' ? '#fff' : palette.subdued,
                    boxShadow: settingsTab === 'account' ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none'
                  }}
                >
                  Account
                </button>
                <button
                  onClick={() => setSettingsTab('appearance')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: settingsTab === 'appearance' ? palette.hover : 'transparent',
                    color: settingsTab === 'appearance' ? '#fff' : palette.subdued,
                    boxShadow: settingsTab === 'appearance' ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none'
                  }}
                >
                  Appearance
                </button>
                <button
                  onClick={() => setSettingsTab('about')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: settingsTab === 'about' ? palette.hover : 'transparent',
                    color: settingsTab === 'about' ? '#fff' : palette.subdued,
                    boxShadow: settingsTab === 'about' ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none'
                  }}
                >
                  About
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Account Tab */}
              {settingsTab === 'account' && (
                <div className="space-y-4">
                  {!auth.isLoggedIn ? (
                    <>
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={() => setAuthMode('login')}
                          className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all button-hover"
                          style={{
                            background: authMode === 'login' ? palette.hover : palette.sidebar,
                            color: authMode === 'login' ? '#fff' : palette.accent
                          }}
                        >
                          Login
                        </button>
                        <button
                          onClick={() => setAuthMode('signup')}
                          className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all button-hover"
                          style={{
                            background: authMode === 'signup' ? palette.hover : palette.sidebar,
                            color: authMode === 'signup' ? '#fff' : palette.accent
                          }}
                        >
                          Sign Up
                        </button>
                      </div>

                      {authError && (
                        <div className="p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: palette.error, color: '#fff' }}>
                          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                          <span>{authError}</span>
                        </div>
                      )}

                      <input
                        type="email"
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        placeholder="your@email.com"
                        className="w-full p-2.5 rounded-lg text-sm focus:outline-none transition-all button-hover"
                        style={{ background: palette.sidebar, border: `1px solid ${palette.border}`, color: palette.accent }}
                      />

                      <input
                        type={authForm.showPassword ? 'text' : 'password'}
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        placeholder="Password"
                        className="w-full p-2.5 rounded-lg text-sm focus:outline-none transition-all button-hover"
                        style={{ background: palette.sidebar, border: `1px solid ${palette.border}`, color: palette.accent }}
                      />

                      <button
                        onClick={handleLogin}
                        disabled={authLoading}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 button-hover"
                        style={{ background: palette.hover, color: '#fff', opacity: authLoading ? 0.6 : 1 }}
                      >
                        {authLoading && <Loader size={14} className="animate-spin" />}
                        {authMode === 'login' ? 'Sign In' : 'Create Account'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-lg text-center" style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}>
                        <p className="text-xs" style={{ color: palette.subdued }}>Signed in as</p>
                        <p className="text-lg font-semibold mt-1" style={{ color: palette.accent }}>{auth.email}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: palette.accent }}>✨ AI Personality</label>
                        <input
                          type="text"
                          value={trait}
                          onChange={e => setTrait(e.target.value)}
                          placeholder="e.g., Helpful, Witty, Technical"
                          className="w-full p-2.5 rounded-lg text-sm focus:outline-none transition-all"
                          style={{ background: palette.sidebar, border: `1px solid ${palette.border}`, color: palette.accent }}
                        />
                        <p className="text-xs mt-1" style={{ color: palette.subdued }}>Customize how Zevy responds to you</p>
                      </div>

                      <div className="p-4 rounded-lg" style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}>
                        <p className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: palette.accent }}>
                          <span>📊</span> Usage This Period
                        </p>
                        <div className="space-y-2.5">
                          {[

                            { name: 'Astra', icon: '⚡', stat: usageStats?.astra },
                            { name: 'Vyra', icon: '✨', stat: usageStats?.vyra },
                            
                          ].map(({ name, icon, stat }) => (
                            <div key={name} className="flex justify-between items-center text-sm" style={{ color: palette.accent }}>
                              <span>{icon} {name}</span>
                              <span style={{ color: palette.subdued }}>
                                {auth.isOwner ? '∞' : stat ? `${stat.used}/${stat.limit}` : '0/0'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={handleLogout}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all button-hover"
                        style={{ background: palette.error, color: '#fff' }}
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Appearance Tab */}
              {settingsTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: palette.accent }}>
                      🎨 Theme
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme('dark')}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all button-hover"
                        style={{
                          background: theme === 'dark' ? palette.hover : palette.sidebar,
                          color: theme === 'dark' ? '#fff' : palette.accent,
                          border: `1px solid ${palette.border}`
                        }}
                      >
                        🌙 Dark
                      </button>
                      <button
                        onClick={() => setTheme('light')}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all button-hover"
                        style={{
                          background: theme === 'light' ? palette.hover : palette.sidebar,
                          color: theme === 'light' ? '#fff' : palette.accent,
                          border: `1px solid ${palette.border}`
                        }}
                      >
                        ☀️ Light
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* About Tab */}
              {settingsTab === 'about' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: palette.accent }}>
                      <span>🚀</span> About Zevy AI
                    </h3>
                    <p className="text-sm" style={{ color: palette.subdued }}>
                      Zevy is an advanced AI assistant with dual-engine intelligence, real-time web access, image generation, and adaptive personality traits. Built for natural, human-like conversations.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: palette.accent }}>
                      <span>👨‍💻</span> Creator
                    </h3>
                    <p className="text-sm" style={{ color: palette.subdued }}>
                      Built by Adam Zein Ziqry, a 15-year-old self-taught developer and future founder of Zevy Technologies.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: palette.accent }}>
                      <span>⭐</span> Features
                    </h3>
                    <ul className="text-sm space-y-1.5" style={{ color: palette.subdued }}>
                      <li className="flex items-center gap-2">
                        <span style={{ color: palette.hover }}>✓</span> ⚡ Astra - Fast, intelligent responses
                      </li>
                      <li className="flex items-center gap-2">
                        <span style={{ color: palette.hover }}>✓</span> ✨ Vyra - Deep thinking & analysis
                      </li>
                      
                      <li className="flex items-center gap-2">
                        <span style={{ color: palette.hover }}>✓</span> 🌐 Real-time web search integration
                      </li>
                      <li className="flex items-center gap-2">
                        <span style={{ color: palette.hover }}>✓</span> 📱 Persistent conversation history
                     
                      </li>
                      <li className="flex items-center gap-2">
                        <span style={{ color: palette.hover }}>✓</span> 💬 Natural, human-like conversations
                      </li>
                    </ul>
                  </div>

                  <div className="border-t pt-6" style={{ borderColor: palette.border }}>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: palette.accent }}>
                      <span>🌐</span> Zevy Official
                    </h3>
                    <div className="space-y-2">
                      {SOCIAL_HANDLES.zevy.map((handle) => (
                        <a 
                          key={handle.name}
                          href={handle.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block p-3 rounded-lg text-sm transition-all button-hover"
                          style={{ 
                            background: palette.sidebar, 
                            color: palette.accent, 
                            border: `1px solid ${palette.border}`
                          }}
                        >
                          {handle.icon} {handle.name}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-6" style={{ borderColor: palette.border }}>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: palette.accent }}>
                      <span>👤</span> Adam&apos;s Links
                    </h3>
                    <div className="space-y-2">
                      {SOCIAL_HANDLES.adam.map((handle) => (
                        <a 
                          key={handle.name}
                          href={handle.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block p-3 rounded-lg text-sm transition-all button-hover"
                          style={{ 
                            background: palette.sidebar, 
                            color: palette.accent, 
                            border: `1px solid ${palette.border}`
                          }}
                        >
                          {handle.icon} {handle.name}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg" style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}>
      {searchResults.length > 0 && (
        <SearchResults results={searchResults} onClose={() => setSearchResults([])} />
      )}

                    <p className="text-xs" style={{ color: palette.subdued }}>v1.0.0 • Made with 💙 by Adam Zein Ziqry</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
