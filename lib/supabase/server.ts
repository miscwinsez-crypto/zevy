import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireVercelEnv } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = requireVercelEnv('SUPABASE_URL')

  const supabaseKey =
    requireVercelEnv('SUPABASE_SERVICE_KEY') ||
    requireVercelEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
          }
        }
      }
    }
  )
}
