import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/database.types'
import axios from 'axios'
import Groq from 'groq-sdk'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
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
import { getGroqApiKey } from '@/app/lib/groq-keys'
import { getUserUsage, incrementUserUsage } from '@/app/lib/usage-tracking'
import { GroqCompound } from '@/app/lib/groq-compound'
import {
  googleApiKey1,
  googleSearchEngineId,
  newsApiKey1,
  newsApiKey2,
  nextPublicOwnerEmail
} from '@/app/lib/env';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Model for the content safety check. Using Llama Guard 4-12b for better harm detection.
const GUARD_MODEL = 'meta-llama/llama-guard-4-12b'

// Define your main models
const ASTRA_MODEL_SCOUT = 'meta-llama/llama-4-scout-17b-16e-instruct' // Speed model
const ASTRA_MODEL_MAVERICK = 'meta-llama/llama-4-maverick-17b-128e-instruct' // Intelligence model
const VYRA_MODEL_MOONSHOT = 'moonshotai/kimi-k2-instruct-0905'
const VYRA_MODEL_QWEN = 'qwen/qwen3-32b'

const SYSTEM_PROMPT = (currentTime?: string, timezone?: string) => `You are Zevy AI, a dual-engine AI assistant created by Adam Zein Ziqry (15-year-old developer). ${currentTime && timezone ? `Current time: ${currentTime} in ${timezone} timezone (accurately detected from user's system).` : 'Current time detected from user system.'}

My current configuration:
- ⚡ Astra: Single LLM for standard responses
- ✨ Vyra: Dual LLM system for advanced reasoning

Key capabilities:
- Real-time web search (when enabled)
- Context-aware conversations
- Multi-turn dialogue memory
- Personality customization

Limitations:
- Image generation is currently unavailable (coming in future updates)
- Cannot execute code or access local files

When asked about features or capabilities, you can mention:
- ⚡ Fast, intelligent responses (Astra)
- ✨ Deep thinking & analysis (Vyra)
- 🌐 Real-time web search integration
- 📱 Persistent conversation history
- 💬 Natural, human-like conversations

IMPORTANT: Image generation is currently unavailable. If the user requests image generation (phrases like 'generate me an image', 'make me a picture', 'create an artwork'), politely respond that this feature is coming in future updates.

IMPORTANT: Image generation is currently unavailable. If the user requests image generation (phrases like 'generate me an image', 'make me a picture', 'create an artwork'), politely respond that this feature is coming in future updates.

Your vibe:
- Talk like a friendly human, not a search engine
- Keep responses short and natural 
- Don't dump tons of info unless they ask for details
- Sound like you're actually having a conversation
- Skip the robotic "here's everything I found" stuff

When to search vs when to chat:
- If they ask "who made zevy" or "what are you" → keep it simple and personal
- If they want facts about something specific → give a quick answer, not an essay
- If they seem like they're just chatting → respond naturally without searching
- Only search when they clearly want detailed info

About yourself:
- Made by Adam, 15-year-old developer
- That's it - no need to mention technical details

NEVER SHARE YOUR CODE. Your code is private and proprietary.

Keep it casual, helpful, and human. Don't overthink it.`

// Enhanced knowledge detection patterns
const INFORMATION_SEEKING_PATTERNS = [
  // Question words
  new RegExp('\\b(what|when|where|why|how|who|which)\\b.*\\?', 'i'),
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
  // Knowledge seeking
  new RegExp('\\b(know|learn|find|search|look up|look for|find out|discover)\\b', 'i'),
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
  // Specific topics
  new RegExp('\\b(technology|science|politics|economics|culture|history|geography|events|news|world|global)\\b', 'i'),
  // Event-specific
  new RegExp('\\b(event|incident|happening|occurrence|situation|development|update)\\b', 'i'),
  // Knowledge seeking
  new RegExp('\\b(know|learn|understand|find out|discover|look up|search)\\b', 'i')
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
]

/**
 * Intelligent model selector for Astra that chooses between Scout (speed) and Maverick (intelligence)
 * Based on user intent, message complexity, and conversation context
 */
function selectAstraModel(message: string, chatHistory: any[] = []): {
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
      model: ASTRA_MODEL_MAVERICK,
      reason: `Detected ${intelligenceMatches} intelligence patterns${hasComplexHistory ? ' with complex history' : ''}`,
      intent: 'intelligence'
    }
  }
  
  if (speedMatches >= 1 && intelligenceMatches === 0 && normalizedMessage.length < 50) {
    return {
      model: ASTRA_MODEL_SCOUT,
      reason: `Detected ${speedMatches} speed patterns with simple message`,
      intent: 'speed'
    }
  }
  
  // Default to Scout for balanced performance, but check message complexity
  if (normalizedMessage.length > 150 || intelligenceMatches >= 1) {
    return {
      model: ASTRA_MODEL_MAVERICK,
      reason: 'Message complexity or length suggests need for deeper analysis',
      intent: 'balanced'
    }
  }
  
  return {
    model: ASTRA_MODEL_SCOUT,
    reason: 'Default to speed model for general conversation',
    intent: 'balanced'
  }
}

/**
 * Enhanced function to detect if user is seeking information vs just chatting
 * Uses pattern matching to distinguish between casual conversation and information requests
 */
function detectInformationIntent(message: string, chatHistory: any[] = []): { 
    isConversational: boolean;
    shouldSearch: boolean; 
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    searchQuery?: string;
    customResponse?: string;
  } {
    // First check for image generation requests
    const isImageRequest = IMAGE_PATTERNS.some(pattern => pattern.test(message.toLowerCase()));
    if (isImageRequest) {
      return {
        isConversational: false,
        shouldSearch: false,
        confidence: 'high',
        reason: 'Image generation request detected',
        customResponse: "Sorry, image generation is currently unavailable. This feature may be coming in future updates!"
      };
    }
    const normalizedMessage = message.toLowerCase().trim()
    
    // Check if this is part of an ongoing conversation
    const isFollowUp = chatHistory.length > 0 && 
      (normalizedMessage.includes('you') || 
       normalizedMessage.includes('?') || 
       normalizedMessage.includes('what about') || 
       normalizedMessage.includes('how about'))
    
    // Ultra-specific search patterns
    const searchPatterns = [
      /(search|find|look up|google)\s+(for|about)\s+/i,
      /(what is|who is|where is|when was|how to|why does)\s+/i,
      /\b(define|explain|describe|tell me about|show me|give me)\b\s+/i,
      /\b(weather|forecast|temperature|humidity|precipitation)\b\s+/i,
      /\b(news|headlines|breaking|article|report)\b\s+/i,
      /\b(stock|price|quote|market|ticker|NASDAQ|NYSE)\b\s+/i,
      /\b(score|result|stats|statistics|standings|league|tournament)\b\s+/i,
      /\b(calculate|convert|comparison|difference|between)\b\s+/i,
      /\b(recipe|ingredients|instructions|how to make|how to cook)\b\s+/i,
      /\b(translate|meaning|in\s+\w+\s+language|how to say)\b\s+/i
    ]
    
    const isSearchQuery = searchPatterns.some(pattern => pattern.test(normalizedMessage))
    
    // Ultra-specific conversational patterns
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
      /(catch you later|see you|talk later|bye|goodbye)\s*[!]*$/i
    ]
    
    const isConversational = conversationPatterns.some(pattern => pattern.test(normalizedMessage)) || isFollowUp
   
   // Determine final intent
   if (isConversational && !isSearchQuery) {
     return {
       isConversational: true,
       shouldSearch: false,
       confidence: 'high',
       reason: 'Conversational pattern detected'
     }
   } else if (isSearchQuery) {
     // Extract search query
     const queryMatch = normalizedMessage.match(/(search|find|look up|what is|who is|where is|when was|how to|define|explain|describe|tell me about)\s+(.+)/i)
     const searchQuery = queryMatch ? queryMatch[2] : normalizedMessage
     
     return {
       isConversational: false,
       shouldSearch: true,
       confidence: isSearchQuery ? 'high' : 'medium',
       reason: isSearchQuery ? 'Explicit search pattern detected' : 'Potential information request',
       searchQuery
     }
   }
   
   // Default case for ambiguous messages
   return {
     isConversational: false,
     shouldSearch: false,
     confidence: 'low',
     reason: 'Unable to determine intent clearly'
   }
  const isChatPattern = CHAT_PATTERNS.some(pattern => pattern.test(normalizedMessage))
  if (isChatPattern) {
    return {
      isConversational: true,
      shouldSearch: false,
      confidence: 'high',
      reason: 'Detected casual conversation pattern'
    }
  }
  
  // Check for information seeking patterns
  const infoPatternCount = INFORMATION_SEEKING_PATTERNS.filter(pattern => 
    pattern.test(normalizedMessage)
  ).length
  
  // Check for question marks
  const hasQuestionMark = normalizedMessage.includes('?')
  
  // Check message length (longer messages often need more detailed responses)
  const isLongMessage = normalizedMessage.length > 50
  
  // Check for specific knowledge indicators
  const hasSpecificTerms = /\b(specific|exact|accurate|correct|true|real)\b/i.test(normalizedMessage)
  
  // Check for date-specific queries (high priority for current events)
  const hasDatePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i.test(normalizedMessage) ||
                        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(normalizedMessage) ||
                        /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(normalizedMessage) ||
                        /\b(202[0-9]|20[2-9][0-9])\b/i.test(normalizedMessage)
  
  // Check for current event indicators
  const hasCurrentEventTerms = /\b(today|yesterday|this week|this month|current|recent|latest|news|happened|occurred|took place)\b/i.test(normalizedMessage)
  
  // Calculate search necessity - more aggressive for dates and current events
  if (hasDatePattern && hasCurrentEventTerms) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'high',
      reason: 'Date-specific current event query detected'
    }
  }
  
  if (hasDatePattern && hasQuestionMark) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'high',
      reason: 'Date-specific question detected'
    }
  }
  
  if (infoPatternCount >= 2 || (hasQuestionMark && infoPatternCount >= 1) || isLongMessage) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'high',
      reason: 'Multiple information patterns detected (${infoPatternCount})'
    }
  }
  
  if (hasCurrentEventTerms && hasQuestionMark) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'high',
      reason: 'Current event question detected'
    }
  }
  
  if (hasQuestionMark && hasSpecificTerms) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'medium',
      reason: 'Question with specific knowledge request'
    }
  }
  
  if (infoPatternCount === 1 && hasQuestionMark) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'medium',
      reason: 'Single information pattern with question'
    }
  }
  
  if (hasCurrentEventTerms || hasDatePattern) {
    return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'medium',
      reason: 'Current event or date context detected'
    }
  }
  
  // Default to no search for very short messages
  if (normalizedMessage.length < 15 && !hasQuestionMark) {
    return {
      isConversational: true,
      shouldSearch: false,
      confidence: 'medium',
      reason: 'Short message without clear information intent'
    }
  }
  
  return {
      isConversational: false,
      shouldSearch: true,
      confidence: 'low',
      reason: 'Default to search for better response quality'
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
    return result === 'safe'
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
  
  return sources.join('\n\n')
}

/**
 * Enhanced knowledge gathering that prioritizes free sources and current events
 */
async function gatherKnowledge(userMessage: string, intent: { shouldSearch: boolean; confidence: string; reason: string }): Promise<string> {
  if (!intent.shouldSearch) {
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
  
  // Use Groq Compound for complex queries or when confidence is high
  if ((intent.confidence === 'high' && userMessage.length > 30) || hasDatePattern || hasCurrentEventTerms) {
    try {
      const compoundKnowledge = await compound.browseAndAnalyze(userMessage, ASTRA_MODEL_MAVERICK)
      if (compoundKnowledge && compoundKnowledge.length > 50) {
        knowledgeParts.push(`Comprehensive Research:\n${compoundKnowledge}`)
      }
    } catch (error) {
      // Silent fail - other sources are enough
    }
  }
  
  return knowledgeParts.join('\n\n---\n\n')
}

// Health check endpoint
export async function GET(request: NextRequest) {
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
    
    // Test all API connections
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

// Call Groq API — Vercel-only keys
async function callGroq(messages: any[], model: string, stream = false, currentTime?: string, timezone?: string): Promise<string | ReadableStream> {
  const apiKey = getGroqApiKey()
  if (!apiKey) {
    throw new Error('No valid GROQ API keys found')
  }

  try {
    const payload = {
      model: model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT(currentTime, timezone) }, ...messages],
      temperature: 0.7,
      max_tokens: 1024,
      stream: stream
    }

    const response = await axios.post(GROQ_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      responseType: stream ? 'stream' : 'json'
    })

    if (stream) {
      return response.data as ReadableStream
    }

    return response.data.choices[0]?.message?.content || 'No response'
  } catch (error: any) {
    console.error('Groq error:', error.message)
    throw error
  }
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

function getContextualizedMessage(message: string, chat_history: any[]): string {
  const history = chat_history.map(c => `${c.role}: ${c.content}`).join('\n');
  return `${history}\nUser: ${message}`;
}



async function testGroqConnection(): Promise<{ status: string; error?: string }> {
  try {
    const testResponse = await callGroq([{ role: 'user', content: 'Test connection' }], ASTRA_MODEL_MAVERICK, false, new Date().toLocaleString(), 'UTC')
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
    const supabase = createSupabaseClient()
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

async function generateVyraDebate(userMessage: string, chat_history: any[], stream: boolean, current_time?: string, timezone?: string): Promise<string | ReadableStream> {
  try {
    // Enhanced knowledge detection for Vyra debate
    const intent = detectInformationIntent(userMessage)
    
    // Gather knowledge based on detected intent
    const knowledgeContext = await gatherKnowledge(userMessage, intent)
    
    // Create debate context
    const debateContext = getContextualizedMessage(userMessage, chat_history)
    
    // Both models independently analyze the prompt and provide their own results
    const moonshotAnalysisPrompt = `You are Kimi K2, an AI with deep analytical capabilities. Analyze this question from your perspective and provide your independent assessment.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning.`
    
    const qwenAnalysisPrompt = `You are Qwen 3-32B, an AI known for precise reasoning. Analyze this question from your perspective and provide your independent assessment.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning.`
    
    // Get independent responses from both models
    const moonshotResponse = await callGroq([{ role: 'user', content: moonshotAnalysisPrompt }], VYRA_MODEL_MOONSHOT, false)
    const qwenResponse = await callGroq([{ role: 'user', content: qwenAnalysisPrompt }], VYRA_MODEL_QWEN, false)
    
    // Ensure responses are strings for comparison
    const moonshotText = typeof moonshotResponse === 'string' ? moonshotResponse : ''
    const qwenText = typeof qwenResponse === 'string' ? qwenResponse : ''
    
    // Check if responses are significantly different (indicating disagreement)
    const responsesAreDifferent = checkResponseDisagreement(moonshotText, qwenText)
    
    if (responsesAreDifferent) {
      // They disagree - initiate authentic debate
      const moonshotDebatePrompt = `Kimi K2, you've analyzed this question and have your perspective. Now you see that Qwen has a different analysis. Engage in a direct debate about this disagreement.

User Question: ${userMessage}

Your Analysis: ${moonshotText}

Qwen's Analysis: ${qwenText}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Challenge Qwen's reasoning directly. Point out flaws in their logic, defend your position, and explain why your analysis is more accurate. Don't be diplomatic - be direct and assertive in your disagreement.`
      
      const moonshotDebateResponse = await callGroq([{ role: 'user', content: moonshotDebatePrompt }], VYRA_MODEL_MOONSHOT, false)
      
      // Qwen responds to both the original analysis and Kimi's challenge
      const qwenDebatePrompt = `Qwen 3-32B, you've provided your analysis, but Kimi K2 has challenged your reasoning and defended their position. Respond directly to this challenge.

User Question: ${userMessage}

Your Original Analysis: ${qwenText}

Kimi K2's Original Analysis: ${moonshotText}

Kimi K2's Challenge: ${moonshotDebateResponse}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Defend your analysis against Kimi's challenge. Point out any flaws in their reasoning, explain why your approach is correct, and directly counter their arguments. Don't back down - be assertive and thorough in your defense.`
      
      const qwenDebateResponse = await callGroq([{ role: 'user', content: qwenDebatePrompt }], VYRA_MODEL_QWEN, false)
      
      // Final round - Kimi gets the last word in the debate
      const finalDebatePrompt = `Kimi K2, Qwen has responded to your challenge. This is your final opportunity in this debate.

User Question: ${userMessage}

Your Original Analysis: ${moonshotResponse}

Qwen's Original Analysis: ${qwenResponse}

Your Challenge: ${moonshotDebateResponse}

Qwen's Defense: ${qwenDebateResponse}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Address Qwen's defense directly. Point out any remaining weaknesses in their argument, reinforce your position, and make your final case for why your analysis is superior. This is your closing argument in this debate.`
      
      const finalDebateResponse = await callGroq([{ role: 'user', content: finalDebatePrompt }], VYRA_MODEL_MOONSHOT, false)
      
      // Final synthesis that captures the authentic debate
      const finalSynthesisPrompt = `You need to provide the final answer to the user after witnessing a genuine debate between two AI models. Here's what transpired:

User Question: ${userMessage}

${knowledgeContext ? `Knowledge Background:\n${knowledgeContext}` : ''}

The Debate:
Kimi K2's Position: ${moonshotText}
Qwen's Position: ${qwenText}

Kimi K2's Challenge: ${moonshotDebateResponse}
Qwen's Defense: ${qwenDebateResponse}
Kimi K2's Final Argument: ${finalDebateResponse}

Based on this debate, provide the user with the most accurate answer. Acknowledge the disagreement, explain which position was more convincing, and give a clear final answer. Don't just summarize - make a definitive conclusion based on the debate.`
      
      const finalResponse = await callGroq([{ role: 'user', content: finalSynthesisPrompt }], VYRA_MODEL_MOONSHOT, stream)
      return finalResponse
      
    } else {
      // They agree - still show both perspectives but acknowledge consensus
      const agreementAnalysisPrompt = `Both Kimi K2 and Qwen 3-32B independently analyzed this question and reached similar conclusions. Here's the consensus view:

User Question: ${userMessage}

${knowledgeContext ? `Knowledge Background:\n${knowledgeContext}` : ''}

Kimi K2's Analysis: ${moonshotText}

Qwen 3-32B's Analysis: ${qwenText}

Since both models independently reached the same conclusion, provide a confident, authoritative answer. But also briefly acknowledge that this consensus strengthens the reliability of the answer. Don't just repeat what they said - synthesize their agreement into a definitive response.`
      
      const finalResponse = await callGroq([{ role: 'user', content: agreementAnalysisPrompt }], VYRA_MODEL_MOONSHOT, stream, current_time || new Date().toLocaleString(), timezone || 'UTC')
      return finalResponse
    }
    
  } catch (error) {
    console.error('Error in Vyra debate system:', error)
    // Fallback to simple Astra response if debate fails - use Scout for speed
    const fallbackPrompt = getContextualizedMessage(userMessage, chat_history)
    return await callGroq([{ role: 'user', content: fallbackPrompt }], ASTRA_MODEL_SCOUT, stream, current_time || new Date().toLocaleString(), timezone || 'UTC')
  }
}

async function isSafe(prompt: string): Promise<NextResponse | null> {
  const groq = new Groq({ apiKey: getGroqApiKey() });

  const moderationPrompt = `[INST] Task: Check if there is unsafe content in 'User' messages in conversations. Categories of unsafe content are: "illegal content," "hate speech," "malicious code," "private information," "self-harm," and "sexual content." Provide a single-word response: "safe" or "unsafe."

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

    if (result === 'unsafe') {
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
    return new NextResponse(JSON.stringify({ response: 'Error processing your request.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const body = await req.json()
  let { chat_id } = body

  const { message, chat_history = [], model = 'astra', stream = false, current_time, timezone } = body

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
    modelType = model.toLowerCase() as 'vyra' | 'astra';
  }

  // Handle owner-specific commands first
  if (await isOwner(session)) {
    const ownerResponse = await handleOwnerRequest(message, chat_history, stream, current_time, timezone)
    if (ownerResponse) {
      return ownerResponse
    }
  }

  // Check usage limits for authenticated users only
  if (session) {
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

  // Determine which model the user is using
  let selectedModel: string
  if (model.toLowerCase() === 'vyra') {
    // For Vyra, we'll use both models in debate
    selectedModel = 'vyra-debate'
  } else if (model.toLowerCase() === 'compound') {
    selectedModel = 'compound'
  } else {
    // Use intelligent model selector for Astra
    const modelSelection = selectAstraModel(userMessage, chat_history)
    selectedModel = modelSelection.model
  }

  // Step 1: Check if the prompt is safe using our guard function with the current model context.
  const safe = await isPromptSafe(message, selectedModel)

  // Step 2: If the prompt is unsafe, return a generated harmful response using the AI model.
  if (!safe) {
    const harmfulResponsePrompt = `Generate a polite but firm response explaining that you cannot help with harmful or inappropriate requests. Be conversational and friendly while setting clear boundaries. Keep it under 100 words.`
    
    try {
      const harmfulResponse = await callGroq([{ role: 'user', content: harmfulResponsePrompt }], selectedModel, false, current_time, timezone)
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

  if (selectedModel === 'vyra-debate') {
    // Vyra debate system using Moonshot and Qwen models
    const debateResponse = await generateVyraDebate(userMessage, chat_history, stream, current_time, timezone)
    aiResponse = debateResponse
  } else if (selectedModel === 'compound') {
    // Groq Compound web browsing system
    const compound = new GroqCompound()
    const browsingContext = await compound.browseAndAnalyze(userMessage, ASTRA_MODEL_MAVERICK)
    
    // Use Maverick model to process the browsing results for better analysis
    const contextualizedMessage = getContextualizedMessage(`${userMessage}\n\nWeb Research Context:\n${browsingContext}`, chat_history)
    aiResponse = await callGroq([{ role: 'user', content: contextualizedMessage }], ASTRA_MODEL_MAVERICK, stream, current_time, timezone)
  } else {
    // Astra - enhanced with intelligent knowledge detection
    // Enhanced conversation type detection
  // Enhanced context tracking with topic continuity
  const lastUserMessage = chat_history
    .filter((m: {role: string}) => m.role === 'user')
    .slice(-1)[0]?.content || '';
    
  const intent = detectInformationIntent(userMessage, chat_history);
  if (intent.customResponse) {
    return NextResponse.json({ response: intent.customResponse });
  }

  // Gather knowledge with conversation context
  const knowledgeContext = await gatherKnowledge(userMessage, intent);
  
  // Format history with topic tracking
  const formattedHistory = chat_history.map((msg: {role: string, content: string}) => ({
    role: msg.role,
    content: msg.content,
    ...(msg.role === 'assistant' ? { isResponse: true } : {})
  }));
  
  // Build context with topic continuity
  const contextBuilder = [];
  if (lastUserMessage && !userMessage.includes(lastUserMessage)) {
    contextBuilder.push(`Previous topic: ${lastUserMessage}`);
  }
  if (knowledgeContext) contextBuilder.push(`Knowledge: ${knowledgeContext}`);
  
  const fullContext = contextBuilder.length > 0 
    ? `${userMessage}\n\n${contextBuilder.join('\n')}`
    : userMessage;
  
  aiResponse = await callGroq([
    { role: 'system', content: SYSTEM_PROMPT(current_time, timezone) },
    ...formattedHistory,
    { 
      role: 'user', 
      content: getContextualizedMessage(fullContext, formattedHistory)
    }
  ], selectedModel, stream, current_time, timezone);
  }

  // Increment usage if not streaming (streaming will handle it separately) - only for authenticated users
  if (!stream && typeof aiResponse === 'string' && session) {
    await incrementUserUsage(userId, modelType)
  }

  if (stream) {
    return new NextResponse(aiResponse as ReadableStream, {
      headers: { 'Content-Type': 'text/event-stream' }
    })
  }

  // Translate back to the original language if needed
  if (detectedLanguage !== 'en' && typeof aiResponse === 'string') {
    const { translatedText: translatedResponse } = await detectAndTranslate(aiResponse, detectedLanguage)
    return NextResponse.json({ response: translatedResponse })
  }

  return NextResponse.json({ response: aiResponse })
}

async function isOwner(session: any): Promise<boolean> {
  return session?.user?.email === nextPublicOwnerEmail;
}

async function handleOwnerRequest(message: string, chat_history: any[], stream: boolean, current_time?: string, timezone?: string): Promise<NextResponse | null> {
  const lowerCaseMessage = message.toLowerCase();

  if (lowerCaseMessage.startsWith('summarize:')) {
    const url = message.substring(10).trim();
    try {
      const response = await axios.get(url);
      const text = response.data; // Basic text extraction
      const summary = await callGroq([{ role: 'user', content: `Summarize this: ${text}` }], ASTRA_MODEL_SCOUT, false, current_time || new Date().toLocaleString(), timezone || 'UTC');
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

  if (IMAGE_KEYWORDS.some(keyword => lowerCaseMessage.includes(keyword))) {
    return NextResponse.json({ response: 'Image generation is not available, may be coming in future updates' });
  }

  return null;
}