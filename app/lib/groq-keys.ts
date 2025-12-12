import { groqApiKey1, groqApiKey2, groqApiKey3, groqApiKey4, groqApiKey5, groqApiKey6, groqApiKey7, groqApiKey8, groqApiKey9, groqApiKey10 } from './env';

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
].filter(Boolean) as string[];

if (groqApiKeys.length === 0) {
  // Silent warning - no console output to avoid browser errors
  // The error will be handled gracefully by the calling functions
}

let currentKeyIndex = 0;

export function getGroqApiKey(): string {
  if (groqApiKeys.length === 0) {
    // Return empty string instead of throwing error
    // This allows graceful degradation
    return '';
  }
  const key = groqApiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % groqApiKeys.length;
  return key;
}