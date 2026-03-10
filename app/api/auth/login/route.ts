import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/app/lib/supabase'
import { nextPublicOwnerEmail } from '@/app/lib/env'

const OWNER_EMAILS = [
  'miscwinsez@gmail.com',
  'noor.laily@gmail.com',
  'azrulhadi@gmail.com'
].concat(nextPublicOwnerEmail ? [nextPublicOwnerEmail] : [])

// Rate limiting with IP + UA fingerprint
const loginAttempts = new Map<string, { count: number; resetTime: number }>()

const checkRateLimit = (ip: string, userAgent: string): boolean => {
  const key = `${ip}:${userAgent || 'unknown'}`
  const now = Date.now()
  const attempt = loginAttempts.get(key)
  
  if (!attempt || now > attempt.resetTime) {
    loginAttempts.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 }) // 15 min window
    return true
  }
  
  if (attempt.count >= 5) {
    return false // Too many attempts
  }
  
  attempt.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ua = request.headers.get('user-agent') || 'unknown'
    
    if (!checkRateLimit(ip, ua)) {
      return NextResponse.json(
        { detail: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const { email, password } = await request.json()

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { detail: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Password validation
    if (password.length < 6) {
      return NextResponse.json(
        { detail: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const isOwner = OWNER_EMAILS.includes(email);

    const supabase = await createSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password),
    })

    if (error) {
      console.error('Supabase login error:', error.message)
      const messageText = (error.message || '').toLowerCase()

      const isKeyError =
        messageText.includes('invalid api key') ||
        messageText.includes('apikey') ||
        messageText.includes('api key is required') ||
        messageText.includes('jwt') ||
        messageText.includes('token')
      if (isKeyError) {
        return NextResponse.json(
          {
            detail:
              'Login service configuration is invalid (Supabase API key). Please update your Supabase keys in the environment.',
          },
          { status: 503 }
        )
      }

      const isFetchFailed = error.message === 'fetch failed'
      const status = isFetchFailed ? 503 : 401
      const message = isFetchFailed
        ? 'Login service is temporarily unavailable. Please try again in a little while.'
        : error.message || 'Invalid email or password'

      return NextResponse.json(
        { detail: message },
        { status }
      )
    }

    if (!data.session || !data.user) {
      return NextResponse.json(
        { detail: 'Invalid email or password' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        user_id: data.user.id,
        email: data.user.email,
        token: null,
        name: (data.user.email || '').split('@')[0],
        message: 'Login successful',
        is_owner: isOwner,
        unlimited_access: isOwner,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Login error:', error)
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
    const isConfigError =
      message.includes('supabase environment variables are not configured') ||
      message.includes('supabase url is invalid') ||
      message.includes('supabase url must use http or https')

    if (isConfigError) {
      return NextResponse.json(
        { detail: 'Login service configuration is invalid. Please try again in a little while.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
