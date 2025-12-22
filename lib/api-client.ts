// Network and API utilities for connecting to the deployment
// Always use relative URLs in the browser to avoid cross-origin and stale host issues.
// On the server we still respect NEXT_PUBLIC_API_URL if it is set.
const API_URL =
  typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : '';

const makeUrl = (path: string) => {
  if (!API_URL) return path;
  const base = API_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

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
    const response = await fetch(makeUrl('/api/health'), {
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
    const response = await fetch(makeUrl('/api/health'), {
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
      chat: makeUrl('/api/chat'),
      health: makeUrl('/api/health'),
      image: makeUrl('/api/image')
    }
  }
}
