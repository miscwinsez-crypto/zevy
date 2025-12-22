import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/app/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseClient()
    await supabase.auth.signOut()
    return NextResponse.json({ message: 'Logged out successfully' }, { status: 200 })
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    )
  }
}
