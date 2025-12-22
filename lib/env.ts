/**
 * VERCEL ONLY - Strict environment variable access
 * Reads ONLY from Vercel (process.env at runtime)
 * No .env.local, no .env.development, no fallbacks
 */

const ALLOWED_VERCEL_VARS = new Set([
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'NODE_ENV',
  'BACKEND_URL',
  'NEXT_PUBLIC_API_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'GROQ_API_KEY_1',
  'GROQ_API_KEY_2',
  'GROQ_API_KEY_3',
  'GROQ_API_KEY_4',
  'GROQ_API_KEY_5',
  'GROQ_API_KEY_6',
  'GROQ_API_KEY_7',
  'GROQ_API_KEY_8',
  'GROQ_API_KEY_9',
  'GROQ_API_KEY_10',
  'FLUX_API_KEY_1',
  'FLUX_API_KEY_2',
  'FLUX_API_KEY_3',
  'GOOGLE_API_KEY_1',
  'GOOGLE_API_KEY_2',
  'GOOGLE_API_KEY_3',
  'GOOGLE_SEARCH_ENGINE_ID',
  'NEWS_API_KEY_1',
  'NEWS_API_KEY_2',
  'OPENWEATHER_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_URL',
  'OWNER_EMAIL',
  'EDGE_CONFIG',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_URL'
])

/**
 * VERCEL ONLY: Get required env var from process.env
 * Throws if not found
 */
export function requireVercelEnv(key: string): string {
  if (!ALLOWED_VERCEL_VARS.has(key)) {
    throw new Error(`❌ Unauthorized variable: ${key}`)
  }

  const value = process.env[key]?.trim()

  if (!value) {
    throw new Error(
      `❌ MISSING FROM VERCEL: ${key}\n` +
      `Add to Vercel Dashboard:\n` +
      `Settings → Environment Variables → Add "${key}"\n` +
      `Apply to: Production, Preview, Development`
    )
  }

  return value
}

/**
 * VERCEL ONLY: Get optional env var from process.env
 */
export function getVercelEnv(key: string): string | undefined {
  if (!ALLOWED_VERCEL_VARS.has(key)) {
    console.warn(`⚠️ Unauthorized variable access: ${key}`)
    return undefined
  }
  return process.env[key]?.trim()
}

/**
 * VERCEL ONLY: Validate required API keys exist
 */
export function validateVercelEnv(): {
  valid: boolean
  missing: string[]
} {
  const required = [
    'GROQ_API_KEY_1',
    'FLUX_API_KEY_1',
    'NEXT_PUBLIC_API_URL'
  ]

  const missing = required.filter(key => !process.env[key]?.trim())

  if (missing.length > 0) {
    console.error('❌ Missing Vercel environment variables:', missing)
  }

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * VERCEL ONLY: Assert we're running on Vercel
 */
export function assertVercelOnly(): void {
  if (!process.env.VERCEL) {
    throw new Error(
      '❌ NOT ON VERCEL\n' +
      'This application ONLY works on Vercel.\n' +
      'Local development is not supported.\n' +
      'All API keys are stored in Vercel secrets.\n' +
      'Deploy to: https://vercel.com/new'
    )
  }
}

/**
 * VERCEL ONLY: Get Vercel environment info
 */
export function getVercelInfo() {
  return {
    onVercel: !!process.env.VERCEL,
    environment: process.env.VERCEL_ENV || 'unknown',
    url: process.env.VERCEL_URL || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown'
  }
}

/**
 * VERCEL ONLY: List all configured Vercel vars
 */
export function listConfiguredVercelVars() {
  const configured = Array.from(ALLOWED_VERCEL_VARS).filter(key => !!process.env[key])
  return {
    total: configured.length,
    configured: configured,
    allRequired: Array.from(ALLOWED_VERCEL_VARS)
  }
}
