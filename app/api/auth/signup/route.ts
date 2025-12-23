import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/app/lib/supabase'

// Simple signup rate limiting
const signupAttempts = new Map<string, { count: number; resetTime: number }>()

const checkSignupRateLimit = (ip: string): boolean => {
  const now = Date.now()
  const attempt = signupAttempts.get(ip)
  
  if (!attempt || now > attempt.resetTime) {
    signupAttempts.set(ip, { count: 1, resetTime: now + 60 * 60 * 1000 }) // 1 hour window
    return true
  }
  
  if (attempt.count >= 3) {
    return false // Too many signups from same IP
  }
  
  attempt.count++
  return true
}

const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' }
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' }
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }
  
  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    
    if (!checkSignupRateLimit(ip)) {
      return NextResponse.json(
        { detail: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const { email, password, confirmPassword } = await request.json()

    // Validation
    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        { detail: 'Email, password, and password confirmation are required' },
        { status: 400 }
      )
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { detail: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Password match
    if (password !== confirmPassword) {
      return NextResponse.json(
        { detail: 'Passwords do not match' },
        { status: 400 }
      )
    }

    // Password strength validation
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { detail: passwordValidation.error },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email: String(email).trim(),
      password: String(password),
    })

    if (error) {
      console.error('Supabase signup error:', error.message)
      const isFetchFailed = error.message === 'fetch failed'
      const status = isFetchFailed ? 503 : 400
      const message = isFetchFailed
        ? 'Signup service is temporarily unavailable. Please try again in a little while.'
        : error.message || 'Signup failed. Please check your details and try again.'

      return NextResponse.json({ detail: message }, { status })
    }

    return NextResponse.json(
      {
        user_id: data.user?.id ?? null,
        email: data.user?.email ?? String(email).trim(),
        token: null,
        name: String(email).split('@')[0],
        message: data.session
          ? 'Account created successfully'
          : 'Account created. Check your email to confirm your account.',
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Signup error:', error)
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
    const isConfigError =
      message.includes('supabase environment variables are not configured') ||
      message.includes('supabase url is invalid') ||
      message.includes('supabase url must use http or https')

    if (isConfigError) {
      return NextResponse.json(
        { detail: 'Signup service configuration is invalid. Please try again in a little while.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
