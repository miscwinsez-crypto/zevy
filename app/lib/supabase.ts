
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { getVercelEnv } from '@/lib/env'

export const createSupabaseClient = () => {
  const supabaseUrl = getVercelEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey = getVercelEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createRouteHandlerClient<Database>({ cookies }, {
    supabaseUrl,
    supabaseKey
  })
}
