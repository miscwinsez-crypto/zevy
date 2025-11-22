import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getApiKey } from '@/lib/apiKeys';

if (!supabase) {
  throw new Error('Supabase client not initialized');
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

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';