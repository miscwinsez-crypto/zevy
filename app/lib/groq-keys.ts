import {
  groqApiKey1,
  groqApiKey2,
  groqApiKey3,
  groqApiKey4,
  groqApiKey5,
  groqApiKey6,
  groqApiKey7,
  groqApiKey8,
  groqApiKey9,
  groqApiKey10
} from './env'

export const groqApiKeys = [
  groqApiKey1,
  groqApiKey2,
  groqApiKey3,
  groqApiKey4,
  groqApiKey5,
  groqApiKey6,
  groqApiKey7,
  groqApiKey8,
  groqApiKey9,
  groqApiKey10
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
