// API Keys management - Production ready

export const getGeminiKey = () => {
  return process.env.GEMINI_API_KEY_1;
}

export const getGroqKey = () => {
  return process.env.GROQ_API_KEY_1;
}

export const getFluxKey = () => {
  return process.env.FLUX_API_KEY_1;
}

export const validateKeys = () => {
  const keys = {
    gemini: !!process.env.GEMINI_API_KEY_1,
    groq: !!process.env.GROQ_API_KEY_1,
    flux: !!process.env.FLUX_API_KEY_1
  }

  if (!keys.groq && !keys.gemini) {
    console.warn('⚠️ No AI API keys configured (Groq or Gemini)')
  }

  return keys
}