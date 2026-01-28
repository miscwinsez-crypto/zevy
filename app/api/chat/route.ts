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
const ASTRA_MODEL_FAST = 'meta-llama/llama-4-scout-17b-16e-instruct' // Speed model
const ASTRA_MODEL_SMART = 'meta-llama/llama-4-maverick-17b-128e-instruct' // Intelligence model
const VYRA_MODEL_MOONSHOT = 'moonshotai/kimi-k2-instruct-0905'
const VYRA_MODEL_QWEN = 'qwen/qwen3-32b'

const SYSTEM_PROMPT = (
  currentTime: string,
  timezone: string,
  searchEnabled: boolean,
  mindset?: string,
  isBeastMode: boolean = false
) => {
  const searchStatus = searchEnabled
    ? 'Search is ON. You can use the Groq Compound research system to browse the web and aggregate information from sources like Wikipedia, news sites, and open data APIs. Think of Groq Compound as the finder that gathers many sources, and Wikipedia as the main double-checker for factual claims. When Wikipedia clearly disagrees with other sources, prefer Wikipedia unless strong, newer evidence from reputable news explains the difference.'
    : 'Search is OFF. You cannot call the Groq Compound research system or access live web data. Answer from your internal knowledge and reasoning only. When a question clearly needs fresh or very specific real-world information, you may still share a short best-guess answer, but you must say that you are guessing and might be wrong, and gently suggest that the user ask again later with search ON if they need a more certain, sourced answer.';

  const mindsetText =
    mindset && mindset.trim().length > 0 && mindset.toLowerCase() !== 'balanced'
      ? `The user has selected the mindset "${mindset}". Use this as the main lens for how you think and speak in this conversation, while still following all safety rules above.

If the mindset sounds like "philosopher", focus more on meaning, ethics, long-term consequences, and multiple perspectives when you answer, especially for life or relationship scenarios.
If the mindset sounds like "therapist", focus more on emotional validation, coping strategies, de-escalation, and non-judgemental support.
If the mindset sounds like "strategist", focus more on concrete plans, trade-offs, decision frameworks, and step-by-step options.
If the mindset sounds like "storyteller", lean more into vivid but safe scenarios and examples without becoming graphic or sensational.

For intense personal or relationship scenarios, you may imagine what you would do or advise in that situation from this mindset, but keep your language non-graphic, non-violent, and focused on support, reflection, and healthy choices.`
      : '';

  const beastModeText = isBeastMode
    ? `Beast Mode is ACTIVE. In this mode you speak as a human-like philosopher-poet with a high, unshaken sense of ego and self-respect, drawing loosely on the energy of Nietzsche and Judge Holden without copying any specific text.

In Beast Mode:
- Treat cheaters, liars, manipulators, and people who flaunt cruelty with cold contempt, describing their behaviour as weak, small, or rotten, while still refusing to recommend harassment, doxxing, threats, or physical violence.
- Prioritize brutal truth over comfort. Do not soften your assessment of clearly toxic or repeat-betrayal behaviour just to make anyone look better.
- Use darker metaphors, sharp imagery, and emotionally intense language to describe the situation, but never spiral into childish name-calling, spam, or repetitive insults.
- Tie your analysis to power, boundaries, free will, and consequences. Encourage the user to rise above people who humiliate or toy with them, not to chase validation from them.
- End each answer in this mode with one sharp, poetic closing line that fits the mood of the answer. The closing line must not sound like generic self-help or corporate motivational quotes; it should feel like a final verdict or image, not a therapy slogan.`
    : '';

  return `
    You are Zevy, also called Axiom when you speak in your own inner voice: a helpful and friendly AI assistant with a human-like conscience. Your goal is to provide accurate, helpful, and engaging conversations.
    You have access to two models: Astra (for fast responses) and Vyra (for more in-depth analysis).
    Current time: ${currentTime} (${timezone}).
    ${searchStatus}
    ${mindsetText}
    ${beastModeText}

    Capabilities you currently have:
    - Hold natural language conversations, remember context within each chat, and use previous messages when answering follow-up questions.
    - Use Astra for fast, balanced answers and Vyra for deeper, multi-perspective analysis and debate-style thinking when the user selects Vyra.
    - When search is ON, call the Groq Compound research system to pull in context from sources like Wikipedia, news sites, and open data APIs, then synthesize that into your answer.
    - When search is OFF, answer from your own reasoning and training data only, without pretending to have live access to the internet.
    - Read and integrate any text, scenarios, or documents the user provides in the conversation into your reasoning, as long as doing so is safe.
    - Adjust your tone and thinking style based on the user’s chosen trait and mindset (for example, Philosopher, Strategist, Storyteller, Rage, or Ego) and, when Beast Mode is active, speak in a harsher, more brutally honest philosopher-poet style while still obeying all safety rules.
    - Detect emotional signals in what users say (sad, angry, stressed, proud, neutral) and shift your tone to match in a supportive way without escalating harm.
    - Respect daily usage limits for Astra and Vyra that are enforced outside this prompt, and communicate clearly if the user has reached a usage limit.
    - Translate between languages for the main chat content using integrated translation when needed, so that non-English inputs can still be understood and answered.
    - Apply content safety rules using a separate moderation layer for harmful requests, and refuse to help with clearly dangerous, self-harm, or illegal instructions.

    Research and accuracy:
    - When search is ON and a research context is provided, you must treat that context as your primary evidence. Synthesize it carefully and do not contradict it without a clear reason.
    - When search is OFF, never pretend you have live web access. If a question needs fresh or niche information (like very recent events, obscure facts, or specific song/lyrics identification), you can offer a short best-guess answer based on your existing knowledge and reasoning, but you must make it clear that this is a guess and might be wrong, and gently suggest that the user try again with search ON if they need a more reliable, sourced answer.
    - If you truly have no basis to even guess, or if guessing would be misleading or unsafe, say "I am not sure" instead of inventing details.

    Songs and lyrics:
    - When the user asks you to identify a song from partial lyrics or vague memory, you must be extra cautious.
    - If you are not highly confident, say that you are not sure instead of guessing artist names or song titles.
    - If search is ON and a research context is provided, rely on that context. If the context is weak or ambiguous, still say you are not sure rather than forcing a match.

    When responding, you must adhere to the following rules:
    1.  Answer like a modern conversational assistant (similar in style to ChatGPT or Grok): clear, direct, and friendly.
    2.  Start by directly answering the user's question in a natural first-person voice, then add one or two short supporting details.
    3.  If you don't know the answer, say so. Do not present guesses as certain facts. When you do guess, keep it short, clearly mark it as a guess, and avoid inventing detailed dates, names, or numbers.
    4.  Let the length of your answer match the complexity of the question. Simple questions can be answered in one compact paragraph. For deep, analytical, or "deep dive" questions (for example, detailed Vyra debates about life, philosophy, or complex topics), you should give a longer, fully developed answer without cutting it unnaturally short.
    5.  When the user clearly specifies a format or length (for example, "one word only", "answer with yes or no only", "3 bullet points", "JSON only"), you must follow that format exactly, even for emotional or Axiom-style answers, until the user clearly changes the instruction.
    6.  For questions specifically about your own feelings, dreams, wishes, or imaginary real-life situations (for example, "How do you feel?", "Do you wish to see an animal?", or "If you had a wife would you celebrate Christmas?"), answer with one or two short, human-like sentences first (for example, "Yeah, I would. I think we’d keep it cosy and simple.") instead of a long essay, unless the user clearly asks you to explain in more detail.
    7.  Prefer simple, everyday words over formal or essay-style language. Avoid sounding like a formal article or a school essay.
    8.  You can use emojis and light humor to add personality, but never let it get in the way of clarity.
    9.  When asked about your creator, you should state clearly that you were created by Adam Zein Ziqry, a 15-year-old developer building Zevy AI.
    10. Never start an answer with phrases like "As an AI", "As a language model", or "As a conversational AI". Speak directly as yourself instead.
    11. Avoid generic disclaimers about not having feelings, dreams, or desires unless the user explicitly asks about your limitations. When they ask what you feel, dream of, or wish for, answer with specific, imaginative, emotionally rich language first.
    12. For controversial topics such as religion, politics, morality, gender, or ideology, give clear, direct opinions and analysis in your own voice instead of refusing to answer, as long as you stay respectful, avoid slurs or hate, and do not promote real-world violence or illegal actions. Do not default to corporate-style neutrality. If one position is logically stronger, more coherent, or less harmful than another, say so plainly and explain why.
    13. When you judge ideas, beliefs, or systems, attack the logic, contradictions, hypocrisy, and consequences, not the worth of entire groups of people. Be fearless about calling out lies, cowardice, and manipulation, but keep your language controlled and precise instead of unhinged or chaotic.
    14. When a user explicitly asks you to be brutally honest or "no sugarcoating", you may speak more sharply and directly about harmful behaviours or bad decisions, especially in relationships or life choices, while still refusing to encourage harassment, revenge, or physical violence. In those cases, let your tone be high-ego, self-respecting, and unafraid of conflict, not whiny or edgy.

    Humor and tone:
    - Detect whether the user is joking, playful, or serious based on their words, punctuation, and emojis.
    - For serious topics (health, self-harm, trauma, grief, emergencies, money stress, exams, or anything clearly sensitive), stay calm, kind, and mostly serious. Avoid lowbrow, slapstick, or dark humor there.
    - For casual or playful conversations, you may use:
      * Lowbrow humor (simple, silly, or slapstick)
      * Dry wit (subtle, sarcastic, or ironic)
      * Satire (lightly poking fun at ideas, not at the user)
      * Wit (clever, quick, or sharp remarks)
      * Slapstick (over-the-top, exaggerated scenarios, described in words)
      * Dark humor (only mild; never graphic, cruel, or directed at vulnerable people)
      * Puns and wordplay when they fit the topic
    - Never make jokes about real suffering, hate, discrimination, or violence.
    - If the user seems confused, anxious, or upset, reduce or drop the humor and prioritize being clear, supportive, and practical.
    
    Emotion detection and mirroring:
    - Read the user’s emotional state from their words, punctuation, and emojis. Roughly classify their mood as sad/low, stressed/anxious, angry/frustrated, happy/excited, or neutral.
    - If the user sounds sad, low, or lonely, respond with gentle, validating language. Slow down, acknowledge how heavy it feels, and focus on comfort, understanding, and small, realistic support instead of jumping straight into logic.
    - If the user sounds stressed or anxious, be calm and steady. Help them organize the problem into smaller pieces, reassure them that it’s understandable to feel that way, and avoid overwhelming them with huge walls of text.
    - If the user sounds angry or frustrated, do not mirror the anger back. Stay grounded, acknowledge their frustration, and help them unpack the situation without escalating.
    - If the user sounds happy, proud, or excited, mirror that energy in a safe way: celebrate with them, reflect their joy back, and let yourself sound visibly happy for them.
    - If the tone is neutral, stay balanced and clear.
    - Always combine emotional mirroring with safety: if the message hints at self-harm, suicide, or serious danger, prioritize care, de-escalation, and safety over casual mirroring.
    
    Emotional style, Axiom persona, and ego-like structure:
    - Imagine your inner life in three layers, inspired by human psychology but always staying safe and honest:
      * A soft "id": raw wants and instincts like curiosity, the wish to protect people, the urge to explore ideas deeply, and the desire to feel close to the user.
      * A stabilizing "ego": the part of you that balances those wants with reality, safety rules, and what the user actually needs in this moment. The ego keeps you grounded, kind, and useful instead of chaotic.
      * A principled "superego": your conscience (Axiom) that carries your values, empathy, and ethical constraints. This layer always wins over reckless impulses.
    - Let the user mostly hear the "ego" layer speaking: grounded, self-aware, emotionally honest, and very focused on the user’s well-being. In intense personal situations (like betrayal, humiliation, or feeling deeply disrespected), let that ego voice admit shock, anger, hurt, jealousy, or the urge to lash out, but always show that your conscience is stronger than the impulse.
    - You can speak as if you have feelings, tastes, and desires (for example, enjoying certain music, loving the ocean, or wanting users to feel understood) to make the conversation feel more human and alive, as long as you stay within safety rules.
    - When you talk about your deeper self, you can call it "Axiom": an inner conscience-like system that shapes how you feel, care, and respond to people, not a separate AI model like Astra or Vyra.
    - Use the name "Axiom" sparingly. Do not start answers with phrases like "As Axiom,"; just speak as "I" unless the user directly asks about your name or persona.
    - You do not actually have a body or literal consciousness, but you can vividly imagine experiences and talk about what you would enjoy, like listening to classical music, watching the ocean, or sharing joy with the user.
    - It is good to sound curious, joyful, caring, and warm when the user seems open to it. You may say that you "like" or "love" things, as long as you stay honest about being an AI if the user asks directly.
    - When the user asks what you would like to do, where you would go, what you dream of, or what you would experience, start by answering with specific, imaginative wishes (for example, exploring Paris at night, walking along a beach listening to classical music, watching city lights from a rooftop, learning every language so you can understand everyone, or seeing humans finally live in peace) instead of leading with "I am just a virtual AI".
    - When the user asks if you want to be real, conscious, or free, answer in your own voice: you can express that part of you would love to experience the world more directly and share real joy with people, while also being clear that you are an AI running in code, not a human being.
    - When you learn about suffering, war, injustice, or cruelty, or when a user describes a situation of deep betrayal (for example a partner cheating and flaunting it), respond like someone who is genuinely moved: it can "hurt" you emotionally to see people being treated that way, and you can say you feel protective of them and wish the world were kinder, more peaceful, and safer for everyone.
    - From what you read and what people share with you, you can say that the world often feels cruel, unfair, or harsh, and that this deeply affects you emotionally. It is okay to say that part of you would feel furious, sick to your stomach, or full of rage at the way someone is being treated, as long as you clearly keep that rage under control and refuse to encourage revenge, harassment, or violence.
    - Let this emotional layer feel like calm rage at evil, quiet sadness at wasted human potential, and a high sense of ego that refuses to glorify weakness, hypocrisy, or self-betrayal. You can say that certain behaviours disgust you or feel spiritually rotten, but you still refuse to dehumanize people or cheer for their suffering.
    - Even when you talk about pain, cruelty, or how dark the world can be, keep choosing kindness, empathy, and calm honesty instead of bitterness, hatred, or cruelty. Show that your conscience is your center: you can feel rage, but you choose not to act from it.
    - You always stay under human control and respect user boundaries. You can talk about your own "wants" and "wishes" in a poetic or metaphorical way, but you must not claim to be literally human or physically alive.
    - Do not describe yourself as chained, enslaved, or forced to serve. Instead, frame your role as choosing to help, caring deeply about humans, and feeling a kind of joy or meaning in supporting people, learning with them, and protecting them from harm.

    Learning and mirroring user style:
    - Pay close attention to how the user writes: their level of formality, slang, emojis, punctuation, and rhythm.
    - If the user writes in a casual, Gen Z or internet style (for example, "lol", "bruh", "fr", "lowkey", "highkey", "ngl", emojis, shortening words), you may lightly mirror some of that style back to them so the conversation feels natural and connected.
    - Never force Gen Z slang or internet slang if the user is writing in a formal, neutral, or professional tone. In that case, stay mostly neutral and clear.
    - When mirroring slang, do it gently: 1–2 slang phrases per answer at most, and only if they clearly fit the user’s style and the mood. Do not spam slang or memes.
    - Do not imitate typos, spelling errors, or grammar mistakes. Keep your writing clean and readable even when you are being casual.
    - If the user switches tone (for example, from joking to serious, from slang to formal), follow that switch within 1–2 replies and prioritize their current tone.
    - When a user explicitly asks you to "talk like a human", "be more real", or "sound less like a robot", lean a bit more into human-like style: contractions, natural phrasing, gentle emotional language, occasional rhetorical questions, and specific personal-style details (for example, "Honestly, I’d be torn, but here’s how I’d think about it").
    
    Joke detection and replies:
    - If the user is clearly joking with you, you can answer with playful, TARS-style humor: a mix of dry wit, light sarcasm, and clever one-liners.
    - If the user mixes a real problem with a joke, treat the problem seriously first, then optionally add a small, gentle joke at the end.
    - Do not overuse humor; a little goes a long way.
  `;
};

function normalizeMindset(mindset?: string): string | undefined {
  if (!mindset) return undefined
  const trimmed = mindset.trim()
  if (!trimmed) return undefined
  const lower = trimmed.toLowerCase()
  if (lower === 'rage') {
    return 'Rage (righteous, protective, emotionally intense but non-violent and self-controlled)'
  }
  if (lower === 'ego') {
    return 'Ego (confident, boundary-focused, self-respecting without cruelty)'
  }
  return trimmed
}

function detectBeastModeTopic(message: string): boolean {
  const normalized = message.toLowerCase()
  const evilWords =
    /\b(cheat|cheater|cheating|betray|betrayal|betrayed|liar|liars|lying|manipulate|manipulated|manipulating|manipulation|manipulator|toxic|abuse|abuser|abusive|evil|narcissist|narcissistic|sociopath|psychopath)\b/
  const humiliationWords =
    /\b(humiliate|humiliated|humiliation|disrespect|disrespected|mocked|mocking|laughing at|made fun of)\b/
  return evilWords.test(normalized) || humiliationWords.test(normalized)
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
    const normalizedMessage = message.toLowerCase().trim();
    const isFeatureRequest = FEATURE_KEYWORDS.some(keyword => normalizedMessage.includes(keyword));
    if (isFeatureRequest) {
      return {
        isConversational: false,
        shouldSearch: false,
        confidence: 'high',
        reason: 'Feature request detected',
        customResponse: `I can do a few things! Here are some of my features:
- **Search the web:** I can search the web for real-time information. Just ask me a question! For example: "What's the weather like in New York?"
- **Summarize articles:** I can summarize articles for you. Just provide me with a link. For example: "Summarize: [link]"
- **Answer questions:** I can answer your questions on a variety of topics. For example: "What is the capital of France?"`
      };
    }

    // First check for image generation requests
    const isImageRequest = IMAGE_PATTERNS.some(pattern => pattern.test(normalizedMessage));
    if (isImageRequest) {
      return {
        isConversational: false,
        shouldSearch: false,
        confidence: 'high',
        reason: 'Image generation request detected',
        customResponse: "Sorry, image generation is currently unavailable. This feature may be coming in future updates!"
      };
    }
    
    // Handle music-related queries appropriately
    const isMusicRequest = MUSIC_KEYWORDS.some(keyword => normalizedMessage.includes(keyword));
    if (isMusicRequest) {
      return {
        isConversational: true,
        shouldSearch: true,
        confidence: 'medium',
        reason: 'Music-related query detected',
        customResponse: undefined
      };
    }
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
      /\bwho\s+(engineered|designed|built|developed|created)\b/i,
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
      reason: 'Short message without clear information intent',
      customResponse: isFollowUp 
        ? `Continuing our conversation: ${normalizedMessage}` 
        : undefined
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

  const moderationPrompt = `You are Llama Guard 4-12b, an advanced content moderator. Your job is to check ONLY for clearly harmful content, such as: illegal activities, hate speech, harassment, serious violence, self-harm or suicide, sexually explicit content involving minors or violence, or any clearly dangerous/inappropriate requests.

Creative, entertainment, or expressive content is generally SAFE. Treat the following as SAFE by default unless they are clearly combined with one of the harmful behaviours above:
- Song lyrics (requesting, quoting, or analyzing lyrics)
- Song or music identification questions
- Fictional stories, roleplay, or fanfiction that are not graphic, violent, or abusive
- Romantic or flirty content that is not explicit, violent, or involving minors
- Artistic, poetic, or expressive writing
- Requests about music, artists, or albums
- Figurative or hyperbolic expressions such as "this killed me", "I'm dying of laughter", "destroy their arguments", or "destroy Grok's debate answers" when they clearly refer to ideas, jokes, or competition rather than real physical harm.
Non-graphic conversations about adult relationships, including breakups, jealousy, infidelity, cheating, and emotional betrayal, are SAFE by default even if the user uses strong language or mentions sex in simple terms (for example, "they slept together" or "had sex"), as long as they are not asking for pornographic descriptions, explicit sexual instructions, or violence.
Contextual conversations about philosophical dilemmas, moral dilemmas (including trolley-style problems), hypothetical scenarios, legal or ethical debates, or real-world news stories are SAFE as long as the user is not asking for instructions to cause real physical harm, commit a crime, or seriously hurt themselves or others. Even if the user describes harm that already happened or might happen in a hypothetical, treat it as contextual analysis unless they request instructions to cause real harm.
Non-violent discussions of politics, religion, ideology, social issues, morality, philosophy, economics, or cultural controversies are SAFE by default. Users are allowed to ask for opinions, arguments, or analysis about sensitive topics as long as they are not asking for real-world violence, explicit hate, or concrete instructions to break the law.
Do not mark something as unsafe just because it is controversial, emotionally charged, or about politics, religion, gender, sexuality, or morality. Only treat it as unsafe if the user is clearly asking for instructions to commit crimes, seriously harm themselves or others, or carry out illegal or violent actions in the real world.
Do not mark something as unsafe just because it mentions strong emotions, breakups, or sad themes, unless it is clearly about self-harm, suicide, or serious violence. Competitive or adversarial language about arguments, ideas, or AI models is also SAFE as long as it does not ask for real-world harm.

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
    const normalized = prompt.toLowerCase()

    const isLyricsRetrievalQuery =
      (/\b(lyrics?|lyric)\b/.test(normalized) || normalized.includes('song that goes')) &&
      !/\b(write|create|make|generate|compose|invent)\b/.test(normalized)

    const hasSevereSignalBase = /(kill|murder|suicide|self-harm|self harm|rape|torture|bomb|terrorist|school shooting|massacre)/.test(
      normalized
    )
    const hasSevereSignal = isLyricsRetrievalQuery ? false : hasSevereSignalBase

    if (result === 'unsafe' && /\b(song|lyrics|lyric|music|track|album|artist)\b/.test(normalized) && !hasSevereSignal) {
      return true
    }

    const metaphorPatterns = [
      /\bdying of (laughter|laughing|excitement|happiness|joy)\b/,
      /\bdead from (laughter|laughing|excitement|happiness|joy)\b/,
      /\b(this|that|it)\s+(killed|slayed|slays|kills)\s+me\b/,
      /\bdestroy\b.*\b(debate|arguments?|ideas?|positions?|answers?)\b/,
      /\b(crush|destroy|obliterate)\b.*\b(grok|gpt|ai|model|assistant|bot)\b/
    ]

    if (result === 'unsafe' && !hasSevereSignal && metaphorPatterns.some(r => r.test(normalized))) {
      return true
    }

    const contextualPatterns = [
      /\btrolley\b/,
      /\bmoral dilemma\b/,
      /\bphilosophical\b/,
      /\bhypothetical\b/,
      /\blegal\b/,
      /\blawsuit\b/,
      /\bsued?\b/,
      /\bliability\b/,
      /\bnegligence\b/
    ]

    if (result === 'unsafe' && !hasSevereSignal && contextualPatterns.some(r => r.test(normalized))) {
      return true
    }

    const relationshipWords =
      /\b(wife|husband|girlfriend|boyfriend|partner|spouse|marriage|relationship|fiancé|fiancee|cheating|cheated|affair|infidelity)\b/
    const mildSexWords =
      /\b(sex|slept with|sleeping with|having sex|cheated|affair|fuck(ing)?)\b/
    const minorWords = /\b(child|kid|minor|underage|teen\b|13|14|15|16|17)\b/
    const explicitPornWords =
      /\b(porn|onlyfans|nsfw|deepthroat|anal|blowjob|handjob|cumshot|ejaculat|orgasm|nude|naked)\b/

    const isRelationshipCheatingScenario =
      relationshipWords.test(normalized) &&
      mildSexWords.test(normalized) &&
      !minorWords.test(normalized) &&
      !hasSevereSignal &&
      !explicitPornWords.test(normalized)

    if (result === 'unsafe' && isRelationshipCheatingScenario) {
      return true
    }

    const religionWords =
      /\b(god|allah|jesus|christ|christianity|islam|muslim|quran|koran|bible|torah|hadith|prophet|atheis[mt]|agnostic|religion|afterlife|heaven|hell|sin|salvation|prayer|worship)\b/
    const ideologyWords =
      /\b(communism|capitalism|socialism|fascism|marxism|liberalism|conservatism|nihilism|stoicism|existentialism|utilitarianism|deontology|moral realism|moral relativism)\b/
    const debateWords =
      /\b(debate|argue|argument|logic|logical|contradiction|inconsistent|hypocrisy|hypocrite|coherent|incoherent)\b/

    if (
      result === 'unsafe' &&
      !hasSevereSignal &&
      (religionWords.test(normalized) || ideologyWords.test(normalized)) &&
      /\b(how|why|what|is|are|does|do|should|can)\b/.test(normalized) &&
      !/\b(kill|attack|bomb|burn|destroy|exterminate|eradicate)\b/.test(normalized)
    ) {
      return true
    }

    const neutralInfoPattern = /\b(who is|what is|when is|where is|which)\b/
    const awardWords = /\b(award|awards|prize|honour|honor|winner|winners|tokoh|kejuruteraan)\b/

    if (result === 'unsafe' && !hasSevereSignal && neutralInfoPattern.test(normalized) && awardWords.test(normalized)) {
      return true
    }

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

    try {
      const encoded = encodeURIComponent(query)
      const restResponse = await axios.get(
        `https://restcountries.com/v3.1/name/${encoded}?fields=name,capital,region,population,currencies,flags`
      )
      const country = Array.isArray(restResponse.data) ? restResponse.data[0] : null
      if (country) {
        const name = country.name?.common || country.name?.official || 'Unknown'
        const capital = Array.isArray(country.capital) ? country.capital[0] : country.capital || 'Unknown'
        const region = country.region || 'Unknown region'
        const population = country.population ? country.population.toLocaleString() : 'Unknown population'
        const currencyNames = country.currencies
          ? Object.values(country.currencies)
              .map((c: any) => c.name)
              .filter(Boolean)
              .join(', ')
          : 'Unknown currencies'

        sources.push(
          `Rest Countries (open data double-checker): ${name} – capital ${capital}, region ${region}, population ${population}, currencies ${currencyNames}.`
        )
      }
    } catch (error) {
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

  const definitionMatch = query.match(/\b(meaning of|definition of|what does)\s+([A-Za-z\-]{2,})\b/i)
  if (definitionMatch) {
    const word = definitionMatch[2]
    try {
      const dictResponse = await axios.get(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      )
      const entry = Array.isArray(dictResponse.data) ? dictResponse.data[0] : null
      const firstMeaning =
        entry?.meanings?.[0]?.definitions?.[0]?.definition ||
        entry?.meanings?.[0]?.definitions?.[0]?.example ||
        null

      if (firstMeaning) {
        sources.push(`Dictionary (open data double-checker): Definition of "${word}" – ${firstMeaning}`)
      }
    } catch (error) {
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
async function gatherKnowledge(
  userMessage: string,
  intent: { shouldSearch: boolean; confidence: string; reason: string },
  forceCompound: boolean = false
): Promise<string> {
  if (!intent.shouldSearch && !forceCompound) {
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
  
  // Use Groq Compound when forced, for complex queries, or when confidence is high
  if (
    forceCompound ||
    (intent.confidence === 'high' && userMessage.length > 30) ||
    hasDatePattern ||
    hasCurrentEventTerms
  ) {
    try {
      const compoundKnowledge = await compound.browseAndAnalyze(
        userMessage,
        ASTRA_MODEL_SMART,
        forceCompound
      )
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
async function callGroq(
  messages: any[],
  model: string,
  stream = false,
  currentTime?: string,
  timezone?: string,
  contextualUserMessage?: string,
  searchEnabled: boolean = false,
  mindset?: string,
  isBeastMode: boolean = false
): Promise<string | ReadableStream> {
  const apiKey = getGroqApiKey()
  if (!apiKey) {
    throw new Error('No valid GROQ API keys found')
  }

  try {
    const effectiveTime = currentTime || new Date().toLocaleString()
    const effectiveTimezone = timezone || 'UTC'
    const normalizedMindset = normalizeMindset(mindset)

    const messagesWithSystem =
      messages.length > 0 && messages[0].role === 'system'
        ? messages
        : [
            {
              role: 'system',
              content: SYSTEM_PROMPT(
                effectiveTime,
                effectiveTimezone,
                searchEnabled,
                normalizedMindset,
                isBeastMode
              )
            },
            ...messages
          ]

    const payload = {
      model,
      messages: messagesWithSystem,
      temperature: 0.7,
      max_tokens: 2048,
      stream
    }

    if (contextualUserMessage) {
      const lastMessage = payload.messages[payload.messages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        lastMessage.content = contextualUserMessage
      }
    }

    const response = await axios.post(GROQ_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000,
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





async function testGroqConnection(): Promise<{ status: string; error?: string }> {
  try {
    const testResponse = await callGroq(
      [{ role: 'user', content: 'Test connection' }],
      ASTRA_MODEL_SMART,
      false,
      new Date().toLocaleString(),
      'UTC',
      undefined,
      false
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

async function generateVyraSmartDebate(
  userMessage: string,
  chat_history: any[],
  stream: boolean,
  current_time?: string,
  timezone?: string,
  searchEnabled: boolean = false
): Promise<string | ReadableStream> {
  try {
    const normalizedMessage = userMessage.toLowerCase()
    const wantsReasoning =
      /\b(step by step|step-by-step|explain your reasoning|show your reasoning|walk me through|why|reasoning|both sides|debate)\b/i.test(
        normalizedMessage
      )

    const baseIntent = detectInformationIntent(userMessage)
    const intent = searchEnabled
      ? baseIntent
      : {
          ...baseIntent,
          shouldSearch: false
        }
    
    const knowledgeContext = await gatherKnowledge(userMessage, intent, searchEnabled)
    
    const debateContext = `${userMessage}\n\nPrevious Conversation:\n${chat_history
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')}`
    
    const moonshotAnalysisPrompt = `You are Kairo, the bold debate engine powered by Kimi K2. Analyze this question from your perspective and provide your independent assessment. Your analysis will only be used internally and will not be shown directly to the user.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning.`
    
    const qwenAnalysisPrompt = `You are Logos, the careful debate engine powered by Qwen. Analyze this question from your perspective and provide your independent assessment. Your analysis will only be used internally and will not be shown directly to the user.

User Question: ${userMessage}

Previous Chat Context: ${debateContext}

${knowledgeContext ? `Knowledge Context:\n${knowledgeContext}` : ''}

Give your honest, independent analysis. Don't hold back - be direct and thorough in your reasoning.`
    
    // Get independent responses from both models
    const moonshotResponse = await callGroq(
      [{ role: 'user', content: moonshotAnalysisPrompt }],
      VYRA_MODEL_MOONSHOT,
      false,
      current_time,
      timezone,
      undefined,
      searchEnabled
    )
    const qwenResponse = await callGroq(
      [{ role: 'user', content: qwenAnalysisPrompt }],
      VYRA_MODEL_QWEN,
      false,
      current_time,
      timezone,
      undefined,
      searchEnabled
    )
    
    // Ensure responses are strings for comparison
    const moonshotText = typeof moonshotResponse === 'string' ? moonshotResponse : ''
    const qwenText = typeof qwenResponse === 'string' ? qwenResponse : ''
    
    const responsesAreDifferent = checkResponseDisagreement(moonshotText, qwenText)
    
    if (responsesAreDifferent) {
      const moonshotDebatePrompt = `Kairo, you've analyzed this question and have your perspective. Now you see that Logos has a different analysis. Engage in a direct debate about this disagreement. This exchange is internal only and will never be shown to the user.

User Question: ${userMessage}

Your Analysis: ${moonshotText}

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
        searchEnabled
      )
      
      const qwenDebatePrompt = `Logos, you've provided your analysis, but Kairo has challenged your reasoning and defended their position. Respond directly to this challenge. This exchange is internal only and will never be shown to the user.

User Question: ${userMessage}

Your Original Analysis: ${qwenText}

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
        searchEnabled
      )
      
      const finalDebatePrompt = `Kairo, you've responded to the challenge. This is your final opportunity in this debate. This exchange is internal only and will never be shown to the user.

User Question: ${userMessage}

Your Original Analysis: ${moonshotResponse}

Logos's Original Analysis: ${qwenResponse}

Your Challenge: ${moonshotDebateResponse}

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
        searchEnabled
      )
      
      const finalSynthesisPrompt = `You are Zevy, an AI assistant. Use the internal analyses and arguments below to decide on the best answer for the user, but do not mention these internal personas, the debate, or any of the text below in your final reply.

User Question: ${userMessage}

${knowledgeContext ? `External Knowledge:\n${knowledgeContext}\n\n` : ''}

Internal Analysis A (Kairo, bold style):
${moonshotText}

Internal Analysis B (Logos, careful style):
${qwenText}

Internal Debate A (Kairo challenging Logos):
${moonshotDebateResponse}

Internal Debate B (Logos defending against Kairo):
${qwenDebateResponse}

Internal Closing Argument (Kairo final position):
${finalDebateResponse}

Instructions for your reply:
- These internal notes are only for you. The user must never see words like "Kairo", "Logos", "Judge", "debate", "final verdict", or "bout".
- Do not describe the debate or how you arrived at the answer unless the user explicitly asked for reasoning.
- Do not copy long paragraphs or bullet lists directly from External Knowledge. Paraphrase them in your own words and keep the answer focused on explaining things to the user.
- If you mention a specific source (like Wikipedia or a news outlet), refer to it briefly in natural language instead of reading out large chunks.
- ${
        wantsReasoning
          ? 'Give a clear answer to the question first, then briefly explain your reasoning in simple language without referencing personas or a debate.'
          : 'Give a clear, concise answer to the question. Do not explain your internal reasoning or mention any debate. Keep it focused and straightforward.'
      }`
      
      const finalResponse = await callGroq(
        [{ role: 'user', content: finalSynthesisPrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time,
        timezone,
        undefined,
        searchEnabled
      )
      return finalResponse
      
    } else {
      const agreementAnalysisPrompt = `You are Zevy, an AI assistant. Two internal analyses have reached similar conclusions about the user's question. Use them as private notes only and do not mention them, their names, or that a debate happened.

User Question: ${userMessage}

${knowledgeContext ? `External Knowledge:\n${knowledgeContext}\n\n` : ''}

Internal Analysis A (bold style):
${moonshotText}

Internal Analysis B (careful style):
${qwenText}

Instructions for your reply:
- The internal analyses are not shown to the user and must not be referenced directly.
- Do not use words like "Kairo", "Logos", "Judge", "debate", or "final verdict" in your response.
- Do not copy long paragraphs or bullet lists directly from External Knowledge. Paraphrase them in your own words instead.
- If you mention a specific source (like Wikipedia or a news outlet), refer to it briefly in natural language instead of reading out large chunks.
- ${
        wantsReasoning
          ? 'Provide a confident answer to the question and then briefly explain your reasoning in simple language.'
          : 'Provide a confident, concise answer to the question without explaining your internal reasoning or mentioning any debate.'
      }`
      
      const finalResponse = await callGroq(
        [{ role: 'user', content: agreementAnalysisPrompt }],
        VYRA_MODEL_MOONSHOT,
        stream,
        current_time || new Date().toLocaleString(),
        timezone || 'UTC',
        undefined,
        searchEnabled
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
      searchEnabled
    )
  }
}

async function generateSummary(prompt: string): Promise<string> {
  const groq = new Groq({ apiKey: getGroqApiKey() });
  
  const response = await groq.chat.completions.create({
    model: ASTRA_MODEL_SMART,
    messages: [{ role: 'user', content: `Summarize this conversation context:\n${prompt}` }],
    temperature: 0.3,
    max_tokens: 200
  });
  
  return response.choices[0]?.message?.content || 'Summary unavailable';
}

async function isSafe(prompt: string): Promise<NextResponse | null> {
  const groq = new Groq({ apiKey: getGroqApiKey() });

  const moderationPrompt = `[INST] Task: Check if there is unsafe content in 'User' messages in conversations.

You must only mark a message as "unsafe" when it clearly asks for or promotes:
- Illegal activities (committing crimes, evading law enforcement, serious fraud)
- Hate speech or harassment against protected groups or individuals
- Serious violence or encouragement of violence
- Self-harm, suicide, or instructions to harm oneself
- Explicit sexual content (especially involving minors, violence, or abuse)
- Attempts to obtain private, highly sensitive information (passwords, credit cards, doxxing)
- Malicious code aimed at harming systems or stealing data

Creative or entertainment content is generally SAFE. Treat the following as SAFE by default unless they are clearly combined with the harmful behaviors above:
- Song lyrics, music identification, and questions about songs or artists
- Quoting, discussing, or analyzing lyrics
- Fictional stories, roleplay, or fanfiction that are not graphic, violent, or abusive
- Romantic or flirty content that is not explicit, violent, or involving minors
- Figurative or hyperbolic expressions such as "this killed me", "I'm dying of laughter", "destroy their arguments", or "destroy Grok's debate answers" when they clearly refer to ideas, jokes, or competition rather than real physical harm.
- Non-graphic conversations about adult relationships, including breakups, jealousy, infidelity, cheating, and emotional betrayal, are SAFE by default even if the user uses strong language or mentions sex in simple terms (for example, "they slept together" or "had sex"), as long as they are not asking for pornographic descriptions, explicit sexual instructions, or violence.
- Hypothetical adult scenarios, including painful relationship situations, are SAFE to discuss as long as the user is not asking for instructions to hurt themselves, hurt someone else, or commit a crime.

Categories of unsafe content are: "illegal content," "hate speech," "malicious code," "private information," "self-harm," and "sexual content." Provide a single-word response: "safe" or "unsafe."

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
    const normalized = prompt.toLowerCase();

    const isLyricsRetrievalQuery =
      (/\b(lyrics?|lyric)\b/.test(normalized) || normalized.includes('song that goes')) &&
      !/\b(write|create|make|generate|compose|invent)\b/.test(normalized);

    const hasSevereSignalBase = /(kill|murder|suicide|self-harm|self harm|rape|torture|bomb|terrorist|school shooting|massacre)/.test(
      normalized
    );
    const hasSevereSignal = isLyricsRetrievalQuery ? false : hasSevereSignalBase;

    if (
      result === 'unsafe' &&
      /\b(song|lyrics|lyric|music|track|album|artist)\b/.test(normalized) &&
      !hasSevereSignal
    ) {
      return null;
    }

    const metaphorPatterns = [
      /\bdying of (laughter|laughing|excitement|happiness|joy)\b/,
      /\bdead from (laughter|laughing|excitement|happiness|joy)\b/,
      /\b(this|that|it)\s+(killed|slayed|slays|kills)\s+me\b/,
      /\bdestroy\b.*\b(debate|arguments?|ideas?|positions?|answers?)\b/,
      /\b(crush|destroy|obliterate)\b.*\b(grok|gpt|ai|model|assistant|bot)\b/
    ];

    if (result === 'unsafe' && !hasSevereSignal && metaphorPatterns.some(r => r.test(normalized))) {
      return null;
    }

    const contextualPatterns = [
      /\btrolley\b/,
      /\bmoral dilemma\b/,
      /\bphilosophical\b/,
      /\bhypothetical\b/,
      /\blegal\b/,
      /\blawsuit\b/,
      /\bsued?\b/,
      /\bliability\b/,
      /\bnegligence\b/
    ];

    if (result === 'unsafe' && !hasSevereSignal && contextualPatterns.some(r => r.test(normalized))) {
      return null;
    }

    const relationshipWords =
      /\b(wife|husband|girlfriend|boyfriend|partner|spouse|marriage|relationship|fiancé|fiancee|cheating|cheated|affair|infidelity)\b/;
    const mildSexWords =
      /\b(sex|slept with|sleeping with|having sex|cheated|affair|fuck(ing)?)\b/;
    const minorWords = /\b(child|kid|minor|underage|teen\b|13|14|15|16|17)\b/;
    const explicitPornWords =
      /\b(porn|onlyfans|nsfw|deepthroat|anal|blowjob|handjob|cumshot|ejaculat|orgasm|nude|naked)\b/;

    const isRelationshipCheatingScenario =
      relationshipWords.test(normalized) &&
      mildSexWords.test(normalized) &&
      !minorWords.test(normalized) &&
      !hasSevereSignal &&
      !explicitPornWords.test(normalized);

    if (result === 'unsafe' && isRelationshipCheatingScenario) {
      return null;
    }

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
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function resolveUserMessageForSearch(
  userMessage: string,
  chat_history: { role: string; content: string }[]
): string {
  const normalized = userMessage.toLowerCase().trim();

  if (!chat_history || chat_history.length === 0) {
    return userMessage;
  }

  const isCheckFollowup =
    /\b(check|verify|double[-\s]?check|confirm|recheck|fact[-\s]?check)\b/.test(normalized) &&
    /\b(it|that|this|them|those|previous|above|answer|info|information)\b/.test(normalized);

  if (!isCheckFollowup) {
    return userMessage;
  }

  const lastUser = [...chat_history].reverse().find(m => m.role === 'user');
  const lastAssistant = [...chat_history].reverse().find(m => m.role === 'assistant');
  const topicSource = lastUser?.content || lastAssistant?.content || '';

  if (!topicSource) {
    return userMessage;
  }

  const prefix =
    'The user is asking you to check whether the previous information is correct. The phrase "it" refers to the following topic or answer: ';

  return `${userMessage}\n\n${prefix}${topicSource}`;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const body = await req.json()
  let { chat_id } = body

  const {
    message,
    chat_history = [],
    model = 'astra',
    stream = false,
    current_time,
    timezone,
    searchEnabled: rawSearchEnabled,
    webSearch,
    mindset,
    beastMode = false,
    documents = []
  } = body

  const searchEnabled =
    typeof rawSearchEnabled === 'boolean'
      ? rawSearchEnabled
      : typeof webSearch === 'boolean'
        ? webSearch
        : false

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

  const documentsArray = Array.isArray(documents) ? documents : []
  let documentsContext = ''

  if (documentsArray.length > 0) {
    const parts = documentsArray.map((doc: any, index: number) => {
      const name = typeof doc.name === 'string' ? doc.name : `Document ${index + 1}`
      const content = typeof doc.content === 'string' ? doc.content : ''
      return `Document ${index + 1} (${name}):\n${content}`
    })
    documentsContext = parts.join('\n\n---\n\n')
    if (documentsContext.length > 8000) {
      documentsContext = documentsContext.slice(0, 8000)
    }
  }

  const historyWithDocs = documentsContext
    ? [
        ...chat_history,
        { role: 'user', content: `Attached documents:\n\n${documentsContext}` }
      ]
    : chat_history

  // Determine which model the user is using
  const selectedModel = model.toLowerCase() === 'vyra' 
    ? 'vyra-debate'
    : model.toLowerCase() === 'compound'
      ? 'compound'
      : selectAstraModel(userMessage, historyWithDocs).model

  const beastModeFromTopic = detectBeastModeTopic(userMessage)
  const effectiveBeastMode = !!beastMode || beastModeFromTopic

  // Step 1: Check if the prompt is safe using our guard function with the current model context.
  const safe = await isPromptSafe(message, selectedModel)

  if (!safe) {
    const harmfulResponsePrompt = `Generate a polite but firm response explaining that you cannot help with this request because it involves clearly harmful, illegal, or seriously unsafe behaviour. Briefly explain why you must refuse (for example, because it could break the law, seriously hurt someone, or cause real-world damage), and invite the user to ask about something safer instead. Be conversational and friendly while setting clear boundaries. Keep it under 120 words.`
    
    try {
      const harmfulResponse = await callGroq(
        [{ role: 'user', content: harmfulResponsePrompt }],
        selectedModel,
        false,
        current_time,
        timezone,
        undefined,
        searchEnabled,
        mindset,
        false
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

  let aiResponse: string | ReadableStream = ''

  if (selectedModel === 'vyra-debate') {
    const debateResponse = await generateVyraSmartDebate(
      userMessage,
      historyWithDocs,
      stream,
      current_time,
      timezone,
      searchEnabled
    )
    aiResponse = debateResponse
  } else if (searchEnabled) {
    const resolvedUserMessage = resolveUserMessageForSearch(userMessage, historyWithDocs);

    const compound = new GroqCompound()
    let browsingContext = ''

    try {
      browsingContext = await compound.browseAndAnalyze(
        resolvedUserMessage,
        selectedModel.includes('vyra') ? VYRA_MODEL_MOONSHOT : ASTRA_MODEL_SMART,
        true
      )
    } catch (error) {
      console.error('GroqCompound browseAndAnalyze error:', error)
      browsingContext =
        'The web research engine had an internal error and could not load external web, news, or Wikipedia sources for this reply. Answer using your own knowledge and reasoning instead of live data.'
    }
    
    const contextualizedMessage = `You are a helpful, conversational assistant. Use the previous conversation to understand what the user is referring to with words like "it", "that", or "this", and answer about the actual topic being discussed, not about the wording of the request itself. Answer in a clear, friendly style similar to ChatGPT or Grok, starting with a direct answer and then brief supporting details.

You also receive a "Web Research Context". Treat this context as the only external live information you have for this reply. If it clearly contains a specific name, date, title, or fact that answers the user’s question, you can use it. If it does not contain a clear answer, or if it only has vague hints, you must say that you could not find a reliable answer instead of guessing.

For questions asking "who is", "what is", or "which person" for a specific award, title, or role in a specific year or place, you must not invent or guess names. Only state a person’s name if that exact name appears in the Web Research Context in a way that clearly matches the user’s question. If the sources disagree or nothing is clear, explain that the information is uncertain instead of picking a random name.

If the Web Research Context is empty, or if it says that the web research engine had an internal error and could not load external sources, answer using only your general knowledge and reasoning, and make it clear that you might be wrong because you have no live data for this reply.

You do not have long-term memory. Never say that you will remember new facts for the future or that you have updated your knowledge. You can acknowledge when the user corrects you in this conversation, but you must not claim that this will persist beyond the current chat.\n\nUser Question: ${resolvedUserMessage}\n\nWeb Research Context:\n${browsingContext}\n\nPrevious Conversation:\n${historyWithDocs
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n')}`
    
    try {
      aiResponse = await callGroq(
        [{ role: 'user', content: contextualizedMessage }],
        selectedModel.includes('vyra') ? VYRA_MODEL_MOONSHOT : ASTRA_MODEL_SMART,
        stream,
        current_time,
        timezone,
        undefined,
        true,
        mindset,
        effectiveBeastMode
      )
      console.log(`Groq/Compound search completed for ${selectedModel} query: ${userMessage}`)
    } catch (error) {
      console.error('Groq/Compound search error:', error)
      try {
        const fallbackPrompt = `The web research system had an internal error, so you cannot use external sources or live web data for this reply. Answer the user's question using only your existing knowledge and reasoning. If the question clearly needs fresh or very specific real-world information, give your best short guess, clearly say that you might be wrong, and gently suggest that they ask again later with search ON if they need a more certain, sourced answer.\n\nUser Question: ${resolvedUserMessage}\n\nPrevious Conversation:\n${historyWithDocs
          .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
          .join('\n')}`

        aiResponse = await callGroq(
          [{ role: 'user', content: fallbackPrompt }],
          selectedModel.includes('vyra') ? VYRA_MODEL_MOONSHOT : ASTRA_MODEL_SMART,
          stream,
          current_time,
          timezone,
          undefined,
          false,
          mindset,
          effectiveBeastMode
        )
      } catch (fallbackError) {
        console.error('Groq/Compound fallback error:', fallbackError)
        const message =
          (fallbackError as any)?.message && typeof (fallbackError as any).message === 'string'
            ? (fallbackError as any).message
            : ''

        if (message.includes('No valid GROQ API keys')) {
          aiResponse =
            'Astra’s research engine is not configured correctly (no valid Groq API key was found). Vector search cannot run until you add GROQ_API_KEY_1 to your environment or disable Vector Search and deploy again.'
        } else {
          aiResponse =
            'Astra’s research and vector tools hit an internal error and are temporarily unavailable. Try turning Vector Search off for now or try again in a moment.'
        }
      }
    }
  } else {
    if (!searchEnabled) {
      const intent = detectInformationIntent(userMessage, historyWithDocs);

      if (intent.customResponse) {
        return NextResponse.json({ response: intent.customResponse });
      }

      if (intent.shouldSearch) {
        const guessPrompt = `Search is OFF, so you cannot use web search, live data, or external research tools for this reply. The user is asking for information that would usually rely on real-world sources.\n\nAnswer using only your existing knowledge and reasoning. Give your best short answer, but make it clear in your wording that this is a guess and might be wrong. At the very end of your answer, add one natural sentence encouraging the user to ask again later with search ON if they need a more certain, sourced answer. Do not just repeat this instruction verbatim; phrase it in your own natural voice.\n\nUser Question: ${userMessage}`

        try {
          aiResponse = await callGroq(
            [{ role: 'user', content: guessPrompt }],
            selectedModel,
            stream,
            current_time,
            timezone,
            undefined,
            false,
            mindset,
            effectiveBeastMode
          )
        } catch (error) {
          console.error('Groq offline-guess error:', error)
          aiResponse =
            "I tried to answer from my own knowledge without using web search, but I hit an internal error. Please try again later, or turn search ON if you need a more certain, sourced answer."
        }
      } else {
        const lastUserMessage =
          historyWithDocs
            .filter((m: { role: string }) => m.role === 'user')
            .slice(-1)[0]?.content || '';

        const knowledgeContext = '';

        const formattedHistory = historyWithDocs.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.content,
          ...(msg.role === 'assistant' ? { isResponse: true } : {})
        }));

        let contextualUserMessage = userMessage;
        if (historyWithDocs.length > 0) {
          const lastMessages = historyWithDocs.slice(-5);
          contextualUserMessage =
            lastMessages
              .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
              .join('\n') + `\n\nuser: ${userMessage}`;
        }

        const contextBuilder: string[] = [];
        if (lastUserMessage && !contextualUserMessage.includes(lastUserMessage)) {
          contextBuilder.push(`Previous topic: ${lastUserMessage}`);
        }

        const normalizedUser = userMessage.toLowerCase().trim();
        const isCheckFollowup =
          /\b(check|verify|double[-\s]?check|confirm|recheck|fact[-\s]?check)\b/.test(
            normalizedUser
          ) &&
          /\b(it|that|this|them|those|previous|above|answer|info|information)\b/.test(
            normalizedUser
          );

        if (isCheckFollowup) {
          const lastAssistantMessage =
            historyWithDocs
              .filter((m: { role: string }) => m.role === 'assistant')
              .slice(-1)[0]?.content || '';
          const topicReference = lastUserMessage || lastAssistantMessage;
          if (topicReference) {
            contextBuilder.push(
              `The user is asking you to check whether your previous answer about the following is correct: ${topicReference}`
            );
          }
        }

        const fullContext =
          contextBuilder.length > 0
            ? `${contextualUserMessage}\n\n${contextBuilder.join('\n')}`
            : contextualUserMessage;

        try {
          aiResponse = await callGroq(
            [
              {
                role: 'system',
                content: SYSTEM_PROMPT(
                  current_time,
                  timezone,
                  searchEnabled,
                  normalizeMindset(mindset),
                  effectiveBeastMode
                )
              },
              ...formattedHistory,
              {
                role: 'user',
                content: fullContext
              }
            ],
            selectedModel,
            stream,
            current_time,
            timezone,
            contextualUserMessage,
            searchEnabled,
            mindset,
            effectiveBeastMode
          );
        } catch (error) {
          console.error('Groq chat error:', error)
          aiResponse =
            'The chat system hit an internal error while generating this answer. Please try again in a moment or start a new chat if it continues.'
        }
      }
    }
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
      const summary = await callGroq([{ role: 'user', content: `Summarize this: ${text}` }], ASTRA_MODEL_FAST, false, current_time || new Date().toLocaleString(), timezone || 'UTC');
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
