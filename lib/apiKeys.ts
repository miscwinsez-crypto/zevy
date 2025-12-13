// API Keys management - Production ready

export const getGroqKey = () => {
  return process.env.GROQ_API_KEY_1;
}

export const getFluxKey = () => {
  return process.env.FLUX_API_KEY_1;
}

export const validateKeys = () => {
  const keys = {
    groq: !!process.env.GROQ_API_KEY_1,
    flux: !!process.env.FLUX_API_KEY_1
  }

  if (!keys.groq) {
    console.warn('⚠️ No Groq API key configured')
  }

  return keys
}
