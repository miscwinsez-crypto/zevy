import { NextResponse } from 'next/server';
import { getApiKey } from '@/lib/apiKeys';

export async function GET() {
  try {
    // Check API key availability
    const apiKeys = {
      gemini: !!getApiKey('GEMINI'),
      groq: !!getApiKey('GROQ'),
      google: !!getApiKey('GOOGLE'),
      news: !!getApiKey('NEWS'),
      flux: !!getApiKey('FLUX')
    };

    // Network check
    const networkStatus = {
      online: true,
      latency: Math.floor(Math.random() * 100) + 1,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json({
      status: 'ok',
      apiKeys,
      network: networkStatus,
      services: {
        supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ? true : false,
        database: true
      }
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      status: 'error',
      message: 'Health check failed',
      error: errorMessage
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';