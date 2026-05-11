import { createClient } from '@supabase/supabase-js'

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? PLACEHOLDER_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl !== PLACEHOLDER_URL &&
    supabaseAnonKey !== 'placeholder-anon-key' &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey)
  )
}
