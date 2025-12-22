import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/app/lib/supabase'

// Mark route as dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseClient()
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error || !session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      email: session.user.email,
      user_id: session.user.id,
    })
  } catch (error: any) {
    console.error('Verify error:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
