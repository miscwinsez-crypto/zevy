import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { getVercelEnv } from '@/lib/env'

export const createSupabaseClient = async () => {
  const supabaseUrl = getVercelEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey = getVercelEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(supabaseUrl)
  } catch {
    throw new Error('Supabase URL is invalid. Check NEXT_PUBLIC_SUPABASE_URL in the environment.')
  }

  if (!parsedUrl.protocol.startsWith('http')) {
    throw new Error('Supabase URL must use http or https.')
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    parsedUrl.toString(),
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {}
        }
      }
    }
  )
}
