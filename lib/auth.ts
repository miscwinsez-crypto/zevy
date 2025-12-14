import { createClient } from './supabase/server'
import { Database } from './database.types'

export const verifyAuth = async (token: string): Promise<false | { valid: boolean; decoded: { email: string | undefined; user_id: string } }> => {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    return false
  }
  
  return {
    valid: true,
    decoded: {
      email: session.user.email,
      user_id: session.user.id
    }
  }
}
