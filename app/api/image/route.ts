import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { assertVercelOnly, requireVercelEnv } from '@/lib/env'
import { supabase } from '@/lib/supabase'

// Special handler for owner image requests
async function handleOwnerImageRequest(prompt: string): Promise<NextResponse> {
  try {
    // Enforce Vercel-only and ensure Flux key exists
    assertVercelOnly()
    const fluxKey = requireVercelEnv('FLUX_API_KEY_1')

    const response = await axios.post(
      'https://api.flux.ai/v1/flux-pro',
      {
        prompt: prompt,
        width: 1024,
        height: 1024,
        steps: 50,
        guidance_scale: 7.5,
        model: 'stable-diffusion-xl'
      },
      {
        headers: {
          'x-key': fluxKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 60000
      }
    )

    return NextResponse.json({
      image_url: response.data.result.sample,
      prompt: prompt,
      owner_mode: true
    })
  } catch (error: any) {
    console.error('Owner image error:', error.message)
    return NextResponse.json(
      { 
        detail: error.message || 'Failed to generate image',
        owner_mode: true 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Image generation is not available, may be coming in future updates' },
    { status: 200 }
  );
}