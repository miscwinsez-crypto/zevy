import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getVercelEnv } from './env'

const supabaseUrl = getVercelEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey = getVercelEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

if (supabaseUrl && supabaseAnonKey) {
  try {
    const parsedUrl = new URL(supabaseUrl)
    supabaseClient = createClient<Database>(parsedUrl.toString(), supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
    supabaseClient = null
  }
}

export const supabase = supabaseClient

export interface Conversation {
  id?: string
  user_email: string
  trait: string
  messages: any[]
  created_at?: string
  updated_at: string
}
