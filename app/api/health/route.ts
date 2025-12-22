import { NextRequest, NextResponse } from 'next/server'
import {
  assertVercelOnly,
  validateVercelEnv,
  getVercelInfo,
  getVercelEnv,
  listConfiguredVercelVars
} from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * Health check endpoint - verify Vercel environment
 * GET /api/health
 */
export async function GET(request: NextRequest) {
  try {
    // Skip Vercel assertions in local development
    if (process.env.NODE_ENV !== 'development') {
      assertVercelOnly();
    }
    
    if (!supabase) {
      return NextResponse.json(
        {
          status: 'degraded',
          message: 'Supabase client not initialized',
          debug: {
            clientInitialized: false,
            envVariablesPresent: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            timestamp: new Date().toISOString()
          },
          vercel: getVercelInfo()
        },
        { status: 200 }
      );
    }
    
    // Validate all required keys
    const envCheck = validateVercelEnv()
    
    // Get API URL from Vercel
    const apiUrl = getVercelEnv('NEXT_PUBLIC_API_URL') || 'https://zevy-phi.vercel.app'
    
    // Get configured vars
    const configuredVars = listConfiguredVercelVars()
    
    return NextResponse.json({
      status: envCheck.valid ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      apiUrl: apiUrl,
      vercel: getVercelInfo(),
      environment: {
        configured: configuredVars.configured.length,
        total: configuredVars.allRequired.length,
        missing: envCheck.missing.length
      },
      ...(envCheck.missing.length > 0 && { missing: envCheck.missing })
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString(),
        vercel: getVercelInfo()
      },
      { status: 500 }
    )
  }
}
