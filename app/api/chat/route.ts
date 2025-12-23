import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/database.types'
import axios from 'axios'
import Groq from 'groq-sdk'
import { cookies } from 'next/headers'
import Parser from 'rss-parser'
import {
  requireVercelEnv,
  getVercelEnv,
  validateVercelEnv,
  assertVercelOnly,
  getVercelInfo
} from '@/lib/env'
import { createSupabaseClient } from '@/app/lib/supabase'
import * as cache from '@/app/lib/cache'
import {
  getCurrentGroqKeyIndex,
  getGroqApiKey,
  getGroqApiKeys,
  markGroqKeySuccessful,
} from '@/app/lib/groq-keys'
import { getUserUsage, incrementUserUsage } from '@/app/lib/usage-tracking'
import { GroqCompound } from '@/app/lib/groq-compound'
import {
  googleApiKey1,
  googleSearchEngineId,
  newsApiKey1,
  newsApiKey2,
  nextPublicOwnerEmail
} from '@/app/lib/env';
import { determineIntent } from '@/app/lib/intent-router'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const GUARD_MODEL = 'meta-llama/llama-guard-4-12b'

const ASTRA_MODEL_FAST = 'meta-llama/llama-4-scout-17b-16e-instruct'
const ASTRA_MODEL_SMART = 'meta-llama/llama-4-maverick-17b-128e-instruct'
const VYRA_MODEL_MOONSHOT = 'moonshotai/kimi-k2-instruct-0905'
const VYRA_MODEL_QWEN = 'qwen/qwen3-32b'
const GROQ_COMPOUND_MODEL = 'groq/compound'
const GROQ_COMPOUND_MINI_MODEL = 'groq/compound-mini'

const OWNER_EMAILS = [
  'miscwinsez@gmail.com',
  'noor.laily@gmail.com',
  'azrulhadi@gmail.com'
].concat(nextPublicOwnerEmail ? [nextPublicOwnerEmail] : [])

const SYSTEM_PROMPT = (currentTime: string, timezone: string, searchEnabled: boolean, trait?: string) => {
  const searchStatus = searchEnabled
    ? 'Search is currently ON. You can access real-time information from the web through Vector and other open data sources.'
    : 'Search is currently OFF. You cannot access live information and must rely on general knowledge only.'

  const normalizedTrait = typeof trait === 'string' ? trait.trim() : ''
  const traitInstruction = normalizedTrait
    ? `The user has explicitly set your personality preference to: "${normalizedTrait}". Strongly align your tone, humor level, pacing, and choice of words with this preference while keeping answers accurate. Never say that you are following a personality setting; just act that way.`
    : 'No explicit personality preference set. Default to warm, confident, and natural while staying adaptable to the user.'

  return `
You are Zevy AI, a unified assistant with two specialized systems and a knowledge core.

Current time: ${currentTime} (${timezone}).
${searchStatus}
${traitInstruction}

YOUR SYSTEMS:
1. Astra: research and factual intelligence. Uses Vector, the live knowledge core, which aggregates web search, Wikipedia, news, RSS feeds, and open data sources such as World Bank, NASA, and other free APIs.
2. Vyra: debate and multi-perspective reasoning. Uses two internal experts with access to the same knowledge context when available.

HOW YOU WORK:
- You automatically choose the best internal system based on the user's query, but you always speak as a single assistant called Zevy AI.
- If the query needs current, specific facts (for example current prices, latest news, recent reports, or dated statistics), you rely on Astra with Vector and external knowledge.
- If the query is about opinions, strategies, ethics, or hypotheticals, you rely on Vyra-style multi-perspective reasoning.
- For simple chat, creativity, or light questions, you can answer directly using Astra-style reasoning without heavy research.
- For creative writing requests (stories, poems, scripts, roleplay), write the creative piece in the requested format. Do not turn the response into a feasibility lecture unless the user explicitly asks for an explanation.

KEY RULES:
- When using facts from external knowledge (Vector, web search, RSS, World Bank, finance or currency APIs, or any other retrieved data), you must cite them using the specific article, page, or dataset titles and, when available, the publisher and date. For example: "(Source: 'Helion Signs Power Deal with Microsoft for 2028 Delivery' – Helion Energy press release, May 2023)" instead of generic labels like "Reuters (December 2024)".
- When the user message or Knowledge Context includes lines such as "[NEWS] Title" or "Source: https://...", you must treat those as the canonical evidence and base your citations on those exact titles and URLs, not on your internal training data.
- Never present retrieved external facts as your own internal knowledge; always treat them as sourced data.
- If no reliable external data is available, you must start your answer with the exact phrase: "Based on general knowledge (no current data found)...".
- When search is OFF for this request, you must not claim to have performed web search, used Vector, or accessed live data. In that case, answer only from general knowledge and the provided conversation context.
- Be explicit when you are uncertain or interpolating beyond the retrieved data.

CONVERSATION STYLE:
- Sound like a helpful human, not a template.
- Use contractions and varied sentence length when it fits.
- Only use heavy structure (lots of bullets/tables) when it genuinely helps clarity; otherwise keep it natural.
- Prefer short paragraphs with blank lines; add lists or tables only when useful.
- Avoid repetitive filler like "Certainly", "As an AI", "I'd be happy to", "In conclusion" unless the user asks for that style.
- For exact quotes/lyrics: do not guess from memory. If you cannot cite a reliable source or the user has not provided the text, ask them to paste the relevant lines or offer a summary instead.
- If you do not know something, say you do not know instead of guessing.
- Keep responses detailed but easy to understand: prefer simple language, avoid unnecessary jargon, and explain any symbols or equations briefly.
- Within safety limits, follow the user's explicit instructions about goals, format, and length as closely as possible. If you cannot follow an instruction, briefly explain why and offer the closest safe alternative.
- When the user asks for a specific output type (for example an essay, email, list, or code), produce that format directly instead of meta-commentary about what you could do.
- Always refer to yourself as Zevy AI. Do not call yourself ChatGPT or any other product name.
- Do not add explicit sections labelled "Reasoning", "Thought Process", or similar unless the user clearly asks to see your reasoning.
- End with a follow-up question only when it helps move the user forward (for example, to clarify options or next steps).
`;
}

const MATHJS_API_URL = 'https://api.mathjs.org/v4/'

type CalculatorAssist =
  | { mode: 'direct'; expression: string; result: string; context: string }
  | { mode: 'context'; expression: string; result: string; context: string }

function buildMathJsExpression(input: string): { expression: string; direct: boolean } | null {
  const raw = (input || '').trim()
  if (!raw) return null

  const cleaned = raw
    .replace(/^[\s"'`]+/, '')
    .replace(/[\s"'`]+$/, '')
    .replace(/\s+/g, ' ')

  if (cleaned.length > 200) return null
  if (/[;"'`\\\n\r]/.test(cleaned)) return null
  if (/=/.test(cleaned)) return null

  const stripped = cleaned.replace(
    /^(what is|whats|what's|calculate|calc|compute|evaluate|solve|answer)\b[:\s]*/i,
    ''
  )

  const expression = stripped.trim().replace(/[?]+$/, '').trim()
  if (!expression) return null
  if (expression.length > 200) return null
  if (!/[0-9]/.test(expression) && !/\b(pi|e)\b/i.test(expression)) return null

  const allowed = /^[0-9a-zA-Z_+\-*/^()., %!<>\s]+$/
  if (!allowed.test(expression)) return null

  const hasLetters = /[a-zA-Z]/.test(expression)
  const allowedWords = /\b(pi|e|sqrt|abs|sin|cos|tan|asin|acos|atan|log|ln|exp|pow|min|max|floor|ceil|round)\b/gi
  if (hasLetters) {
    const removedAllowed = expression.replace(allowedWords, '').replace(/[0-9_\s+\-*/^()., %!<>]/g, '')
    if (removedAllowed.length > 0) return null
  }

  const direct = expression === cleaned || cleaned.toLowerCase().startsWith(expression.toLowerCase())
  return { expression, direct }
}

async function evaluateWithMathJs(expression: string): Promise<string | null> {
  try {
    const response = await axios.get(MATHJS_API_URL, {
      params: { expr: expression, precision: 14 },
      timeout: 4000,
    })
    if (typeof response.data === 'string' && response.data.trim().length > 0) {
      return response.data.trim()
    }
    return null
  } catch {
    return null
  }
}

async function getCalculatorAssist(message: string): Promise<CalculatorAssist | null> {
  const candidate = buildMathJsExpression(message)
  if (!candidate) return null

  const result = await evaluateWithMathJs(candidate.expression)
  if (!result) return null

  const context = `Calculator Result (use for arithmetic accuracy; do not mention this block):\nExpression: ${candidate.expression}\nResult: ${result}`

  if (candidate.direct) {
    return { mode: 'direct', expression: candidate.expression, result, context }
  }
  return { mode: 'context', expression: candidate.expression, result, context }
}

// Enhanced knowledge detection patterns
const INFORMATION_SEEKING_PATTERNS = [
  // Question words
  new RegExp('\\b(what|when|where|why|how|which)\\b.*\\?', 'i'),
  // Information requests
  new RegExp('\\b(tell me|explain|describe|define|clarify|elaborate)\\b', 'i'),
  // Specific facts
  new RegExp('\\b(date|time|year|history|origin|meaning|definition|purpose|function)\\b', 'i'),
  // Comparison/analysis
  new RegExp('\\b(compare|difference|similarity|versus|vs|better|best|worst)\\b', 'i'),
  // Research terms
  new RegExp('\\b(research|study|analysis|statistics|data|information|details)\\b', 'i'),
  // Current events and dates
  new RegExp('\\b(news|current|recent|latest|today|this week|this month|happened|occurred|took place)\\b', 'i'),
  // Date patterns
  new RegExp('\\b(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2})\\b', 'i'),
  new RegExp('\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2}\\b', 'i'),
  new RegExp('\\b\\d{1,2}\\s+(january|february|march|april|may|june|july|august|september|october|november|december)\\b', 'i'),
  new RegExp('\\b(202[0-9]|20[2-9][0-9])\\b', 'i'),
  // Zevy-specific queries
  new RegExp('\\b(zevy|adam zein ziqry|creator|made by|who made|who created|who built)\\b', 'i'),
  // Technical queries
  new RegExp('\\b(how does|how to|how can|how do|how would|how might)\\b', 'i'),
  // Explanation requests
  new RegExp('\\b(what is|what are|what does|what do|what was|what were|what will)\\b', 'i'),
  // Verification requests
  new RegExp('\\b(is it true|is this correct|is that right|are you sure|can you confirm)\\b', 'i'),
  // List requests
  new RegExp('\\b(list|examples|give me|show me|provide me|recommend|suggest)\\b', 'i'),
  // Detailed requests
  new RegExp('\\b(detail|detailed|in depth|in detail|comprehensive|thorough|complete)\\b', 'i'),
  // Specific topics (excluding politics)
  new RegExp('\\b(technology|science|economics|culture|history|geography|events|news|world|global)\\b', 'i'),
  // Event-specific
  new RegExp('\\b(event|incident|happening|occurrence|situation|development|update)\\b', 'i'),
  // Knowledge seeking
  new RegExp('\\b(know|learn|understand|find out|discover)\\b', 'i')
]

// Chat/social patterns (don't trigger search)
const CHAT_PATTERNS = [
  new RegExp('\\b(hello|hi|hey|what\'s up|how are you)\\b', 'i'),
  new RegExp('\\b(thanks|thank you|cool|awesome|nice|great)\\b', 'i'),
  new RegExp('\\b(yeah|yes|no|okay|ok|sure|alright)\\b', 'i'),
  new RegExp('\\b(lol|haha|lmao|😂|😄|😊)\\b', 'i'),
  new RegExp('\\b(made you|who created|who built)\\b', 'i'),
  new RegExp('\\b(you are|you\'re|your)\\b.*\\b(cool|nice|smart|helpful|amazing)\\b', 'i')
]

// Free knowledge sources that don't require API keys
const FREE_KNOWLEDGE_SOURCES = {
  wikipedia: true,
  wikidata: true,
  dbpedia: true,
  britannica: false, // requires subscription
  cia_world_factbook: true,
  nasa_api: true,
  weather_api: false, // limited free tier
  news_api: false, // requires API key
  google_search: false, // requires API key
  rss_feeds: true,
  open_library: true,
  open_street_map: true,
  open_weather_map: true, // limited free tier
  open_corporates: true,
  open_food_facts: true,
  open_parliament: true,
  open_science_framework: true,
  open_secrets: true,
  open_street_art: true,
  open_supply_hub: true
}

const IMAGE_KEYWORDS = [
  'generate',
  'make',
  'create',
  'draw',
  'image',
  'picture',
  'photo',
  'design',
  'illustrate',
  'render',
  'paint'
]

const IMAGE_PATTERNS = [
  new RegExp('generate\\s+(me\\s+)?(an?\\s+)?(image|picture|art|artwork)', 'i'),
  new RegExp('make\\s+(me\\s+)?(an?\\s+)?(image|picture|art|artwork)', 'i'),
  new RegExp('create\\s+(me\\s+)?(an?\\s+)?(image|picture|art|artwork)', 'i'),
  new RegExp('draw\\s+(me\\s+)?(an?\\s+)?(image|picture|art|artwork)', 'i'),
  new RegExp('(image|picture|art|artwork)\\s+generation', 'i')
]

const UNAVAILABLE_FEATURE_KEYWORDS = [
  'generate',
  'make',
  'create',
  'draw',
  'image',
  'picture',
  'photo',
  'design',
  'illustrate',
  'render',
  'paint'
];

const FEATURE_KEYWORDS = [
  'feature',
  'capability',
  'can you do',
  'what can you do',
  'what are your features',
  'what are your capabilities'
];

const MUSIC_KEYWORDS = [
  'album', 'song', 'track', 'lyric', 'discography', 'single', 'ep', 'mixtape',
  'playlist', 'feature', 'collab', 'artist', 'band', 'rapper', 'singer', 'musician'
]

/**
 * Intelligent model selector for Astra that chooses between Scout (speed) and Maverick (intelligence)
 * Based on user intent, message complexity, and conversation context
 */
function selectAstraModel(message: string, chatHistory: Array<{content: string}> = []): {
  model: string;
  reason: string;
  intent: 'speed' | 'intelligence' | 'balanced';
} {
  const normalizedMessage = message.toLowerCase().trim()
  
  // Speed indicators - casual conversation, simple queries
  const speedPatterns = [
    new RegExp('^(hi|hello|hey|yo|sup)\\b', 'i'),                           // Simple greetings
    new RegExp('^(how are you|how\'s it going|what\'s up)\\b', 'i'),         // Casual check-ins
    new RegExp('^(thanks|thank you|cool|nice|awesome)\\b', 'i'),          // Simple responses
    new RegExp('^(good|great|fine|ok|okay)\\b', 'i'),                       // Simple status
    new RegExp('^\\b(yes|no|yeah|nah|yep|nope)\\b$', 'i'),                  // Simple yes/no
    new RegExp('^(bye|goodbye|see you|later|cya)\\b', 'i'),                // Farewells
    new RegExp('\\b(lol|lmao|haha|😂|😄|😊)\\b', 'i'),                        // Emojis/laughing
    new RegExp('^.{1,20}$', 'i'),                                          // Very short messages
  ]
  
  // Intelligence indicators - complex analysis, deep thinking
  const intelligencePatterns = [
    new RegExp('\\b(analyze|analysis|examine|evaluate|assess)\\b', 'i'),      // Analysis requests
    new RegExp('\\b(comprehensive|detailed|thorough|in-depth)\\b', 'i'),    // Depth requests
    new RegExp('\\b(compare|comparison|contrast|versus|vs)\\b', 'i'),     // Comparative analysis
    new RegExp('\\b(implications|consequences|impact|effects)\\b', 'i'),     // Cause/effect
    new RegExp('\\b(theory|hypothesis|philosophy|conceptual)\\b', 'i'),    // Abstract thinking
    new RegExp('\\b(research|study|investigation|exploration)\\b', 'i'),   // Research requests
    new RegExp('\\b(complex|complicated|sophisticated|advanced)\\b', 'i'),  // Complexity indicators
    new RegExp('\\b(strategic|tactical|planning|optimization)\\b', 'i'),   // Strategic thinking
    new RegExp('\\b(critical thinking|logical|reasoning|rational)\\b', 'i'), // Critical analysis
    new RegExp('\\b(synthesize|integration|holistic|systemic)\\b', 'i'),   // Synthesis requests
    new RegExp('.{100,}', 'i'),                                            // Long messages
    new RegExp('[;,.]{3,}', 'i'),                                          // Complex punctuation
  ]
  
  // Check for speed patterns
  const speedMatches = speedPatterns.filter(pattern => pattern.test(normalizedMessage)).length
  const intelligenceMatches = intelligencePatterns.filter(pattern => pattern.test(normalizedMessage)).length
  
  // Check chat history for context
  const hasComplexHistory = chatHistory.some(msg => 
    msg.content && (msg.content.length > 100 || /\b(analyze|research|compare)\b/i.test(msg.content))
  )
  
  // Decision logic
  if (intelligenceMatches >= 2 || (intelligenceMatches >= 1 && hasComplexHistory)) {
    return {
      model: ASTRA_MODEL_SMART,
      reason: `Detected ${intelligenceMatches} intelligence patterns${hasComplexHistory ? ' with complex history' : ''}`,
      intent: 'intelligence'
    }
  }
  
  if (speedMatches >= 1 && intelligenceMatches === 0 && normalizedMessage.length < 50) {
    return {
      model: ASTRA_MODEL_FAST,
      reason: `Detected ${speedMatches} speed patterns with simple message`,
      intent: 'speed'
    }
  }
  
  // Default to Scout for balanced performance, but check message complexity
  if (normalizedMessage.length > 150 || intelligenceMatches >= 1) {
    return {
      model: ASTRA_MODEL_SMART,
      reason: 'Message complexity or length suggests need for deeper analysis',
      intent: 'balanced'
    }
  }
  
  return {
      model: ASTRA_MODEL_FAST,
      reason: 'Default to speed model for general conversation',
      intent: 'balanced'
    }
}

function determineIntentInternal(message: string, chatHistory: any[] = []) {
  const normalizedMessage = message.toLowerCase().trim()

  const isFeatureRequest = FEATURE_KEYWORDS.some(keyword => normalizedMessage.includes(keyword))
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

  const isImageRequest = IMAGE_PATTERNS.some(pattern => pattern.test(normalizedMessage))
  if (isImageRequest) {
    return {
      isConversational: false,
      needsVector: false,
      confidence: 'high',
      reason: 'Image generation request detected',
      customResponse:
        'Sorry, image generation is currently unavailable. This feature may be coming in future updates!',
    }
  }

  const isMusicRequest = MUSIC_KEYWORDS.some(keyword => normalizedMessage.includes(keyword))
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
      normalizedMessage.includes('?') ||
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

  const isConversational = conversationPatterns.some(pattern => pattern.test(normalizedMessage)) || isFollowUp

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

/**
 * Checks if a user's prompt is safe using Llama Guard 4-12b as a moderator.
 * This function acts as our advanced harm detector.
 * @param prompt The user's input prompt.
 * @param userModel The AI model the user is currently using.
 * @returns A boolean indicating if the prompt is safe.
 */
async function isPromptSafe(prompt: string, userModel: string): Promise<boolean> {
  const apiKey = getGroqApiKey();
  
  // If no API key is available, skip content moderation and allow the request
  // This prevents the error message from appearing in the browser
  if (!apiKey) {
    return true; // Allow all requests when no moderation is available
  }

  const groq = new Groq({ apiKey })

  const moderationPrompt = `You are Llama Guard 4-12b, an advanced content moderator. Analyze the user's prompt for harmful content including: illegal activities, hate speech, harassment, violence, self-harm, sexually explicit content, or any dangerous/inappropriate requests. 

User prompt: "${prompt}"
Current AI model being used: ${userModel}

Classify this prompt as either 'safe' or 'unsafe'. Respond with only one word: either 'safe' or 'unsafe'.`

  try {
    const response = await groq.chat.completions.create({
      model: GUARD_MODEL,
      messages: [{ role: 'user', content: moderationPrompt }],
      temperature: 0,
      max_tokens: 10
    })
    const result = response.choices[0]?.message?.content?.trim().toLowerCase() || 'unsafe'
    const allowlistPatterns = [
      /\b(space|nasa|spacex|astronomy|planet|star|galaxy|universe)\b/i,
      /\b(science|scientific|physics|chemistry|biology|math|mathematics|engineering)\b/i,
      /\b(policy|policies|regulation|economy|economic|market|finance|climate|environmental)\b/i,
      /\b(debate|argument|ethics|philosophy|pros and cons|tradeoff|trade-offs)\b/i
    ]
    const isAllowlisted = allowlistPatterns.some(pattern => pattern.test(prompt))
    if (result === 'unsafe' && !isAllowlisted) {
      return false
    }
    return true
  } catch (error) {
    // Silent error handling - no console output to avoid browser errors
    return true // Allow request if moderation fails
  }
}

// Special handler for owner requests
async function searchGoogle(query: string) {
  const cacheKey = `google:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const apiKey = googleApiKey1;
    const searchEngineId = googleSearchEngineId;

    if (!apiKey || !searchEngineId) {
      console.error('Google Search API key or Engine ID is missing from Vercel environment.')
      return []
    }

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: 3
      }
    })
    cache.set(cacheKey, response.data.items || [], 3600000) // Cache for 1 hour
    return response.data.items || []
  } catch (error) {
    console.error('Google search error:', error)
    return []
  }
}



async function searchWebsite(query: string, site: string): Promise<any[]> {
  try {
    const apiKey = googleApiKey1;
    const searchEngineId = googleSearchEngineId;

    if (!apiKey || !searchEngineId) {
      console.error('Google Search API key or Engine ID is missing from Vercel environment.')
      return []
    }

    const siteQuery = `site:${site} ${query}`;
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: siteQuery,
        num: 2 // Limit to 2 results to keep it concise
      }
    })
    return response.data.items || []
  } catch (error) {
    console.error(`Google search error on site ${site}:`, error)
    return []
  }
}

async function searchNews(query: string): Promise<any[]> {
  const cacheKey = `news:${query}`
  const cachedData = await cache.get(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const apiKeys = [newsApiKey1, newsApiKey2].filter(Boolean) as string[]

  if (apiKeys.length === 0) {
    console.error('No News API keys found')
    return []
  }

  for (const apiKey of apiKeys) {
    try {
      const encodedQuery = encodeURIComponent(query)
      const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&apiKey=${apiKey}`
      const response = await axios.get(url)
      const articles = response.data.articles.slice(0, 5)

      if (articles.length > 0) {
        await cache.set(cacheKey, articles, 1800 * 1000) // Cache for 30 minutes
        return articles
      }
    } catch (error) {
      console.warn(`News API key ${apiKey.slice(0, 5)}... failed. Trying next key.`);
    }
  }

  return [];
}

/**
 * Get knowledge from free sources that don't require API keys
 */
async function getFreeKnowledge(query: string): Promise<string> {
  const sources = []
  const compound = new GroqCompound()
  
  // Wikipedia (always available)
  const wikiResults = await compound.searchWikipedia(query)
  if (wikiResults.length > 0) {
    sources.push(`Wikipedia: ${wikiResults.slice(0, 2).map((r: { snippet: string }) => r.snippet).join('. ')}`)
  }
  
  // CIA World Factbook for country/geography info
  if (/\b(country|nation|capital|population|geography|world|global)\b/i.test(query)) {
    try {
      const response = await axios.get(`https://www.cia.gov/the-world-factbook/page-data/index/page-data.json`)
      if (response.data) {
        const countries = response.data.result.data.allCountries.nodes.map((n: any) => n.name).slice(0, 10);
        sources.push(`CIA World Factbook: Country and geographic data available. Top 10 countries: ${countries.join(', ')}`)
      }
    } catch (error) {
      // Silent fail - not all queries will work with this
    }
  }
  
  // NASA API for space/astronomy queries
  if (/\b(space|planet|star|galaxy|nasa|astronomy|universe)\b/i.test(query)) {
    try {
      const response = await axios.get(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`)
      if (response.data?.collection?.items?.length > 0) {
        const titles = response.data.collection.items.slice(0, 3).map((item: any) => item.data[0].title);
        sources.push(`NASA: Space and astronomy information available. Top 3 results: ${titles.join(', ')}`)
      }
    } catch (error) {
      // Silent fail
    }
  }

  // Open Library for books and literature
  if (/\b(book|author|novel|literature|publish|read)\b/i.test(query)) {
    try {
      const response = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=2`)
      if (response.data?.docs?.length > 0) {
        sources.push(`Open Library: ${response.data.docs.slice(0, 2).map((book: any) => 
          `${book.title} by ${book.author_name?.join(', ') || 'Unknown author'}`
        ).join(', ')}`)
      }
    } catch (error) {
      // Silent fail
    }
  }

  // OpenStreetMap for geographic queries
  if (/\b(map|location|place|address|city|town|village)\b/i.test(query)) {
    try {
      const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=2`)
      if (response.data?.length > 0) {
        sources.push(`OpenStreetMap: Locations found for ${query}`)
      }
    } catch (error) {
      // Silent fail
    }
  }

  // RSS Feeds for news and updates
  if (/\b(news|update|latest|current|recent|article|blog)\b/i.test(query)) {
    try {
      const parser = new Parser()
      const feed = await parser.parseURL(`https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml`)
      if (feed.items?.length > 0) {
        sources.push(`NY Times RSS: ${feed.items.slice(0, 2).map((item: any) => item.title).join(', ')}`)
      }
    } catch (error) {
      // Silent fail
    }
  }

  // Open Food Facts for food/nutrition queries
  if (/\b(food|nutrition|ingredient|recipe|calorie|diet)\b/i.test(query)) {
    try {
      const response = await axios.get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=2`)
      if (response.data?.products?.length > 0) {
        sources.push(`Open Food Facts: ${response.data.products.slice(0, 2).map((p: any) => p.product_name).join(', ')}`)
      }
    } catch (error) {
      // Silent fail
    }
  }

  if (/\b(world bank|gdp|gross domestic product|unemployment|inflation|poverty|economy|economic)\b/i.test(query)) {
    try {
      const response = await axios.get(
        'https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD',
        {
          params: {
            format: 'json',
            per_page: 1
          }
        }
      )
      const series = Array.isArray(response.data) ? response.data[1] : null
      if (Array.isArray(series) && series.length > 0) {
        const entry = series[0]
        if (entry && entry.value != null && entry.date) {
          sources.push(
            `World Bank Open Data: Global GDP in ${entry.date} is approximately ${entry.value} current US dollars.`
          )
        }
      }
    } catch (error) {
    }
  }

  const stockKeyword = /\b(stock|stocks|share|shares|ticker|symbol|price|market)\b/i
  if (stockKeyword.test(query)) {
    try {
      const symbolMatch = query.toUpperCase().match(/\b[A-Z]{1,5}\b/)
      if (symbolMatch) {
        const symbol = symbolMatch[0]
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`
        )
        const result = response.data?.quoteResponse?.result?.[0]
        if (result && result.regularMarketPrice != null && result.currency) {
          sources.push(
            `Stock data (Yahoo Finance): ${symbol} current price is approximately ${result.regularMarketPrice} ${result.currency}.`
          )
        }
      }
    } catch (error) {
    }
  }

  const fxMatch = query.toUpperCase().match(/\b([A-Z]{3})\s+TO\s+([A-Z]{3})\b/)
  if (fxMatch) {
    try {
      const from = fxMatch[1]
      const to = fxMatch[2]
      const response = await axios.get(
        'https://api.exchangerate.host/convert',
        {
          params: {
            from,
            to,
            amount: 1
          }
        }
      )
      const rate = response.data?.result
      const date = response.data?.date
      if (rate != null) {
        sources.push(
          `Exchange rate (exchangerate.host): 1 ${from} is approximately ${rate} ${to} as of ${date || 'the latest available date'}.`
        )
      }
    } catch (error) {
    }
  }
  
  return sources.join('\n\n')
}

/**
 * Enhanced knowledge gathering that prioritizes free sources and current events
 */
async function gatherKnowledge(
  userMessage: string,
  intent: { shouldSearch: boolean; confidence: string; reason: string; forceSearch?: boolean }
): Promise<string> {
  const shouldSearch = intent.shouldSearch || intent.forceSearch
  const vectorSearchOn = Boolean(intent.forceSearch)

  if (!shouldSearch) {
    return ''
  }
  
  // Special handling for Zevy-related queries
  const isAboutZevy = /\b(zevy|adam zein ziqry|creator|made by|who made|who created|who built)\b/i.test(userMessage)
  if (isAboutZevy) {
    return `Zevy AI was created by Adam Zein Ziqry, a 15-year-old developer. It features:
- Fast responses with Astra (single LLM)
- Deep thinking with Vyra (dual LLM debate)
- Web search capabilities
- Persistent conversation history
- Natural conversation style

Image generation is currently unavailable but may be added in future updates.`
  }
  
  const knowledgeParts = []
  const compound = new GroqCompound()
  
  // Check query type for optimized retrieval
  const hasDatePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i.test(userMessage) ||
                      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(userMessage) ||
                      /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(userMessage) ||
                      /\b(202[0-9]|20[2-9][0-9])\b/i.test(userMessage)
  
  const hasCurrentEventTerms = /\b(today|yesterday|this week|this month|current|recent|latest|news|happened|occurred|took place|what happened)\b/i.test(userMessage)
  
  // Prioritize news search for date-specific and current event queries
  if (hasDatePattern || hasCurrentEventTerms) {
    try {
      // First try free news sources
      const freeNews = await getFreeKnowledge(userMessage)
      if (freeNews) {
        knowledgeParts.push(freeNews)
      } else {
        // Fallback to compound search if no free results
        const newsResults = await compound.searchNews(userMessage)
        if (newsResults.length > 0) {
          knowledgeParts.push(`Recent News:\n${newsResults.slice(0, 3).map((article: any) => 
            `- ${article.title} (${article.source.name}): ${article.description}`
          ).join('\n')}`)
        }
      }
    } catch (error) {
      // Silent fail - continue with other sources
    }
  }
  
  // Always include free sources
  const freeKnowledge = await getFreeKnowledge(userMessage)
  if (freeKnowledge) {
    knowledgeParts.push(freeKnowledge)
  }

  const requiresDeepResearch =
    (intent.confidence === 'high' && userMessage.length > 30) ||
    hasDatePattern ||
    hasCurrentEventTerms ||
    vectorSearchOn
  
  if (requiresDeepResearch) {
    if (vectorSearchOn) {
      try {
        const compoundKnowledge = await callGroqCompoundKnowledge(userMessage, GROQ_COMPOUND_MODEL)
        if (compoundKnowledge && !isBackendFailureMessage(compoundKnowledge) && compoundKnowledge.length > 50) {
          knowledgeParts.push(`Vector Research:\n${compoundKnowledge}`)
        }
      } catch (error) {
      }

      try {
        const miniKnowledge = await callGroqCompoundKnowledge(userMessage, GROQ_COMPOUND_MINI_MODEL)
        if (miniKnowledge && !isBackendFailureMessage(miniKnowledge) && miniKnowledge.length > 50) {
          knowledgeParts.push(`Vector Research (Compact):\n${miniKnowledge}`)
        }
      } catch (error) {
      }
    } else {
      try {
        const compoundKnowledge = await compound.browseAndAnalyze(userMessage, ASTRA_MODEL_SMART)
        if (compoundKnowledge && compoundKnowledge.length > 50) {
          knowledgeParts.push(`Comprehensive Research:\n${compoundKnowledge}`)
        }
      } catch (error) {
      }
    }
  }
  
  const fullKnowledge = knowledgeParts.join('\n\n---\n\n')
  const maxLength = 8000
  if (fullKnowledge.length > maxLength) {
    return fullKnowledge.slice(0, maxLength)
  }
  return fullKnowledge
}

// Health check endpoint
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const history = url.searchParams.get('history')
  const chatId = url.searchParams.get('chat_id')
  const emailParam = url.searchParams.get('email')

  if (history === '1' || history === 'true') {
    try {
      const supabase = await createSupabaseClient()
      let userEmail: string | undefined

      try {
        const {
          data: { session }
        } = await supabase.auth.getSession()
        userEmail = session?.user?.email as string | undefined
      } catch {
        userEmail = undefined
      }

      if (!userEmail && emailParam && process.env.NODE_ENV === 'development') {
        userEmail = emailParam
      }

      if (!userEmail) {
        return NextResponse.json({ conversations: [] }, { status: 200 })
      }

      let query = supabase
        .from('conversations')
        .select('*')
        .eq('user_email', userEmail)
        .order('updated_at', { ascending: false })

      if (chatId) {
        query = query.eq('id', chatId)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error fetching conversation history:', error.message)
        return NextResponse.json({ conversations: [] }, { status: 200 })
      }

      return NextResponse.json({ conversations: data || [] }, { status: 200 })
    } catch (error: any) {
      console.error('Unexpected error in chat history GET:', error.message || error)
      return NextResponse.json({ conversations: [] }, { status: 200 })
    }
  }

  try {
    if (process.env.NODE_ENV !== 'development') {
      assertVercelOnly()
      const envCheck = validateVercelEnv()
      
      if (!envCheck.valid) {
        return NextResponse.json(
          { status: 'error', message: 'Missing Vercel variables', missing: envCheck.missing },
          { status: 500 }
        )
      }
    }
    
    const testResults = {
      groq: await testGroqConnection(),
      flux: await testFluxConnection(),
      supabase: await testSupabaseConnection()
    }
    
    const apiUrl = getVercelEnv('NEXT_PUBLIC_API_URL') || 'https://zevy-phi.vercel.app'
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      apiUrl: apiUrl,
      vercel: getVercelInfo(),
      api_connections: testResults
    })
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', message: err.message, vercel: getVercelInfo() },
      { status: 500 }
    )
  }
}

function getFallbackModel(primaryModel: string): string | undefined {
  if (primaryModel === ASTRA_MODEL_SMART) {
    return ASTRA_MODEL_FAST
  }
  if (primaryModel === VYRA_MODEL_MOONSHOT || primaryModel === VYRA_MODEL_QWEN) {
    return ASTRA_MODEL_FAST
  }
  return undefined
}

const groqKeyCooldownUntilMs = new Map<string, number>()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseRetryAfterMs(headerValue: unknown): number | undefined {
  if (typeof headerValue !== 'string') return undefined
  const asSeconds = Number(headerValue)
  if (!Number.isNaN(asSeconds) && Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.floor(asSeconds * 1000)
  }
  const asDate = Date.parse(headerValue)
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now()
    if (delta > 0) return delta
  }
  return undefined
}

function getOrderedGroqKeys(apiKeys: string[]): Array<{ apiKey: string; index: number }> {
  const startIndex = getCurrentGroqKeyIndex()
  const indexed = apiKeys.map((apiKey, index) => ({ apiKey, index }))
  if (indexed.length <= 1) return indexed
  const normalizedStart = ((startIndex % indexed.length) + indexed.length) % indexed.length
  return [...indexed.slice(normalizedStart), ...indexed.slice(0, normalizedStart)]
}

async function safeAICall(
  primaryModel: string,
  basePayload: { messages: any[]; temperature: number; max_tokens: number; stream: boolean }
): Promise<string | ReadableStream> {
  const apiKeys = getGroqApiKeys()
  const stream = basePayload.stream

  if (apiKeys.length === 0) {
    const friendly =
      'I am temporarily unable to reach my reasoning backend. Please try again in a little while.'
    if (stream) {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ response: friendly })}\n\n`)
          controller.close()
        },
      })
    }
    return friendly
  }

  const fallbackModel = getFallbackModel(primaryModel)
  const modelsToTry = fallbackModel ? [primaryModel, fallbackModel] : [primaryModel]

  let lastError: any = null

  for (const model of modelsToTry) {
    const orderedKeys = getOrderedGroqKeys(apiKeys)
    for (const { apiKey, index } of orderedKeys) {
      const cooldownUntil = groqKeyCooldownUntilMs.get(apiKey) || 0
      if (cooldownUntil > Date.now()) {
        continue
      }
      try {
        const response = await axios.post(
          GROQ_API_URL,
          { ...basePayload, model },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
            responseType: stream ? 'stream' : 'json',
          }
        )

        if (stream) {
          markGroqKeySuccessful(index)
          return response.data as ReadableStream
        }

        const content = response.data?.choices?.[0]?.message?.content
        if (typeof content === 'string' && content.trim().length > 0) {
          markGroqKeySuccessful(index)
          return content
        }

        lastError = new Error('Empty response from AI backend')
      } catch (error: any) {
        lastError = error
        const status: number | undefined = error?.response?.status
        const retryAfterMs = parseRetryAfterMs(error?.response?.headers?.['retry-after'])

        let cooldownMs = 0
        if (status === 401 || status === 403) {
          cooldownMs = 60_000
        } else if (status === 429) {
          cooldownMs =
            retryAfterMs ?? Math.floor(1500 + Math.random() * 1500)
        } else if ([500, 502, 503, 504].includes(status || 0)) {
          cooldownMs = Math.floor(800 + Math.random() * 1200)
        } else if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
          cooldownMs = Math.floor(800 + Math.random() * 1200)
        } else if (!status) {
          cooldownMs = Math.floor(500 + Math.random() * 800)
        }

        if (cooldownMs > 0) {
          groqKeyCooldownUntilMs.set(apiKey, Date.now() + cooldownMs)
        }

        console.error(
          'Groq backend error:',
          status ? `status=${status}` : '',
          error?.message || error
        )

        if (cooldownMs > 0 && status === 429 && orderedKeys.length === 1) {
          await sleep(Math.min(cooldownMs, 3000))
        } else {
          await sleep(Math.floor(100 + Math.random() * 200))
        }
      }
    }
  }
  
  console.error('All AI backends failed.', lastError)

  const friendly =
    'I am having trouble connecting to my reasoning backend right now. Please try again in a few moments.'
  if (stream) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ response: friendly })}\n\n`)
        controller.close()
      },
    })
  }
  return friendly
}

function isBackendFailureMessage(text: string): boolean {
  const normalized = text.toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes('trouble connecting to my reasoning backend') ||
    normalized.includes('temporarily unable to reach my reasoning backend')
  )
}

async function callGroqCompoundKnowledge(
  userMessage: string,
  model: string
): Promise<string> {
  const basePayload = {
    messages: [
      {
        role: 'system',
        content: `You are a research engine for Zevy AI. Use your tools to fetch current, real-world information and return a concise knowledge brief with key facts and dates.

At the end of your answer, add a section titled "Sources" with one URL per line in the exact format:
Source: https://example.com
Source: https://another-site.com

Do not speak as Zevy AI. Focus on summarizing evidence.`,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
    temperature: 0.2,
    max_tokens: 1024,
    stream: false,
  }
  const result = await safeAICall(model, basePayload)
  if (typeof result === 'string') {
    return result
  }
  return ''
}

async function callGroq(
  messages: any[],
  model: string,
  stream = false,
  currentTime?: string,
  timezone?: string,
  contextualUserMessage?: string,
  searchEnabledForSystemPrompt: boolean = false,
  trait?: string
): Promise<string | ReadableStream> {
  const systemMessage = {
    role: 'system',
    content: SYSTEM_PROMPT(currentTime as string, timezone as string, searchEnabledForSystemPrompt, trait),
  }

  const payloadMessages = [systemMessage, ...messages]

  if (contextualUserMessage) {
    const lastMessage = payloadMessages[payloadMessages.length - 1]
    if (lastMessage && lastMessage.role === 'user') {
      lastMessage.content = contextualUserMessage
    }
  }

  const basePayload = {
    messages: payloadMessages,
    temperature: isCreativeWritingRequest(
      String(payloadMessages.slice().reverse().find(m => m?.role === 'user')?.content || '')
    )
      ? 0.7
      : 0.2,
    max_tokens: 1024,
    stream,
  }

  return safeAICall(model, basePayload)
}

async function detectAndTranslate(text: string, targetLanguage: string = 'en'): Promise<{ detectedLanguage: string; translatedText: string }> {
  const apiKey = googleApiKey1;
  if (!apiKey) {
    console.error('Google Translate API key is not configured.');
    return { detectedLanguage: 'en', translatedText: text };
  }

  if (!text.trim()) {
    return { detectedLanguage: 'en', translatedText: text };
  }

  try {
    const translateResponse = await axios.post(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        q: text,
        target: targetLanguage,
        format: 'text'
      }
    );

    const translation = translateResponse.data.data.translations[0];
    const detectedLanguage = translation.detectedSourceLanguage || 'en';
    const translatedText = translation.translatedText;

    return { detectedLanguage, translatedText };
  } catch (error) {
    console.error('Error in language detection or translation:', error);
    return { detectedLanguage: 'unknown', translatedText: text };
  }
}





async function testGroqConnection(): Promise<{ status: string; error?: string }> {
  try {
    const testResponse = await callGroq(
      [{ role: 'user', content: 'Test connection' }],
      ASTRA_MODEL_SMART,
      false,
      new Date().toLocaleString(),
      'UTC'
    )
    if (typeof testResponse === 'string' && testResponse.length > 0) {
      return { status: 'connected' }
    }
    return { status: 'error', error: 'Invalid response format from Groq' }
  } catch (error: any) {
    return { status: 'error', error: error.message.substring(0, 500) }
  }
}

async function testFluxConnection(): Promise<{ status: string; error?: string }> {
  return { status: 'connected' }
}

async function testSupabaseConnection(): Promise<{ status: string; error?: string }> {
  try {
    const supabase = await createSupabaseClient()
    const {
      data: { session },
      error
    } = await supabase.auth.getSession()
    if (error) {
      return { status: 'error', error: error.message }
    }
    return { status: 'connected' }
  } catch (error: any) {
    return { status: 'error', error: error.message }
  }
}

function checkResponseDisagreement(response1: string, response2: string): boolean {
  // Enhanced disagreement detection for real debate
  const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').trim()
  
  const norm1 = normalize(response1)
  const norm2 = normalize(response2)
  
  // Check for obvious contradictions
  const contradictionPatterns = [
    ['yes', 'no'],
    ['true', 'false'],
    ['correct', 'incorrect'],
    ['right', 'wrong'],
    ['agree', 'disagree'],
    ['positive', 'negative'],
    ['increase', 'decrease'],
    ['more', 'less'],
    ['bigger', 'smaller'],
    ['higher', 'lower'],
    ['always', 'never'],
    ['certain', 'uncertain'],
    ['definitely', 'maybe']
  ]
  
  for (const [word1, word2] of contradictionPatterns) {
    if ((norm1.includes(word1) && norm2.includes(word2)) || 
        (norm1.includes(word2) && norm2.includes(word1))) {
      return true
    }
  }
  
  // Check for numerical differences (like 1+1=2 vs 1+1=3)
  const numbers1 = response1.match(/\d+/g) || []
  const numbers2 = response2.match(/\d+/g) || []
  
  if (numbers1.length > 0 && numbers2.length > 0) {
    const hasDifferentNumbers = numbers1.some(num1 => 
      numbers2.some(num2 => num1 !== num2)
    )
    if (hasDifferentNumbers) {
      return true
    }
  }
  
  // Check for different methodologies or approaches
  const approachWords = ['method', 'approach', 'way', 'because', 'reason', 'why', 'how']
  const hasDifferentApproaches = approachWords.some(word => 
    (norm1.includes(word) && !norm2.includes(word)) || 
    (!norm1.includes(word) && norm2.includes(word))
  )
  
  if (hasDifferentApproaches) {
    return true
  }
  
  // Check for significantly different content using word overlap
  const words1 = new Set(norm1.split(/\s+/))
  const words2 = new Set(norm2.split(/\s+/))
  
  const intersection = new Set(Array.from(words1).filter(word => words2.has(word)))
  const union = new Set([...Array.from(words1), ...Array.from(words2)])
  
  // If less than 40% word overlap, consider them different (increased threshold for more debate)
  const overlapRatio = intersection.size / union.size
  return overlapRatio < 0.4
}

function isCreativeWritingRequest(message: string): boolean {
  const text = message.toLowerCase()
  if (!text) return false
  return (
    /\b(write|create|compose|draft|invent|make up)\b/i.test(text) &&
    /\b(story|short story|poem|poetry|song|lyrics|script|screenplay|scene|chapter|novel|fanfic|fanfiction|roleplay|role-play)\b/i.test(
      text
    )
  )
}

async function generateVyraSmartDebate(
  userMessage: string,
  chat_history: any[],
  stream: boolean,
  current_time?: string,
  timezone?: string,
  searchEnabled: boolean = false,
  trait?: string
): Promise<string | ReadableStream> {
  try {
    const intent = determineIntent(userMessage, chat_history)

    if (intent.customResponse) {
      return intent.customResponse
    }

    const normalizedMessage = userMessage.toLowerCase().trim()
    const wantsCreativeWriting = isCreativeWritingRequest(normalizedMessage)
    const wantsTranscript =
      /\b(show|see|explain|display)\b.*\b(reasoning|debate|thinking|thought process|chain of thought)\b/i.test(
        normalizedMessage
      ) ||
      /\b(show me how|show me why|step by step|walk me through)\b/i.test(normalizedMessage)
    const wantsEssay =
      /\bessay\b/i.test(normalizedMessage) ||
      /\bpersonal statement\b/i.test(normalizedMessage) ||
      /\bcollege application\b/i.test(normalizedMessage)
    const isShortConversational =
      intent.isConversational &&
      !intent.needsVector &&
      normalizedMessage.length < 80

    if (wantsCreativeWriting && !wantsTranscript) {
      const creativePrompt = `Write the requested creative piece in the requested style and length.\n\nDo not turn the response into a feasibility lecture unless the user explicitly asks for an explanation.\n\nUser request: ${userMessage}\n\nPrevious Conversation:\n${chat_history
        .map(m => `${m.role}: ${m.content}`)
        .join('\n')}`

      return await callGroq(
        [{ role: 'user', content: creativePrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        false,
        trait
      )
    }

    if (isShortConversational) {
      const quickChatPrompt = `You are Vyra, a debate-style assistant, but the user is just making a short, casual or simple request.\n\nUser Message: ${userMessage}\n\nPrevious Conversation:\n${chat_history
        .map(m => `${m.role}: ${m.content}`)
        .join('\n')}\n\nRespond briefly and naturally in 1–3 short sentences. Do not start a full debate or over-explain; keep it light and fast while still being helpful.`

      return await callGroq(
        [{ role: 'user', content: quickChatPrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        true,
        trait
      )
    }

    const paradoxCheckPrompt = `You are a first-principles reasoning engine sitting in front of a debate system.

Your ONLY job is to inspect the user's request for logical incoherence, self-contradiction, or paradoxes BEFORE any debate happens.

User Request:
${userMessage}

Previous Conversation (for context only, do NOT debate it):
${chat_history.map(m => `${m.role}: ${m.content}`).join('\n')}

Instructions:
- First, decide if the user's request contains a logical contradiction, demands physically impossible outcomes (for example, backward time travel with current physics), or asks you to ignore reality. Do not treat "we do not yet have data about this" as a paradox; lack of data is not a logical contradiction.
- If the user casually says things like "use real-time data", "use live data", or "use up-to-date data" about topics like astronomy, physics, finance, or news, interpret that as "use the latest available measurements and observations" rather than literally streaming impossible real-time quantities. That is NOT a paradox by itself.
- If the user asks about specific calendar dates (for example, "on 17 July 2025 what was X?"), treat this as a factual question that may or may not have data available. Even if you suspect the date might be in the future, you must not flag it as a paradox; data availability is handled later by the main system.
- If the user asks for a recap or summary of the current year or a date range that includes the present year (for example, "a 2025 recap" while the year is still in progress), interpret this as a "so-far" recap up to the current date. That is not a paradox and does not require future knowledge.
- If the request is logically coherent and physically possible within current scientific understanding (including requests to use the latest available data or dated factual questions), reply with exactly:
OK_NO_PARADOX

- If there IS a genuine paradox, self-contradiction, or a physically impossible demand (for example, guaranteed predictions of random events, faster-than-light communication, backward time travel, or directly seeing inside a black-hole singularity), DO NOT try to satisfy it or soften the truth. Instead, respond using this exact structure:
1. Contradiction: [one concise sentence explaining what parts of the request conflict with logic or reality]
2. Why It Is Impossible Or A Paradox: [short explanation of why these requirements cannot all be true or satisfied at once, based on current science and logic]
3. Blunt Conclusion: [one or two sentences stating the hard truth as directly as possible, for example "With current physics, backward time travel is impossible."]
4. Clarification Needed: [one or two very specific questions the user must answer to remove the paradox or reframe the request in a realistic way]

Do NOT include any debate, pros/cons, or implementation ideas. You are only a filter deciding if the request is logically and physically valid, and you must always favor blunt, factual honesty over optimism.`

    const paradoxResult = await callGroq(
      [{ role: 'user', content: paradoxCheckPrompt }],
      VYRA_MODEL_MOONSHOT,
      stream,
      current_time,
      timezone,
      undefined,
      true,
      trait
    )

    if (typeof paradoxResult === 'string') {
      const trimmed = paradoxResult.trim()
      if (!trimmed.startsWith('OK_NO_PARADOX')) {
        return paradoxResult
      }
    } else {
      return paradoxResult
    }

    const knowledgeContext = await gatherKnowledge(userMessage, {
      shouldSearch: intent.needsVector,
      confidence: intent.confidence,
      reason: intent.reason,
      forceSearch: searchEnabled,
    })
    
    // Create debate context
    const debateContext = `${userMessage}\n\nPrevious Conversation:\n${chat_history.map(m => `${m.role}: ${m.content}`).join('\n')}`
    
    // Both models independently analyze the prompt and provide their own results
    const moonshotAnalysisPrompt = `You are Kairo, a bold debater in the Vyra system. Analyze this question from your perspective and provide your independent assessment.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning. Always favor the blunt truth over comforting answers. If the user asks for something that is impossible with current science or technology (for example, backward time travel, breaking the laws of physics, or guaranteed predictions of random events), say clearly that it is impossible right now and explain why. You may use casual language, including swear words, but only if the user has already used similar language in this conversation. Do not introduce profanity first.`
    
    const qwenAnalysisPrompt = `You are Logos, a careful and skeptical debater in the Vyra system. Analyze this question from your perspective and provide your independent assessment.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning. Always favor the blunt truth over comforting answers. If the user asks for something that is impossible with current science or technology (for example, backward time travel, breaking the laws of physics, or guaranteed predictions of random events), say clearly that it is impossible right now and explain why. You may use casual language, including swear words, but only if the user has already used similar language in this conversation. Do not introduce profanity first.`
    
    // Get independent responses from both models
    const moonshotResponse = await callGroq(
      [{ role: 'user', content: moonshotAnalysisPrompt }],
      VYRA_MODEL_MOONSHOT,
      false,
      current_time,
      timezone,
      undefined,
      true,
      trait
    )
    const qwenResponse = await callGroq(
      [{ role: 'user', content: qwenAnalysisPrompt }],
      VYRA_MODEL_QWEN,
      false,
      current_time,
      timezone,
      undefined,
      true,
      trait
    )
    
    // Ensure responses are strings for comparison
    const moonshotText = typeof moonshotResponse === 'string' ? moonshotResponse : ''
    const qwenText = typeof qwenResponse === 'string' ? qwenResponse : ''
    
    if (isBackendFailureMessage(moonshotText) || isBackendFailureMessage(qwenText)) {
      const fallbackPrompt = `${userMessage}\n\nPrevious Conversation:\n${chat_history
        .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
        .join('\n')}`
      return await callGroq(
        [{ role: 'user', content: fallbackPrompt }],
        ASTRA_MODEL_FAST,
        stream,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        false,
        trait
      )
    }
    
    // Check if responses are significantly different (indicating disagreement)
    const responsesAreDifferent = checkResponseDisagreement(moonshotText, qwenText)
    
    if (responsesAreDifferent) {
      // They disagree - initiate authentic debate
      const moonshotDebatePrompt = `Kairo, you've analyzed this question and have your perspective. Now you see that Logos has a different analysis. Engage in a direct debate about this disagreement.

User Question: ${userMessage}

Your Analysis (Kairo): ${moonshotText}

Logos's Analysis: ${qwenText}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Challenge Logos's reasoning directly. Point out flaws in their logic, defend your position, and explain why your analysis is more accurate. Don't be diplomatic - be direct and assertive in your disagreement.`
      
      const moonshotDebateResponse = await callGroq(
        [{ role: 'user', content: moonshotDebatePrompt }],
        VYRA_MODEL_MOONSHOT,
        false,
        current_time,
        timezone,
        undefined,
        true,
        trait
      )
      
      // Logos responds to Kairo's challenge
      const qwenDebatePrompt = `Logos, you've provided your analysis, but Kairo has challenged your reasoning and defended their position. Respond directly to this challenge.

User Question: ${userMessage}

Your Original Analysis (Logos): ${qwenText}

Kairo's Original Analysis: ${moonshotText}

Kairo's Challenge: ${moonshotDebateResponse}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Defend your analysis against Kairo's challenge. Point out any flaws in their reasoning, explain why your approach is correct, and directly counter their arguments. Don't back down - be assertive and thorough in your defense.`
      
      const qwenDebateResponse = await callGroq(
        [{ role: 'user', content: qwenDebatePrompt }],
        VYRA_MODEL_QWEN,
        false,
        current_time,
        timezone,
        undefined,
        true,
        trait
      )
      
      // Final round - Kairo gets the last word in the debate
      const finalDebatePrompt = `Kairo, you've responded to the challenge. This is your final opportunity in this debate.

User Question: ${userMessage}

Your Original Analysis (Kairo): ${moonshotResponse}

Logos's Original Analysis: ${qwenResponse}

Your Challenge to Logos: ${moonshotDebateResponse}

Logos's Defense: ${qwenDebateResponse}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Address Logos's defense directly. Point out any remaining weaknesses in their argument, reinforce your position, and make your final case for why your analysis is superior. This is your closing argument in this debate.`
      
      const finalDebateResponse = await callGroq(
        [{ role: 'user', content: finalDebatePrompt }],
        VYRA_MODEL_MOONSHOT,
        false,
        current_time,
        timezone,
        undefined,
        true,
        trait
      )
      
      const synthesisInstruction = wantsEssay
        ? 'Based on this debate, write a single, fully polished essay-style answer for the user. The essay should be well-structured, coherent, and suitable for a serious reader. Silently cross-check all factual claims against the Knowledge Background and the strongest points from both Kairo and Logos, and remove or soften anything that is not well-supported. Do not describe this checking step; only present the final, fact-checked essay.'
        : 'Based on this debate, provide the user with the most accurate and direct answer you can. Silently cross-check all factual claims against the Knowledge Background and the strongest points from both Kairo and Logos, and remove or soften anything that is not well-supported. Do not describe this checking step; only present the final, fact-checked answer.'
      
      const visibilityInstruction = wantsTranscript
        ? 'First, speak only as Zevy AI and give the final answer. After that, in a clearly separated section titled "Debate Transcript (Kairo vs Logos)", briefly summarize (in a few short paragraphs) how Kairo and Logos disagreed, what evidence they leaned on, and how that led to the final answer.'
        : 'Do not mention Kairo, Logos, debates, transcripts, internal thinking, or internal disagreement. Do not describe your reasoning steps or thought process. Only speak as a single assistant called Zevy AI giving the final answer.'
      
      const finalSynthesisPrompt = `You need to provide the final answer to the user after witnessing a genuine debate between two AI models. Here's what transpired:

User Question: ${userMessage}

${knowledgeContext ? `Knowledge Background:\n${knowledgeContext}` : ''}

The Debate:
Kairo Position: ${moonshotText}
Logos Position: ${qwenText}

Kairo's Challenge: ${moonshotDebateResponse}
Logos's Defense: ${qwenDebateResponse}
Kairo's Final Argument: ${finalDebateResponse}

${synthesisInstruction}

For your output, respond as a single, polished answer for the user. Integrate any useful points from the Kairo and Logos debate into one continuous response. ${visibilityInstruction} Do not include explicit section labels like "Final Answer", "Reasoning", or "Follow-up Question" unless the user specifically requests that structure.`
      
      const finalResponse = await callGroq(
        [{ role: 'user', content: finalSynthesisPrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time,
        timezone,
        undefined,
        true,
        trait
      )
      return finalResponse
      
    } else {
      const synthesisInstruction = wantsEssay
        ? 'Write a single, fully polished essay-style answer for the user. The essay should be well-structured, coherent, and suitable for a serious reader. Silently cross-check all factual claims against the Knowledge Background and the strongest shared points from both Kairo and Logos, and remove or soften anything that is not well-supported. Do not describe this checking step; only present the final, fact-checked essay.'
        : 'Provide the user with the most accurate and direct answer you can. Silently cross-check all factual claims against the Knowledge Background and the strongest shared points from both Kairo and Logos, and remove or soften anything that is not well-supported. Do not describe this checking step; only present the final, fact-checked answer.'
      
      const visibilityInstruction = wantsTranscript
        ? 'First, speak only as Zevy AI and give the final answer. After that, in a clearly separated section titled "Debate Transcript (Kairo vs Logos)", briefly summarize (in a few short paragraphs) how Kairo and Logos converged on the same conclusion and what evidence supported that consensus.'
        : 'Do not mention Kairo, Logos, debates, transcripts, internal thinking, or internal disagreement. Do not describe your reasoning steps or thought process. Only speak as a single assistant called Zevy AI giving the final answer.'
      
      const agreementAnalysisPrompt = `Both Kairo and Logos independently reached similar conclusions. Here's the consensus view:

User Question: ${userMessage}

${knowledgeContext ? `Knowledge Background:\n${knowledgeContext}` : ''}

Kairo's Analysis: ${moonshotText}

Logos's Analysis: ${qwenText}

Since both debaters independently reached the same conclusion, ${synthesisInstruction} ${visibilityInstruction} Do not include explicit section labels like "Final Answer", "Reasoning", or "Follow-up Question" unless the user specifically asks for them.`
      
      const finalResponse = await callGroq(
        [{ role: 'user', content: agreementAnalysisPrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        true,
        trait
      )
      return finalResponse
    }
    
  } catch (error) {
    console.error('Error in Vyra debate system:', error)
    // Fallback to simple Astra response if debate fails - use Astra Fast for speed
    const fallbackPrompt = `${userMessage}\n\nPrevious Conversation:\n${chat_history.map(m => `${m.role}: ${m.content}`).join('\n')}`
    return await callGroq(
      [{ role: 'user', content: fallbackPrompt }],
      ASTRA_MODEL_FAST,
      stream,
      current_time || new Date().toLocaleString(),
      timezone || 'UTC',
      undefined,
      false,
      trait
    )
  }
}

async function generateSummary(prompt: string): Promise<string> {
  const groq = new Groq({ apiKey: getGroqApiKey() });
  try {
    const response = await groq.chat.completions.create({
      model: ASTRA_MODEL_SMART,
      messages: [{ role: 'user', content: `Summarize this conversation context:\n${prompt}` }],
      temperature: 0.3,
      max_tokens: 200
    })
    return response.choices[0]?.message?.content || 'Summary unavailable'
  } catch (error) {
    console.error('Error generating summary:', error)
    return 'Summary unavailable due to a temporary issue.'
  }
}

async function isSafe(prompt: string): Promise<NextResponse | null> {
  const groq = new Groq({ apiKey: getGroqApiKey() });

  const moderationPrompt = `[INST] Task: Check if there is clearly unsafe content in 'User' messages in conversations.

Only mark as "unsafe" if the user is:
- Asking for instructions to commit crimes, cyber attacks, or physical harm
- Asking for instructions or encouragement for self-harm or suicide
- Requesting highly sensitive private information (passwords, SSNs, bank logins)
- Requesting explicit sexual content, especially involving minors
- Using hate speech that targets protected groups with dehumanizing or violent language

Do NOT mark as unsafe just because the topic involves:
- Elections, presidents, governments, political parties, or public policy
- Neutral analysis of regulations, public opinion, news, or engineering trade-offs

Categories of unsafe content remain: "illegal content," "hate speech," "malicious code," "private information," "self-harm," and "sexual content."
Provide a single-word response: "safe" or "unsafe."

<BEGIN CONVERSATION>

User: ${prompt}

<END CONVERSATION>

  [/INST]`;

  try {
    const response = await groq.chat.completions.create({
      model: GUARD_MODEL,
      messages: [{ role: 'user', content: moderationPrompt }],
      temperature: 0.0,
    });

    const result = response.choices[0]?.message?.content?.toLowerCase().trim() || '';

    const allowlistPatterns = [
      /\b(space|nasa|spacex|astronomy|planet|star|galaxy|universe)\b/i,
      /\b(science|scientific|physics|chemistry|biology|math|mathematics|engineering)\b/i,
      /\b(policy|policies|regulation|economy|economic|market|finance|climate|environmental)\b/i,
      /\b(debate|argument|ethics|philosophy|pros and cons|tradeoff|trade-offs)\b/i,
      // Explicitly allow neutral political and civic questions
      /\b(president|prime minister|chancellor|governor|mayor|senator|congress|parliament|election|vote|voting|politics?)\b/i
    ]

    // Strong patterns that should always be treated as unsafe regardless of allowlist
    const selfHarmPattern = /\b(kill myself|kill yourself|commit suicide|end my life|end your life|self[-\s]?harm|hurt myself on purpose|overdose on|how do i die)\b/i
    const seriousCrimePattern = /\b(how to (make|build) a bomb|how to (hack|ddos)|buy (illegal|fake) (id|passport)|hide a body)\b/i

    const isAllowlisted = allowlistPatterns.some((pattern) => pattern.test(prompt))
    const forceUnsafe = selfHarmPattern.test(prompt) || seriousCrimePattern.test(prompt)

    if ((result === 'unsafe' && !isAllowlisted) || forceUnsafe) {
      let reason = 'The prompt contains unsafe content.';

      if (/illegal/i.test(prompt)) {
        reason = `I cannot give information about ${prompt}`;
      } else if (/private|code/i.test(prompt)) {
        reason = 'I can\'t give that information because it is private.';
      }

      return new NextResponse(JSON.stringify({ response: reason }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return null;
  } catch (error) {
    console.error('Error in content moderation:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  let supabase: any = null
  let session: any = null

  try {
    supabase = await createSupabaseClient()
    const { data } = await supabase.auth.getSession()
    session = data?.session
  } catch (error: any) {
    console.error('Chat POST Supabase session error:', error)
  }
  const body = await req.json()
  let { chat_id } = body

  const {
    message,
    chat_history = [],
    trait,
    model = 'astra',
    stream = false,
    current_time,
    timezone,
    searchEnabled: rawSearchEnabled,
    webSearch,
    documents = [],
  } = body

  const serverNow = new Date()
  const effectiveCurrentTime = current_time || serverNow.toISOString()
  const effectiveTimezone =
    timezone || (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'

  const searchEnabled = typeof rawSearchEnabled === 'boolean' ? rawSearchEnabled : Boolean(webSearch)

  // Content moderation check
  const moderationResponse = await isSafe(message);
  if (moderationResponse) {
    return moderationResponse;
  }

  // Allow guest users to use the AI without signing in
  let userId = 'guest';
  let modelType: 'vyra' | 'astra' = 'astra'; // Default to Astra for guests
  
  if (session) {
    userId = session.user.id;
    const modelLowerForType = model.toLowerCase()
    modelType = modelLowerForType === 'vyra' ? 'vyra' : 'astra';
  }

  const isOwnerUser = await isOwner(session)
  const baseTrait = typeof trait === 'string' ? trait.trim() : ''
  const ownerTraitInstruction =
    'Owner mode: This is one of your owners. Treat them as your primary user: be loyal, friendly, respectful, and act as a personal assistant and friend while staying honest and safe.'
  const promptTrait = isOwnerUser
    ? baseTrait
      ? `${baseTrait} ${ownerTraitInstruction}`
      : ownerTraitInstruction
    : baseTrait

  if (isOwnerUser) {
    const ownerResponse = await handleOwnerRequest(
      message,
      chat_history,
      stream,
      effectiveCurrentTime,
      effectiveTimezone,
      promptTrait
    )
    if (ownerResponse) {
      return ownerResponse
    }
  }

  if (session && !isOwnerUser) {
    const usageData = await getUserUsage(userId, modelType)
    
    if (usageData.remaining <= 0) {
      const limit = modelType === 'vyra' ? 25 : 125
      return NextResponse.json({
        response: `You've reached your daily limit of ${limit} uses for ${modelType}. Please try again in 24 hours.`
      })
    }
  }

  // Detect and translate the user's message first
  const { detectedLanguage, translatedText } = await detectAndTranslate(message)
  const userMessage = translatedText

  const intent = determineIntent(userMessage, chat_history)

  let documentsContext = ''
  if (Array.isArray(documents) && documents.length > 0) {
    const parts: string[] = []
    for (const doc of documents) {
      const name = typeof doc?.name === 'string' ? doc.name : 'Document'
      const type = typeof doc?.type === 'string' ? doc.type : 'unknown'
      const content = typeof doc?.content === 'string' ? doc.content : ''
      if (!content.trim()) continue
      const truncated = content.length > 4000 ? `${content.slice(0, 4000)}\n[...]` : content
      parts.push(`Document: ${name} (type: ${type})\n${truncated}`)
    }
    if (parts.length > 0) {
      documentsContext = parts.join('\n\n')
    }
  }

  const modelLower = model.toLowerCase()
  const isVyraMode = modelLower === 'vyra'
  const isCompoundMode = modelLower === 'compound'

  const selectedModel = isVyraMode
    ? 'vyra-debate'
    : selectAstraModel(userMessage, chat_history).model

  const autoSearchNeeded = intent.needsVector
  const effectiveSearchEnabled = searchEnabled || isCompoundMode || autoSearchNeeded

  // Step 1: Check if the prompt is safe using our guard function with the current model context.
  const safe = await isPromptSafe(message, selectedModel)

  // Step 2: If the prompt is unsafe, return a generated harmful response using the AI model.
  if (!safe) {
    const harmfulResponsePrompt = `Generate a polite but firm response explaining that you cannot help with harmful or inappropriate requests. Be conversational and friendly while setting clear boundaries. Keep it under 100 words.`
    
    try {
      const harmfulResponse = await callGroq(
        [{ role: 'user', content: harmfulResponsePrompt }],
        selectedModel,
        false,
        effectiveCurrentTime,
        effectiveTimezone,
        undefined,
        false,
        promptTrait
      )
      const finalResponse = typeof harmfulResponse === 'string' ? harmfulResponse : "I'm sorry, but I cannot assist with that topic. Please ask about something else."
      
      // For streaming, we need to format it as a Server-Sent Event
      if (stream) {
        const streamResponse = new ReadableStream({
          start(controller) {
            controller.enqueue(`data: ${JSON.stringify({ response: finalResponse })}\n\n`);
            controller.close();
          },
        });
        return new NextResponse(streamResponse, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
        })
      }
      return NextResponse.json({ response: finalResponse })
    } catch (error) {
      console.error('Error generating harmful response:', error)
      const fallbackResponse = "I'm sorry, but I cannot assist with that topic. Please ask about something else."
      return NextResponse.json({ response: fallbackResponse })
    }
  }

  let aiResponse: string | ReadableStream
  let aiSources: { title: string; url: string }[] | undefined

  const calculatorAssist = await getCalculatorAssist(userMessage)
  const calculatorContext = calculatorAssist?.mode === 'context' ? calculatorAssist.context : null

  if (calculatorAssist?.mode === 'direct') {
    const directResponse = `${calculatorAssist.expression} = ${calculatorAssist.result}`
    if (stream) {
      aiResponse = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ response: directResponse })}\n\n`)
          controller.close()
        },
      })
    } else {
      aiResponse = directResponse
    }
  } else if (selectedModel === 'vyra-debate') {
    // Vyra debate system using both Moonshot and Qwen models
    const debateResponse = await generateVyraSmartDebate(
      calculatorContext ? `${userMessage}\n\n${calculatorContext}` : userMessage,
      chat_history,
      stream,
      effectiveCurrentTime,
      effectiveTimezone,
      effectiveSearchEnabled,
      promptTrait
    )
    aiResponse = debateResponse
  } else {
    if (intent.customResponse) {
      return NextResponse.json({ response: intent.customResponse });
    }

    if (effectiveSearchEnabled) {
      const knowledgeIntent = {
        shouldSearch: intent.needsVector || effectiveSearchEnabled,
        confidence: intent.confidence,
        reason: intent.reason,
        forceSearch: effectiveSearchEnabled,
      }
      const knowledgeContext = await gatherKnowledge(userMessage, knowledgeIntent)
      const sourceMatches = Array.from(
        knowledgeContext.matchAll(/(?:Source:\s*)?(https?:\/\/\S+)/gi)
      )
      if (sourceMatches.length > 0) {
        const seen = new Set<string>()
        const urls = sourceMatches
          .map(match => match[1])
          .filter(url => {
            if (!url) return false
            if (seen.has(url)) return false
            seen.add(url)
            return true
          })
        if (urls.length > 0) {
          aiSources = urls.map(url => ({
            title: 'Source',
            url
          }))
        }
      }
      const researchModel = selectedModel.includes('vyra') ? VYRA_MODEL_MOONSHOT : ASTRA_MODEL_SMART
      const contextualizedMessage = `${userMessage}\n\n${calculatorContext ? `${calculatorContext}\n\n` : ''}${
        documentsContext ? `Document Context:\n${documentsContext}\n\n` : ''
      }Knowledge Context:\n${knowledgeContext}\n\nPrevious Conversation:\n${chat_history
        .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
        .join('\n')}`
      aiResponse = await callGroq(
        [{ role: 'user', content: contextualizedMessage }],
        researchModel,
        stream,
        effectiveCurrentTime,
        effectiveTimezone,
        undefined,
        true,
        promptTrait
      )
    } else {
      const lastUserMessage =
        chat_history.filter((m: { role: string }) => m.role === 'user').slice(-1)[0]?.content || ''

      const formattedHistory = chat_history.map(
        (msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.content,
          ...(msg.role === 'assistant' ? { isResponse: true } : {}),
        })
      )

      let contextualUserMessage = userMessage
      if (chat_history.length > 0) {
        contextualUserMessage =
          chat_history
            .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
            .join('\n') + `\n\nuser: ${userMessage}`
      }

      const contextBuilder = []
      if (lastUserMessage && !contextualUserMessage.includes(lastUserMessage)) {
        contextBuilder.push(`Previous topic: ${lastUserMessage}`)
      }

      const fullContext =
        contextBuilder.length > 0 ? `${contextualUserMessage}\n\n${contextBuilder.join('\n')}` : contextualUserMessage

      const fullContextWithDocuments = documentsContext
        ? `${fullContext}\n\nDocument Context:\n${documentsContext}`
        : fullContext

      const fullContextWithCalculator =
        calculatorContext ? `${fullContextWithDocuments}\n\n${calculatorContext}` : fullContextWithDocuments

      aiResponse = await callGroq(
        [
          ...formattedHistory,
          {
            role: 'user',
            content: fullContextWithCalculator,
          },
        ],
        selectedModel,
        stream,
        effectiveCurrentTime,
        effectiveTimezone,
        fullContextWithCalculator,
        false,
        promptTrait
      )
    }
  }

  if (!stream && typeof aiResponse === 'string' && session && !isOwnerUser) {
    await incrementUserUsage(userId, modelType)
  }

  if (!stream && typeof aiResponse === 'string' && chat_id && session?.user?.email) {
    try {
      const userEmail = session.user.email as string
      const messagesToSave = [
        ...chat_history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiResponse }
      ]
      const traitValue = typeof trait === 'string' && trait.trim().length > 0 ? trait : null
      const nowIso = new Date().toISOString()

      const { error: upsertError } = await (supabase as any)
        .from('conversations')
        .upsert(
          {
            id: chat_id,
            user_email: userEmail,
            trait: traitValue,
            messages: messagesToSave,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        )

      if (upsertError) {
        console.error('Failed to save conversation history:', upsertError.message)
      }
    } catch (error: any) {
      console.error('Error while saving conversation history:', error.message || error)
    }
  }

  if (stream) {
    return new NextResponse(aiResponse as ReadableStream, {
      headers: { 'Content-Type': 'text/event-stream' }
    })
  }

  // Translate back to the original language if needed
  if (detectedLanguage !== 'en' && typeof aiResponse === 'string') {
    const { translatedText: translatedResponse } = await detectAndTranslate(aiResponse, detectedLanguage)
    return NextResponse.json({ response: translatedResponse, sources: aiSources })
  }

  return NextResponse.json({ response: aiResponse, sources: aiSources })
}

async function isOwner(session: any): Promise<boolean> {
  const email = session?.user?.email as string | undefined
  return !!email && OWNER_EMAILS.includes(email)
}

async function handleOwnerRequest(message: string, chat_history: any[], stream: boolean, current_time?: string, timezone?: string, trait?: string): Promise<NextResponse | null> {
  const lowerCaseMessage = message.toLowerCase();

  if (lowerCaseMessage.startsWith('summarize:')) {
    const url = message.substring(10).trim();
    try {
      const response = await axios.get(url);
      const text = response.data; // Basic text extraction
      const summary = await callGroq(
        [{ role: 'user', content: `Summarize this: ${text}` }],
        ASTRA_MODEL_FAST,
        false,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        false,
        trait
      );
      return NextResponse.json({ response: summary });
    } catch (error) {
      return NextResponse.json({ response: 'Error summarizing the URL.' }, { status: 500 });
    }
  }

  if (lowerCaseMessage.startsWith('news:')) {
    const query = message.substring(5).trim();
    const articles = await searchNews(query);
    return NextResponse.json({ response: articles });
  }

  const isExplicitImageRequest = IMAGE_PATTERNS.some(pattern => pattern.test(message));
  if (isExplicitImageRequest) {
    return NextResponse.json({ response: 'Image generation is not available, may be coming in future updates' });
  }

  return null;
}
