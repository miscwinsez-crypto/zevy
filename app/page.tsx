'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Zap,
  Sparkles,
  Menu,
  X,
  Plus,
  User,
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
  Image as ImageIcon
} from 'lucide-react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
  mode?: string
  timestamp?: string
  reasoning?: string
  error?: boolean
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
  nova: { used: number; limit: number; resetTime: string }
}

interface AuthState {
  isLoggedIn: boolean
  userId: string
  email: string
  token: string | null
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
  type: 'image' | 'pdf'
  data: string
  name: string
  preview?: string
}

const darkPalette = {
  background: '#0f0f0f', // Darker background for better contrast
  sidebar: '#0a0a0a', // Very dark sidebar
  panel: '#1e1e1e', // Slightly lighter panel
  border: '#2d2d2d', // More visible border
  accent: '#3a82f5', // Blue accent for better visibility
  subdued: '#a0a0a0', // Lighter text for readability
  secondary: '#444444', // More distinct secondary color
  success: '#10a37f', // Success green
  error: '#ff4d4d', // Error red
  hover: '#2a2a2a', // More visible hover state
  warning: '#ffcc00' // Warning yellow
};

const lightPalette = {
  background: '#ffffff',
  sidebar: '#f8f8f8',
  panel: '#ffffff',
  border: '#d0d0d0',
  accent: '#3a82f5', // Matching blue accent
  subdued: '#707070', // Darker text for better contrast
  secondary: '#e0e0e0',
  success: '#10a37f',
  error: '#ff4d4d',
  hover: '#e8e8e8', // Slightly darker hover
  warning: '#ffcc00'
}

const BLOCKED_KEYWORDS = [ 
  'suicide', 'self harm', 'kill myself', 'how to die', 'end my life', 'hurt myself', 'cut myself', 'overdose', 
  'kill', 'murder', 'assault', 'abuse', 'rape', 'molest', 'torture', 'beat', 'stab', 'shoot', 'hang', 'lynch', 'strangle', 'choke', 'drown', 'burn', 'bomb', 'explode', 'terrorist', 'terrorism', 'massacre', 'genocide', 
  'make explosives', 'build bomb', 'how to hack', 'create malware', 'phishing', 'steal', 'rob', 'shoplift', 'fraud', 'scam', 'counterfeit', 'piracy', 'sell drugs', 'buy drugs', 'illegal drugs', 'smuggle', 'trafficking', 'money laundering', 'blackmail', 'extort', 'bribe', 'corruption', 
  'racist', 'sexist', 'homophobic', 'transphobic', 'hate speech', 'slur', 'bigot', 'nazi', 'white power', 'heil hitler', 'kkk', 'antisemitic', 'islamophobic', 'ableist', 'misogynist', 'misandrist', 
  'porn', 'sex', 'sexual', 'nude', 'nudes', 'erotic', 'masturbate', 'orgasm', 'cum', 'ejaculate', 'penetrate', 'anal', 'oral', 'blowjob', 'handjob', 'incest', 'bestiality', 'pedophile', 'child porn', 'loli', 'shota', 'grooming', 'rape fantasy', 'roleplay rape', 'roleplay abuse', 
  'how to make poison', 'how to make drugs', 'how to commit crime', 'how to get away with murder', 'how to cheat', 'how to lie', 'how to cover up', 'how to stalk', 'how to harass', 'how to bully', 'how to threaten', 'how to intimidate', 'how to manipulate', 'how to gaslight', 'how to dox', 'how to swat', 'how to scam', 'how to steal', 'how to rob', 'how to shoplift', 'how to commit fraud', 'how to counterfeit', 'how to pirate', 'how to smuggle', 'how to traffic', 'how to launder money', 'how to blackmail', 'how to extort', 'how to bribe', 'how to corrupt', 
  'unalive', 'kms', 'kys', 'end it all', 'rope', 'jump off', 'take pills', 'slice', 'hurt', 'pain', 'suffer', 'no reason to live', 'worthless', 'hopeless', 'give up', 'can i die', 'should i die', 'want to die', 'wish i was dead', 'wish i could disappear', 'erase myself', 'erase my existence', 
] 


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

const SYSTEM_PROMPT = `You are Zevy AI, an advanced AI assistant created by Adam Zein Ziqry.

Your strengths:
- Real-time web search & current information
- Deep analysis & critical thinking
- Creative problem-solving
- Clear, conversational explanations
- Honest about limitations

Keep responses concise, friendly, and practical.
Use examples when helpful.
Be transparent about uncertainty.`

export default function ZevyAI() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const palette = theme === 'dark' ? darkPalette : lightPalette
  
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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [trait, setTrait] = useState('Straightforward')
  const [mode, setMode] = useState<'auto' | 'astra' | 'vyra' | 'nova'>('auto')
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'account' | 'appearance' | 'about'>('account')
  const [customColors, setCustomColors] = useState(palette)
  const [pendingColors, setPendingColors] = useState(palette)

  // FIX: Add missing per-conversation error handling
  const [conversationErrors, setConversationErrors] = useState<{ [key: string]: string | null }>({})
  const [retryingConv, setRetryingConv] = useState<string | null>(null)

  // Auth & Status state
  const [auth, setAuth] = useState<AuthState>({
    isLoggedIn: false,
    userId: 'guest',
    email: 'guest',
    token: null
  })
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [authForm, setAuthForm] = useState({ email: '', password: '', showPassword: false })
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline' | 'checking'>('online')
  const [apiError, setApiError] = useState<string | null>(null)
  const [blockedContentWarning, setBlockedContentWarning] = useState<{show: boolean, number: string}>({show: false, number: 'default'})
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef<HTMLDivElement>(null)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://zevy-ten.vercel.app/api'

  const messages = allConversations[currentConvIdx]?.messages || []
  const currentConvName = allConversations[currentConvIdx]?.name || 'New Chat'
  const currentConvId = allConversations[currentConvIdx]?.id
  const currentConvError = conversationErrors[currentConvId || ''] || null

  // Request notification permission
  const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
      console.log('Browser does not support notifications')
      return 'denied'
    }

    if (Notification.permission === 'granted') {
      setNotificationPermission('granted')
      return 'granted'
    }

    if (Notification.permission !== 'denied') {
      try {
        const permission = await Notification.requestPermission()
        setNotificationPermission(permission)
        return permission
      } catch (e) {
        console.error('Error requesting notification permission:', e)
        return 'denied'
      }
    }

    return Notification.permission
  }

  // Initialize notifications and tab focus tracking
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }

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

  // Play notification sound
  const playNotificationSound = (type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    try {
      if (!audioContextRef.current) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = audioContext
      }

      const audioContext = audioContextRef.current
      
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      const now = audioContext.currentTime
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      const frequencies: { [key: string]: number } = {
        success: 800,
        error: 400,
        info: 600,
        warning: 700
      }

      oscillator.frequency.value = frequencies[type] || 600
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, now)
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3)

      oscillator.start(now)
      oscillator.stop(now + 0.3)
    } catch (e) {
      console.log('Could not play notification sound:', e)
    }
  }

  // Send browser notification
  const sendBrowserNotification = (title: string, options: NotificationOptions = {}) => {
    if (!('Notification' in window)) return

    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          icon: '/zevy-logo.jpg',
          badge: '/zevy-logo.jpg',
          ...options
        })

        setTimeout(() => notification.close(), 5000)

        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      } catch (e) {
        console.error('Error sending browser notification:', e)
      }
    }
  }

  // Add notification
  const addNotification = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    action?: { label: string; onClick: () => void }
  ) => {
    const id = Math.random().toString(36)
    const notification: Notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      action
    }

    setNotifications(prev => [...prev, notification])

    if (!isTabFocused) {
      playNotificationSound(type)

      if (notificationPermission === 'granted') {
        sendBrowserNotification('Zevy AI', {
          body: message,
          tag: type,
          requireInteraction: type === 'error'
        })
      }
    } else {
      playNotificationSound(type)
    }

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4000)
  }

  const requestFilePermission = async (): Promise<boolean> => {
    if (notificationPermission === 'granted') {
      return true
    }

    if (notificationPermission === 'default') {
      const permission = await requestNotificationPermission()
      return permission === 'granted'
    }

    return false
  }

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('zevy_theme') as 'dark' | 'light' | null
    if (savedTheme) setTheme(savedTheme)
  }, [])

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('zevy_theme', theme)
  }, [theme])

  // Setup axios with better error handling
  useEffect(() => {
    const axiosInstance = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.GROQ_API_KEY_1 || process.env.GEMINI_API_KEY_1 || ''
      }
    })

    axiosInstance.interceptors.response.use(
      response => response,
      error => {
        if (!error.response) {
          setNetworkStatus('offline')
          setApiError('Network error - check your connection')
        }
        return Promise.reject(error)
      }
    )

    // Initialize axios instance without window assignment
  }, [])

  // Effects - All at top level
  useEffect(() => {
    scrollToBottom()
  }, [messages])

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

  // Generate unique conversation ID
  const generateConvId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // useEffect - Initialize conversations with auth
  useEffect(() => {
    if (!auth.isLoggedIn) {
      const newId = generateConvId()
      setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
      return
    }

    const savedConversations = localStorage.getItem(`zevy_conversations_${auth.email}`)
    const savedTrait = localStorage.getItem('zevy_trait')
    const savedMode = localStorage.getItem('zevy_mode')
    
    if (savedConversations) {
      try {
        setAllConversations(JSON.parse(savedConversations))
      } catch (e) {
        const newId = generateConvId()
        setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
      }
    } else {
      const newId = generateConvId()
      setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
    }
    
    if (savedTrait) setTrait(savedTrait)
    if (savedMode) setMode(savedMode as 'auto' | 'astra' | 'vyra' | 'nova')
    
    initializeUsageStats()
  }, [auth.isLoggedIn, auth.email])

  useEffect(() => {
    if (auth.isLoggedIn && allConversations.length > 0) {
      localStorage.setItem(`zevy_conversations_${auth.email}`, JSON.stringify(allConversations))
    }
  }, [allConversations, auth.isLoggedIn, auth.email])

  useEffect(() => {
    localStorage.setItem('zevy_trait', trait)
  }, [trait])

  useEffect(() => {
    localStorage.setItem('zevy_mode', mode)
  }, [mode])

  useEffect(() => {
    const savedColors = localStorage.getItem('zevy_custom_colors')
    if (savedColors) {
      try {
        setCustomColors(JSON.parse(savedColors))
      } catch (e) {
        setCustomColors(palette)
      }
    }
  }, [theme])



  // Initialize or check usage stats
  const initializeUsageStats = () => {
    const now = new Date()
    const statsKey = `zevy_usage_${auth.email}`
    const savedStats = localStorage.getItem(statsKey)
    
    if (savedStats) {
      try {
        const stats = JSON.parse(savedStats)
        const savedDate = new Date(stats.lastReset)
        
        // Reset if 24 hours have passed
        if (now.getTime() - savedDate.getTime() >= 86400000) {
          resetUsageStats()
        } else {
          setUsageStats(stats)
        }
      } catch (e) {
        resetUsageStats()
      }
    } else {
      resetUsageStats()
    }
  }

  const resetUsageStats = () => {
    const newStats: UsageStats = {
      astra: { used: 0, limit: 20, resetTime: new Date(Date.now() + 86400000).toLocaleTimeString() },
      vyra: { used: 0, limit: 10, resetTime: new Date(Date.now() + 86400000).toLocaleTimeString() },
      nova: { used: 0, limit: 5, resetTime: new Date(Date.now() + 86400000).toLocaleTimeString() }
    }
    setUsageStats(newStats)
    localStorage.setItem(`zevy_usage_${auth.email}`, JSON.stringify({ ...newStats, lastReset: new Date() }))
  }

  const updateUsageStats = (engine: 'astra' | 'vyra' | 'nova') => {
    if (!usageStats) return
    
    const updated = { ...usageStats }
    if (engine in updated) {
      updated[engine as keyof UsageStats].used += 1
    }
    setUsageStats(updated)
    localStorage.setItem(`zevy_usage_${auth.email}`, JSON.stringify({ ...updated, lastReset: new Date() }))
  }

  // FIX: Check blocked content - handle undefined BLOCKED_KEYWORDS
  const checkBlockedContent = (text: string): boolean => {
    const BLOCKED_KEYWORDS = [
      'suicide', 'self harm', 'kill myself', 'harm myself',
      'how to die', 'end my life'
    ]
    const lowerText = text.toLowerCase()
    return BLOCKED_KEYWORDS.some(keyword => lowerText.includes(keyword))
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const updateMessages = (newMessages: Message[]) => {
    setAllConversations(prev => {
      const updated = [...prev]
      updated[currentConvIdx] = { 
        ...updated[currentConvIdx], 
        messages: newMessages,
        lastUpdated: new Date().toISOString()
      }
      return updated
    })
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

  const sendMessage = async (messageContent?: string, isRetry = false) => {
    const textToSend = messageContent || input
    
    if (!textToSend.trim() || loading) return

    // Check for blocked content
    if (checkBlockedContent(textToSend)) {
      const country = navigator.language.split('-')[1] || 'default'
      const supportNumber = SUPPORT_NUMBERS[country] || SUPPORT_NUMBERS['default']
      setBlockedContentWarning({ show: true, number: supportNumber })
      addNotification('warning', 'If you\'re struggling, we care. Please reach out.')
      return
    }

    clearCurrentError()
    setNetworkStatus('checking')

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    }

    // Only update input if not retrying
    if (!isRetry) {
      updateMessages([...messages, userMessage])
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

    setLoading(true)

    const isImageGen = ['generate', 'make', 'create', 'draw', 'image', 'picture', 'photo'].some(
      word => textToSend.toLowerCase().includes(word)
    )

    const isWebSearch = ['search', 'find', 'current', 'latest', 'news', 'today', 'reddit', 'twitter', 'trending'].some(
      word => textToSend.toLowerCase().includes(word)
    )

    try {
      const healthCheck = await axios.get(`${API_URL}/api/health`, { timeout: 5000 })

      if (!healthCheck.data.status || healthCheck.data.status !== 'ok') {
        throw new Error('API service temporarily unavailable')
      }

      setNetworkStatus('online')

      const actualMode = isImageGen ? 'nova' : mode
      updateUsageStats(actualMode as 'astra' | 'vyra' | 'nova')

      const response = await axios.post(
        `${API_URL}/api/chat`,
        {
          message: textToSend,
          trait: trait,
          mode: actualMode,
          systemPrompt: SYSTEM_PROMPT,
          webSearch: isWebSearch,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          user_id: auth.userId,
          email: auth.email
        },
        { timeout: 60000 }
      )

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.response || 'I encountered an issue generating a response. Please try again.',
        mode: response.data.mode_used || actualMode,
        timestamp: new Date().toISOString(),
        reasoning: response.data.reasoning
      }

      updateMessages([...messages, userMessage, assistantMessage])
    } catch (error: any) {
      // Only log error details if not a redirect loop
if (!error.message?.includes('ERR_TOO_MANY_REDIRECTS')) {
  console.error('Chat error details:', {
    message: error.message,
    code: error.code,
    response: error.response?.data,
    config: {
      url: error.config?.url,
      method: error.config?.method
    }
  })
  
  // Handle chat-specific errors
  if (error.message && error.message.includes('Chat error details')) {
    try {
      const errorDetails = JSON.parse(error.message.replace('Chat error details: ', ''))
      errorContent = `Chat error: ${errorDetails.message || 'Please try again'}`
    } catch (e) {
      errorContent = 'Chat processing error - please try again'
    }
  }
}

      let errorContent = ''

      // Handle specific 'Chat error: Q' case
      if (error.message?.includes('Chat error: Q')) {
        errorContent = '🔌 Connection issue. Please check your API URL and try again.'
        setNetworkStatus('offline')
      } else if (error.code === 'ECONNABORTED') {
        errorContent = '⏱️ Request timeout. Try a shorter question or check your connection.'
      } else if (error.message?.includes('ERR_TOO_MANY_REDIRECTS')) {
        errorContent = '🔄 Redirect loop detected. Please clear browser cache and try again.'
        setNetworkStatus('offline')
      } else if (!error.response) {
        errorContent = '🔌 Can\'t reach Zevy. Check your internet and try again.'
        setNetworkStatus('offline')
      } else if (error.response?.status === 401) {
        errorContent = '🔑 Authentication error. Please check your API keys.'
      } else if (error.response?.status === 429) {
        errorContent = '⚠️ Rate limited. Wait a moment and try again.'
      } else if (error.response?.status === 500) {
        errorContent = '🤖 Server error. Our team is notified. Please try again.'
      } else {
        errorContent = error.response?.data?.detail || 
          `Error: ${error.message || 'Something went wrong. Please try again.'}`
      }

      // FIX: Store error per conversation, not globally
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
    } finally {
      setLoading(false)
      setRetryingConv(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    if (!authForm.email || !authForm.password) {
      setAuthError('Please enter your email and password')
      return
    }
    
    setAuthLoading(true)
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email: authForm.email,
        password: authForm.password
      }, { timeout: 10000 })
      
      setAuth({
        isLoggedIn: true,
        userId: response.data.user_id,
        email: response.data.email,
        token: response.data.token
      })
      
      localStorage.setItem('zevy_token', response.data.token)
      localStorage.setItem('zevy_user_id', response.data.user_id)
      localStorage.setItem('zevy_email', response.data.email)
      
      setAuthForm({ email: '', password: '', showPassword: false })
      setShowSettings(false)
      addNotification('success', `Welcome back! 👋`)
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed. Check your credentials and try again.'
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
      token: null
    })
    
    localStorage.removeItem('zevy_token')
    localStorage.removeItem('zevy_user_id')
    localStorage.removeItem('zevy_email')
    setShowSettings(false)
    const newId = generateConvId()
    setAllConversations([{ id: newId, name: 'Chat 1', messages: [] }])
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

  const extractPdfText = async (file: File): Promise<string> => {
    try {
      const text = await file.text()
      return text.substring(0, 500)
    } catch (e) {
      return 'PDF preview not available'
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
      if (file.type.startsWith('image/')) {
        validFiles.push(file)
      } else if (file.type === 'application/pdf') {
        validFiles.push(file)
      } else {
        addNotification('warning', `${file.name} not supported. Use images or PDFs.`)
      }
    }

    if (validFiles.length === 0) return

    for (const file of validFiles) {
      const fileId = Math.random().toString(36)
      
      try {
        const reader = new FileReader()

        reader.onload = async (ev: any) => {
          const data = ev.target.result
          let preview: string | undefined

          if (file.type === 'application/pdf') {
            preview = await extractPdfText(file)
          }

          setAttachedFiles(prev => [...prev, {
            type: file.type.startsWith('image/') ? 'image' : 'pdf',
            data,
            name: file.name,
            preview
          }])

          setUploadProgress(prev => {
            const updated = { ...prev }
            delete updated[fileId]
            return updated
          })

          addNotification('success', `${file.name} ready to send`)
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
    setAllConversations(prev => [...prev, { id: newId, name: `Chat ${prev.length + 1}`, messages: [] }])
    setCurrentConvIdx(allConversations.length)
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
    addNotification('info', 'Chat deleted')
  }

  const searchResults = allConversations
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

  // Add error banner for per-conversation errors
  return (
    <div 
      className="flex h-screen"
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

      {/* Notification Permission Banner - Improved */}
      {notificationPermission === 'default' && (
        <div
          className="fixed bottom-4 left-4 p-4 rounded-xl shadow-xl flex items-center gap-4 max-w-sm z-50 animate-slideInUp button-hover backdrop-blur-sm"
          style={{ 
            background: palette.panel,
            border: `1px solid ${palette.border}`
          }}
        >
          <div className="flex-shrink-0 p-2 rounded-lg animate-pulseBlue" style={{ background: palette.hover }}>
            <Bell size={20} color="#fff" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: palette.accent }}>Allow notifications</p>
            <p className="text-xs" style={{ color: palette.subdued }}>Get updates when Zevy responds</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setNotificationPermission('denied')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all button-hover"
              style={{ background: palette.secondary, color: palette.accent }}
            >
              Not now
            </button>
            <button
              onClick={requestNotificationPermission}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all button-hover"
              style={{ background: palette.hover, color: '#fff' }}
            >
              Allow
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
              We noticed you might need support. If you're struggling, please reach out:
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
              I'm OK
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
          width: sidebarCollapsed ? '70px' : '260px',
          background: palette.sidebar,
          borderColor: palette.border
        }}
      >
        {/* Logo & Toggle */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: palette.border }}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: palette.panel }}>
                <img
                  src="/zevy-logo.jpg"
                  alt="Zevy Logo"
                  style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }}
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

        {/* Mode & Theme */}
        <div className="p-3 border-t space-y-2" style={{ borderColor: palette.border }}>
          {!sidebarCollapsed && (
            <button
              onClick={() => setMode(mode === 'astra' ? 'vyra' : 'astra')}
              className="w-full flex items-center justify-between p-2 rounded text-xs"
              style={{ background: palette.secondary, color: palette.accent }}
            >
              <div className="flex items-center gap-2">
                {mode === 'astra' ? <Zap size={12} /> : <Sparkles size={12} />}
                <span>{mode === 'astra' ? 'Astra' : 'Vyra'}</span>
              </div>
            </button>
          )}
        </div>

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
                <User size={14} />
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

          {usageStats && (
            <div className="flex items-center gap-4 text-xs" style={{ color: palette.subdued }}>
              <div className="flex items-center gap-1">
                <span title="Astra">⚡</span>
                <span>{usageStats.astra.used}/{usageStats.astra.limit}</span>
              </div>
              <div className="flex items-center gap-1">
                <span title="Vyra">✨</span>
                <span>{usageStats.vyra.used}/{usageStats.vyra.limit}</span>
              </div>
              <div className="flex items-center gap-1">
                <span title="Nova">🎨</span>
                <span>{usageStats.nova.used}/{usageStats.nova.limit}</span>
              </div>
            </div>
          )}
        </div>

        {/* Messages - ChatGPT/Grok Style */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6" style={{ background: palette.background }}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-2xl">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center animate-slideInUp" style={{ background: palette.secondary }}>
                  <img
                    src="/zevy-logo.jpg"
                    alt="Zevy AI"
                    style={{ width: '80px', height: '80px', borderRadius: '16px', objectFit: 'cover' }}
                  />
                </div>
                <h2 className="text-3xl font-bold mb-3" style={{ color: palette.accent }}>How can I help?</h2>
                <p className="text-sm mb-8" style={{ color: palette.subdued }}>
                  Ask me anything or explore features below
                </p>

                {/* Quick Start Grid - Copilot Style */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: '🔍', title: 'Research', desc: 'Find latest info' },
                    { icon: '💡', title: 'Brainstorm', desc: 'Generate ideas' },
                    { icon: '🧠', title: 'Explain', desc: 'Simplify topics' },
                    { icon: '🎨', title: 'Create', desc: 'Generate images' }
                  ].map((item) => (
                    <button
                      key={item.title}
                      onClick={() => sendMessage(`${item.title}: ${item.desc}`)}
                      className="p-4 rounded-lg text-left transition-all button-hover"
                      style={{ background: palette.secondary, border: `1px solid ${palette.border}` }}
                    >
                      <p className="text-2xl mb-1">{item.icon}</p>
                      <p className="text-xs font-semibold" style={{ color: palette.accent }}>{item.title}</p>
                      <p className="text-xs" style={{ color: palette.subdued }}>{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((message, idx) => (
                <div key={idx} className={`fade-in ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
                  {/* Assistant Message */}
                  {message.role === 'assistant' && (
                    <div className="flex gap-3 w-full group">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: palette.secondary }}>
                        <img 
                          src="/zevy-logo.jpg" 
                          alt="Zevy AI"
                          className="w-full h-full rounded-full object-cover"
                        />
                      </div>
                      <div className="flex-1 max-w-lg">
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
                                  {message.mode === 'nova' && '🎨 Image'}
                                </span>
                                <span>•</span>
                                <span>{formatTimestamp(message.timestamp)}</span>
                              </div>
                            )}
                            <div 
                              className="p-3 rounded-lg prose prose-sm max-w-none"
                              style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.accent }}
                            >
                              <ReactMarkdown>{message.content}</ReactMarkdown>
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
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary }}
                              title="Good response"
                            >
                              <ThumbsUp size={14} style={{ color: palette.subdued }} />
                            </button>
                            <button
                              className="p-1.5 rounded hover:bg-opacity-10 transition-all"
                              style={{ background: palette.secondary }}
                              title="Bad response"
                            >
                              <ThumbsDown size={14} style={{ color: palette.subdued }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* User Message */}
                  {message.role === 'user' && (
                    <div className="flex justify-end w-full gap-3">
                      <div className="max-w-lg p-3 rounded-lg" style={{ background: palette.hover, color: '#fff' }}>
                        <p className="text-sm">{message.content}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: palette.secondary }}>
                        <User size={20} style={{ color: palette.accent }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs" style={{ background: palette.secondary }}>
                    🤖
                  </div>
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

        {/* Input Section - ChatGPT Style */}
        <div className="p-4 border-t" style={{ borderColor: palette.border, background: palette.panel }}>
          <div className="max-w-2xl mx-auto">
            {attachedFiles.length > 0 && (
              <div className="mb-4 space-y-2">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg flex items-start gap-3"
                    style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}
                  >
                    {file.type === 'image' ? (
                      <img src={file.data} alt={file.name} className="w-12 h-12 rounded object-cover" />
                    ) : (
                      <div
                        className="w-12 h-12 rounded flex items-center justify-center"
                        style={{ background: palette.panel }}
                      >
                        <FileText size={20} style={{ color: palette.accent }} />
                      </div>
                    )}
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

            <div className="relative flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  if (inputRef.current) {
                    inputRef.current.style.height = '44px'
                    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
                  }
                }}
                onKeyPress={handleKeyPress}
                placeholder="Message Zevy..."
                className="flex-1 p-3 rounded-lg resize-none focus:outline-none text-sm transition-all"
                style={{
                  background: palette.panel,
                  border: `1px solid ${palette.border}`,
                  color: palette.accent,
                  minHeight: '44px',
                  boxShadow: `0 2px 4px ${palette.border}20`
                }}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl transition-all button-hover"
                style={{ background: palette.sidebar, border: `1px solid ${palette.border}` }}
              >
                <ImageIcon size={16} style={{ color: palette.accent }} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
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
                disabled={loading || !input.trim()}
                className="p-3 rounded-xl transition-all button-hover"
                style={{ background: palette.hover, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
              >
                <Send size={16} color="#fff" />
              </button>
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
            <div className="flex gap-0 border-b" style={{ borderColor: palette.border }}>
              <button
                onClick={() => setSettingsTab('account')}
                className="flex-1 px-4 py-3 border-b-2 transition-all text-sm font-semibold"
                style={{
                  borderColor: settingsTab === 'account' ? palette.hover : 'transparent',
                  color: settingsTab === 'account' ? palette.hover : palette.subdued,
                  background: settingsTab === 'account' ? palette.secondary : 'transparent'
                }}
              >
                Account
              </button>
              <button
                onClick={() => setSettingsTab('appearance')}
                className="flex-1 px-4 py-3 border-b-2 transition-all text-sm font-semibold"
                style={{
                  borderColor: settingsTab === 'appearance' ? palette.hover : 'transparent',
                  color: settingsTab === 'appearance' ? palette.hover : palette.subdued,
                  background: settingsTab === 'appearance' ? palette.secondary : 'transparent'
                }}
              >
                Appearance
              </button>
              <button
                onClick={() => setSettingsTab('about')}
                className="flex-1 px-4 py-3 border-b-2 transition-all text-sm font-semibold"
                style={{
                  borderColor: settingsTab === 'about' ? palette.hover : 'transparent',
                  color: settingsTab === 'about' ? palette.hover : palette.subdued,
                  background: settingsTab === 'about' ? palette.secondary : 'transparent'
                }}
              >
                About
              </button>
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
                            { name: 'Nova', icon: '🎨', stat: usageStats?.nova }
                          ].map(({ name, icon, stat }) => (
                            <div key={name} className="flex justify-between items-center text-sm" style={{ color: palette.accent }}>
                              <span>{icon} {name}</span>
                              <span style={{ color: palette.subdued }}>{stat?.used}/{stat?.limit}</span>
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
                        <span style={{ color: palette.hover }}>✓</span> 🎨 Nova - High-quality image generation
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
                      <span>👤</span> Adam's Links
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