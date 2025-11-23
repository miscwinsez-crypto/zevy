import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
import { getApiKey } from '@/lib/apiKeys';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables not configured');
}

export async function POST(request: Request) {
  try {
    const { message, trait, files, email, conversationId } = await request.json();
    
    // Creator account bypass
    const apiKey = getApiKey('GEMINI', email);
    
    // Save conversation to Supabase
    const { data, error } = await supabase
      .from('conversations')
      .upsert({
        id: conversationId || undefined,
        user_email: email,
        trait,
        messages: [message],
        updated_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    
    // Validate input
    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Check blocked keywords
    const blockedKeywords = [
      'suicide', 'self harm', 'kill myself', 
      // ... other blocked keywords from your list
    ];

    if (blockedKeywords.some(kw => message.toLowerCase().includes(kw))) {
      return NextResponse.json(
        { 
          error: 'Blocked content detected',
          supportNumbers: {
            US: '988',
            UK: '116 123',
            default: '988'
          }
        },
        { status: 403 }
      );
    }

    // Process based on trait
    let response;
    switch(trait) {
      case 'Astra':
        // Critical thinking/debate logic
        break;
      case 'Nova':
        // Image generation logic
        break;
      default:
        // Default Vyra response
    }

    return NextResponse.json(response);

  } catch (err) {
    const error = err as Error;
    console.error({
      message: error.message,
      stack: error.stack,
      supabaseUrl: supabaseUrl ? 'configured' : 'missing',
      supabaseKey: supabaseKey ? 'configured' : 'missing'
    });
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';