import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('- NEXT_PUBLIC_SUPABASE_ANON_KEY:', !!supabaseAnonKey)
} else {
  try {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
  }
}

export const supabase = supabaseClient

export interface Conversation {
  id?: string;
  user_email: string;
  trait: string;
  messages: string[];
  created_at?: string;
  updated_at: string;
}