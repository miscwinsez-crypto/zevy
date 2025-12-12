// Type definitions for Supabase database tables
export type Database = {
  public: {
    Tables: {
      user_usage: {
        Row: {
          id: string
          user_id: string
          request_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          request_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          request_count?: number
          created_at?: string
        }
      }
    }
  }
}