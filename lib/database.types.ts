// Type definitions for Supabase database tables
export type Database = {
  public: {
    Tables: {
      user_usage: {
        Row: {
          id: string
          user_id: string
          model_type: 'vyra' | 'astra'
          usage_count: number
          last_reset: string
        }
        Insert: {
          id?: string
          user_id: string
          model_type: 'vyra' | 'astra'
          usage_count?: number
          last_reset?: string
        }
        Update: {
          id?: string
          user_id?: string
          model_type?: 'vyra' | 'astra'
          usage_count?: number
          last_reset?: string
        }
      }
    }
  }
}
