import { NextRequest, NextResponse } from 'next/server'

// Track active sessions (in production, use Redis/database)
const activeSessions = new Set<string>()

export async function POST(request: NextRequest) {
  try {
    // Get auth token from cookie or header
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { detail: 'No active session found' },
        { status: 401 }
      )
    }

    // Invalidate session
    activeSessions.delete(token)

    return NextResponse.json(
      { message: 'Logged out successfully' },
      {
        status: 200,
        headers: {
          'Set-Cookie': `auth_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        },
      }
    )
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}