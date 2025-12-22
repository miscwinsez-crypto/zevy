import { getVercelEnv } from '@/lib/env'

export const groqApiKeys = [
  getVercelEnv('GROQ_API_KEY_1'),
  getVercelEnv('GROQ_API_KEY_2'),
  getVercelEnv('GROQ_API_KEY_3'),
  getVercelEnv('GROQ_API_KEY_4'),
  getVercelEnv('GROQ_API_KEY_5'),
  getVercelEnv('GROQ_API_KEY_6'),
  getVercelEnv('GROQ_API_KEY_7'),
  getVercelEnv('GROQ_API_KEY_8'),
  getVercelEnv('GROQ_API_KEY_9'),
  getVercelEnv('GROQ_API_KEY_10'),
].filter(Boolean) as string[]

let currentKeyIndex = 0

export function getGroqApiKeys(): string[] {
  return groqApiKeys
}

export function getCurrentGroqKeyIndex(): number {
  return currentKeyIndex
}

export function setCurrentGroqKeyIndex(index: number) {
  if (groqApiKeys.length === 0) {
    currentKeyIndex = 0
    return
  }
  const normalized = ((index % groqApiKeys.length) + groqApiKeys.length) % groqApiKeys.length
  currentKeyIndex = normalized
}

export function advanceGroqKeyIndex() {
  if (groqApiKeys.length === 0) return
  currentKeyIndex = (currentKeyIndex + 1) % groqApiKeys.length
}

export function markGroqKeySuccessful(indexUsed: number) {
  // After a successful call, continue from the next key to spread load.
  if (groqApiKeys.length === 0) return
  setCurrentGroqKeyIndex(indexUsed + 1)
}

// Legacy helper: still returns a key, but round-robins every call.
export function getGroqApiKey(): string {
  if (groqApiKeys.length === 0) {
    return ''
  }
  const key = groqApiKeys[currentKeyIndex]
  advanceGroqKeyIndex()
  return key
}
