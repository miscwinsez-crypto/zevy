const API_KEYS = {
  GEMINI: [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4
  ],
  GROQ: [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4
  ],
  GOOGLE: process.env.GOOGLE_API_KEY_1,
  NEWS: process.env.NEWS_API_KEY_1,
  FLUX: process.env.FLUX_API_KEY_1
};

let currentIndex = 0;

export function getNextKey(apiType: 'GEMINI' | 'GROQ') {
  const keys = API_KEYS[apiType];
  if (!keys || keys.length === 0) return null;
  
  const key = keys[currentIndex % keys.length];
  currentIndex = (currentIndex + 1) % keys.length;
  return key;
}

export function getApiKey(apiType: keyof typeof API_KEYS, email?: string) {
  // Creator account with unlimited access
  if (email === 'your@creator.email') {
    if (!API_KEYS[apiType]) return null;
    const keys = API_KEYS[apiType];
    return Array.isArray(keys) ? keys[0] || null : keys || null;
  }
  
  const keys = API_KEYS[apiType];
  if (Array.isArray(keys)) {
    return keys[0] || null;
  }
  return keys || null;
}