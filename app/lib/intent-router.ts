export type IntentConfidence = 'high' | 'medium' | 'low'

export interface DeterminedIntent {
  isConversational: boolean
  needsVector: boolean
  confidence: IntentConfidence
  reason: string
  searchQuery?: string
  customResponse?: string
}

export function determineIntent(message: string, chatHistory: any[] = []): DeterminedIntent {
  const normalizedMessage = message.toLowerCase().trim()

  const isFeatureRequest = ['feature', 'capability', 'what can you do', 'features'].some(keyword =>
    normalizedMessage.includes(keyword)
  )
  if (isFeatureRequest) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'high',
      reason: 'Feature request detected',
      customResponse:
        `I can do a few things! Here are some of my features:\n` +
        `- Search the web for real-time information when search is enabled\n` +
        `- Summarize articles when you provide a link (for example: "Summarize: [link]")\n` +
        `- Answer questions and explain concepts across many topics`,
    }
  }

  const imagePatterns = [
    /generate\s+(me\s+)?(an?\s+)?(image|picture|art|artwork)/i,
    /make\s+(me\s+)?(an?\s+)?(image|picture|art|artwork)/i,
    /create\s+(me\s+)?(an?\s+)?(image|picture|art|artwork)/i,
    /draw\s+(me\s+)?(an?\s+)?(image|picture|art|artwork)/i,
    /(image|picture|art|artwork)\s+generation/i,
  ]
  const isImageRequest = imagePatterns.some(pattern => pattern.test(normalizedMessage))
  if (isImageRequest) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'high',
      reason: 'Image generation request detected',
    }
  }

  const musicKeywords = [
    'album',
    'song',
    'track',
    'lyric',
    'discography',
    'single',
    'playlist',
    'artist',
    'band',
    'rapper',
    'singer',
  ]
  const isMusicRequest = musicKeywords.some(keyword => normalizedMessage.includes(keyword))
  if (isMusicRequest) {
    const wantsLatest =
      normalizedMessage.includes('latest') ||
      normalizedMessage.includes('new') ||
      normalizedMessage.includes('recent')

    return {
      isConversational: true,
      needsVector: wantsLatest,
      confidence: wantsLatest ? 'high' : 'medium',
      reason: wantsLatest ? 'Music query about latest releases' : 'General music-related query',
    }
  }

  const isFollowUp =
    chatHistory.length > 0 &&
    (normalizedMessage.includes('you') ||
      normalizedMessage.includes('what about') ||
      normalizedMessage.includes('how about'))

  const conversationPatterns = [
    /^(hi|hello|hey|greetings|sup|yo|what's good)\s*[!?]*$/i,
    /(how are you|how's life|how's your day|what's up|how's it going)\s*[?]*$/i,
    /(thank you|thanks|appreciate it|much obliged|cheers)\s*(very much|a lot|so much)*\s*[!]*$/i,
    /(good\s+(morning|afternoon|evening|night)|g'morning|gm|gn|goodnight)\s*[!]*$/i,
    /(that's cool|interesting|awesome|nice|great|wow|amazing)\s*[!]*$/i,
    /(what do you think|your opinion|your thoughts)\s*[?]*$/i,
    /(tell me more|go on|continue|elaborate)\s*[!?]*$/i,
    /(i (like|love|enjoy|hate|dislike) (it|that|this))\s*[!]*$/i,
    /(you're (awesome|great|amazing|the best|wonderful))\s*[!]*$/i,
    /(catch you later|see you|talk later|bye|goodbye)\s*[!]*$/i,
  ]

  const isConversational =
    conversationPatterns.some(pattern => pattern.test(normalizedMessage)) || isFollowUp

  if (isConversational) {
    return {
      isConversational: true,
      needsVector: false,
      confidence: 'high',
      reason: 'Conversational pattern detected',
    }
  }

  const liveFactKeywords = [
    'today',
    'right now',
    'currently',
    'current',
    'latest',
    'recent',
    'breaking',
    'this week',
    'this month',
    'this year',
    'tonight',
    'live score',
    'score today',
    'weather',
    'forecast',
    'temperature',
    'humidity',
    'rain',
    'stock price',
    'share price',
    'price of',
    'exchange rate',
    'convert',
    'conversion rate',
    'market cap',
    'ranking',
    'standings',
    'table',
    'upcoming match',
    'schedule',
    'fixture',
    'flight status',
    'delay',
    'traffic',
    'trending',
    'up to date',
    'as of today',
    'news about',
    'h100 price',
  ]

  const liveFactPatterns = [
    /\b(news|headlines|breaking|article|report)\b/i,
    /\b(stock|price|quote|market|ticker|nasdaq|nyse)\b/i,
    /\b(score|result|stats|statistics|standings|league|tournament)\b/i,
    /\b(weather|forecast|temperature|humidity|precipitation)\b/i,
    /\b(exchange rate|fx rate|currency rate)\b/i,
    /\b(release date|launch date)\b/i,
    /\b(covid|inflation rate|interest rate)\b/i,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i,
    /\b(202[0-9]|20[3-9][0-9])\b/i,
  ]

  const reasoningKeywords = [
    'riddle',
    'puzzle',
    'paradox',
    'brain teaser',
    'brain-teaser',
    'brainteaser',
    'logic puzzle',
    'proof',
    'show that',
    'prove that',
    'counterexample',
    'walk me through',
    'step by step',
    'step-by-step',
    'reason about',
    'reasoning',
    'thought experiment',
    'intuition',
    'intuitively',
    'analogy',
    'metaphor',
    'explain like i am',
    'explain like im',
    'eli5',
    'conceptually',
    'architecture',
    'design',
    'trade off',
    'trade-off',
    'tradeoff',
    'failure mode',
    'edge case',
    'bias',
    'cause misinformation',
    'misinformation',
  ]

  const hasLiveKeyword = liveFactKeywords.some(keyword => normalizedMessage.includes(keyword))
  const hasLivePattern = liveFactPatterns.some(pattern => pattern.test(normalizedMessage))
  const hasReasoningKeyword = reasoningKeywords.some(keyword => normalizedMessage.includes(keyword))

  const isLogicPuzzle = /\b(riddle|puzzle|paradox|brain teaser|brain-teaser|brainteaser|logic puzzle)\b/i.test(
    normalizedMessage
  )

  const mentionsZevyArchitecture =
    /\bzevy\b/i.test(normalizedMessage) &&
    (normalizedMessage.includes('architecture') ||
      normalizedMessage.includes('design') ||
      normalizedMessage.includes('misinformation') ||
      normalizedMessage.includes('failure') ||
      normalizedMessage.includes('risk'))

  const hasQuestionMark = normalizedMessage.includes('?')
  const isLongMessage = normalizedMessage.length > 80

  if (hasLiveKeyword || hasLivePattern) {
    return {
      isConversational: false,
      needsVector: true,
      confidence: 'high',
      reason: 'Live fact or time-sensitive information requested',
    }
  }

  if (isLogicPuzzle || hasReasoningKeyword || mentionsZevyArchitecture) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'high',
      reason: 'Reasoning or conceptual question that does not require live data',
    }
  }

  if (hasQuestionMark && isLongMessage) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'medium',
      reason: 'Complex question better handled with offline reasoning',
    }
  }

  if (hasQuestionMark) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'medium',
      reason: 'General knowledge question without clear need for live data',
    }
  }

  if (normalizedMessage.length < 15) {
    return {
      isConversational: true,
      needsVector: false,
      confidence: 'medium',
      reason: 'Short message without clear information intent',
      customResponse: isFollowUp ? `Continuing our conversation: ${normalizedMessage}` : undefined,
    }
  }

  return {
    isConversational: false,
    needsVector: false,
    confidence: 'low',
    reason: 'Defaulting to offline reasoning; no clear need for live data',
  }
}
