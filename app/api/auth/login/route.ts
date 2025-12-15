import { NextRequest, NextResponse } from 'next/server'

const OWNER_EMAIL = 'miscwinsez@gmail.com'

// Simple rate limiting (in production, use Redis)
const loginAttempts = new Map<string, { count: number; resetTime: number }>()

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now()
  const attempt = loginAttempts.get(ip)
  
  if (!attempt || now > attempt.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 }) // 15 min window
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
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
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

    const isOwner = email === OWNER_EMAIL;
    
    // Demo response - Replace with actual Supabase auth when configured
    const userId = `user_${Buffer.from(email).toString('base64').slice(0, 16)}`
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64')

    return NextResponse.json({
      user_id: userId,
      email: email,
      token: token,
      name: email.split('@')[0],
      message: 'Login successful (Demo mode)',
      is_owner: isOwner,
      unlimited_access: isOwner
    }, {
      status: 200,
      headers: {
        'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
      }
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
