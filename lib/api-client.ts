// Network and API utilities for connecting to Vercel deployment

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface ChatRequest {
  message: string
  conversation_history?: Array<{ role: string; content: string }>
  mode?: 'astra' | 'vyra' | 'nova' | 'auto'
  trait?: string
  is_owner?: boolean
}

export interface ChatResponse {
  response: string
  mode_used: string
  reasoning: string
  image_url?: string
}

export interface HealthCheck {
  status: string
  timestamp: string
  environment: {
    NODE_ENV: string
    VERCEL: boolean
    VERCEL_ENV: string
    API_URL: string
  }
  apiKeys: {
    groq: boolean
    gemini: boolean
    flux: boolean
  }
  services: {
    groq: string
    gemini: string
    flux: string
  }
}

/**
 * Check API health status
 */
export async function checkHealth(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }

    return await response.json()
  } catch (error: any) {
    console.error('Health Check Error:', error)
    throw error
  }
}

/**
 * Test internet connectivity
 */
export async function testConnectivity(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'HEAD'
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get API configuration
 */
export function getApiConfig() {
  return {
    baseUrl: API_URL,
    endpoints: {
      chat: `${API_URL}/api/chat`,
      health: `${API_URL}/api/health`,
      image: `${API_URL}/api/image`
    }
  }
}