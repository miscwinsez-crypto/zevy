import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase environment variables not configured');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Conversation {
  id?: string;
  user_email: string;
  trait: string;
  messages: string[];
  created_at?: string;
  updated_at: string;
}