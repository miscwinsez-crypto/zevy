import { createSupabaseClient } from './supabase'

interface UsageData {
  user_id: string
  model_type: 'vyra' | 'astra'
  usage_count: number
  last_reset: string
}

const VYRA_DAILY_LIMIT = 25
const ASTRA_DAILY_LIMIT = 125

// Skip reset for guest users (empty user_id)
const shouldResetUsage = (userId: string) => {
  return userId && userId !== 'guest'
}

export async function getUserUsage(userId: string, modelType: 'vyra' | 'astra'): Promise<{ usage: number; limit: number; remaining: number }> {
  const supabase = createSupabaseClient()
  
  try {
    const { data, error } = await supabase
      .from('user_usage')
      .select('usage_count, last_reset')
      .eq('user_id', userId)
      .eq('model_type', modelType)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching usage data:', error)
      return { usage: 0, limit: modelType === 'vyra' ? VYRA_DAILY_LIMIT : ASTRA_DAILY_LIMIT, remaining: modelType === 'vyra' ? VYRA_DAILY_LIMIT : ASTRA_DAILY_LIMIT }
    }

    const now = new Date()
    const limit = modelType === 'vyra' ? VYRA_DAILY_LIMIT : ASTRA_DAILY_LIMIT
    
    if (!data) {
      // First time user, create usage record
      await supabase.from('user_usage').insert([
        {
          user_id: userId,
          model_type: modelType,
          usage_count: 0,
          last_reset: now.toISOString()
        }
      ])
      return { usage: 0, limit, remaining: limit }
    }

    const lastReset = new Date(data.last_reset)
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60)

    // Reset if more than 24 hours have passed and not guest
    if (hoursSinceReset >= 24 && shouldResetUsage(userId)) {
      await supabase
        .from('user_usage')
        .update({ usage_count: 0, last_reset: now.toISOString() })
        .eq('user_id', userId)
        .eq('model_type', modelType)
      
      return { usage: 0, limit, remaining: limit }
    }

    const remaining = Math.max(0, limit - data.usage_count)
    return { usage: data.usage_count, limit, remaining }
  } catch (error) {
    console.error('Error in getUserUsage:', error)
    const limit = modelType === 'vyra' ? VYRA_DAILY_LIMIT : ASTRA_DAILY_LIMIT
    return { usage: 0, limit, remaining: limit }
  }
}

export async function incrementUserUsage(userId: string, modelType: 'vyra' | 'astra'): Promise<boolean> {
  const supabase = createSupabaseClient()
  
  try {
    const { data: existingData } = await supabase
      .from('user_usage')
      .select('usage_count, last_reset')
      .eq('user_id', userId)
      .eq('model_type', modelType)
      .single()

    const now = new Date()
    
    if (!existingData) {
      // Create new record
      const { error } = await supabase.from('user_usage').insert([
        {
          user_id: userId,
          model_type: modelType,
          usage_count: 1,
          last_reset: now.toISOString()
        }
      ])
      return !error
    }

    const lastReset = new Date(existingData.last_reset)
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60)

    let newCount: number
    if (hoursSinceReset >= 24 && shouldResetUsage(userId)) {
      // Reset counter if 24+ hours have passed and not guest
      newCount = 1
    } else {
      // Increment existing counter
      newCount = existingData.usage_count + 1
    }

    const limit = modelType === 'vyra' ? VYRA_DAILY_LIMIT : ASTRA_DAILY_LIMIT
    
    // Check if limit exceeded
    if (newCount > limit) {
      return false
    }

    const { error } = await supabase
      .from('user_usage')
      .update({ 
        usage_count: newCount, 
        last_reset: hoursSinceReset >= 24 ? now.toISOString() : existingData.last_reset 
      })
      .eq('user_id', userId)
      .eq('model_type', modelType)

    return !error
  } catch (error) {
    console.error('Error in incrementUserUsage:', error)
    return false
  }
}