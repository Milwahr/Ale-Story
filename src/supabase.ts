import { createClient } from '@supabase/supabase-js'

type StoredAttachment = {
  id: string
  name: string
  type: string
  path: string
}

type Database = {
  public: {
    Tables: {
      entries: {
        Row: {
          id: string
          owner_id: string
          date: string
          title: string
          location: string
          body: string
          attachments: StoredAttachment[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          owner_id: string
          date: string
          title: string
          location: string
          body: string
          attachments: StoredAttachment[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          date?: string
          title?: string
          location?: string
          body?: string
          attachments?: StoredAttachment[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
export const supabase = isSupabaseConfigured ? createClient<Database>(supabaseUrl, supabaseKey) : null
