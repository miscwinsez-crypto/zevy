import { NextRequest, NextResponse } from 'next/server'

// Mark route as dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value || 
                  request.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      )
    }

    // In production, verify token with database/Redis
    // For now, decode base64 token
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const [email] = decoded.split(':')

      return NextResponse.json({
        authenticated: true,
        email: email,
        user_id: `user_${Buffer.from(email).toString('base64').slice(0, 16)}`
      })
    } catch (e) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      )
    }
  } catch (error: any) {
    console.error('Verify error:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
