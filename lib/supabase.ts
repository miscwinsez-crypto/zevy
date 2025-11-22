import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Conversation {
  id?: string;
  user_email: string;
  trait: string;
  messages: string[];
  created_at?: string;
  updated_at: string;
}