export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          actor_user_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          priority: string
          read_at: string | null
          related_id: string | null
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          priority?: string
          read_at?: string | null
          related_id?: string | null
          title: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          priority?: string
          read_at?: string | null
          related_id?: string | null
          title?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          device: string | null
          event_type: string
          id: string
          metadata: Json | null
          path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      auth_failures: {
        Row: {
          created_at: string
          id: string
          identifier: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          kind?: string
        }
        Relationships: []
      }
      bot_filter_rules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          is_default: boolean
          label: string | null
          pattern: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          label?: string | null
          pattern: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          label?: string | null
          pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          part_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          part_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          part_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          admin_notes: string | null
          buyer_id: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          message: string
          part_id: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          buyer_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          message: string
          part_id: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          buyer_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          message?: string
          part_id?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      oem_research_cache: {
        Row: {
          cache_key: string
          created_at: string
          hit_count: number
          id: string
          last_hit_at: string | null
          query_text: string
          result: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          query_text: string
          result: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          query_text?: string
          result?: Json
          updated_at?: string
        }
        Relationships: []
      }
      oem_searches: {
        Row: {
          created_at: string
          id: string
          oem: string
          results_count: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          oem: string
          results_count?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          oem?: string
          results_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      part_alerts: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          keyword: string | null
          last_matched_at: string | null
          match_count: number
          model: string | null
          oem_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          last_matched_at?: string | null
          match_count?: number
          model?: string | null
          oem_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          last_matched_at?: string | null
          match_count?: number
          model?: string | null
          oem_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      part_requests: {
        Row: {
          admin_notes: string | null
          brand: string | null
          buyer_id: string | null
          category: string | null
          city: string | null
          created_at: string
          description: string | null
          email: string | null
          engine_code: string | null
          full_name: string
          id: string
          is_urgent: boolean
          message: string
          model: string | null
          notes: string | null
          oem_code: string | null
          part_name: string | null
          phone: string
          photos: string[]
          search_query: string | null
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          admin_notes?: string | null
          brand?: string | null
          buyer_id?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          engine_code?: string | null
          full_name: string
          id?: string
          is_urgent?: boolean
          message: string
          model?: string | null
          notes?: string | null
          oem_code?: string | null
          part_name?: string | null
          phone: string
          photos?: string[]
          search_query?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          admin_notes?: string | null
          brand?: string | null
          buyer_id?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          engine_code?: string | null
          full_name?: string
          id?: string
          is_urgent?: boolean
          message?: string
          model?: string | null
          notes?: string | null
          oem_code?: string | null
          part_name?: string | null
          phone?: string
          photos?: string[]
          search_query?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      part_views: {
        Row: {
          created_at: string
          id: string
          part_id: string
          view_date: string
          viewer_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          part_id: string
          view_date?: string
          viewer_key: string
        }
        Update: {
          created_at?: string
          id?: string
          part_id?: string
          view_date?: string
          viewer_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_views_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          admin_notes: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string
          created_at: string
          description: string | null
          engine_code: string | null
          id: string
          model: string | null
          oem_code: string | null
          oem_codes: string[]
          part_type: string | null
          photos: string[]
          price: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          stock_quantity: number
          title: string
          updated_at: string
          whatsapp: string
          year: number | null
        }
        Insert: {
          admin_notes?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          description?: string | null
          engine_code?: string | null
          id?: string
          model?: string | null
          oem_code?: string | null
          oem_codes?: string[]
          part_type?: string | null
          photos?: string[]
          price?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          stock_quantity?: number
          title: string
          updated_at?: string
          whatsapp: string
          year?: number | null
        }
        Update: {
          admin_notes?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          description?: string | null
          engine_code?: string | null
          id?: string
          model?: string | null
          oem_code?: string | null
          oem_codes?: string[]
          part_type?: string | null
          photos?: string[]
          price?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          stock_quantity?: number
          title?: string
          updated_at?: string
          whatsapp?: string
          year?: number | null
        }
        Relationships: []
      }
      phone_otp_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          last_sent_at: string
          phone: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          last_sent_at?: string
          phone: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_sent_at?: string
          phone?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          is_verified: boolean
          phone_verified_at: string | null
          updated_at: string
          verified_phone: string | null
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          is_approved?: boolean
          is_verified?: boolean
          phone_verified_at?: string | null
          updated_at?: string
          verified_phone?: string | null
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          is_verified?: boolean
          phone_verified_at?: string | null
          updated_at?: string
          verified_phone?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string | null
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string | null
          platform: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key?: string | null
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket_key?: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      request_quotes: {
        Row: {
          admin_notes: string | null
          condition: string | null
          created_at: string
          delivery_time: string | null
          id: string
          note: string | null
          price: number
          request_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          condition?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          note?: string | null
          price: number
          request_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          condition?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          note?: string | null
          price?: number
          request_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "open_part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          ip: string | null
          route: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          ip?: string | null
          route?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          ip?: string | null
          route?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seller_verifications: {
        Row: {
          account_type: string
          admin_notes: string | null
          city: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string
          id: string
          notes: string | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tax_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          admin_notes?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          admin_notes?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          commission_rate: number
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          email_from_address: string | null
          email_from_name: string | null
          email_smtp_host: string | null
          email_smtp_port: number | null
          ga4_measurement_id: string | null
          gsc_verification_code: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commission_rate?: number
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_smtp_host?: string | null
          email_smtp_port?: number | null
          ga4_measurement_id?: string | null
          gsc_verification_code?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commission_rate?: number
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_smtp_host?: string | null
          email_smtp_port?: number | null
          ga4_measurement_id?: string | null
          gsc_verification_code?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      open_part_requests: {
        Row: {
          brand: string | null
          category: string | null
          city: string | null
          created_at: string | null
          description: string | null
          engine_code: string | null
          id: string | null
          message: string | null
          model: string | null
          oem_code: string | null
          part_name: string | null
          photos: string[] | null
          search_query: string | null
          status: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          engine_code?: string | null
          id?: string | null
          message?: string | null
          model?: string | null
          oem_code?: string | null
          part_name?: string | null
          photos?: string[] | null
          search_query?: string | null
          status?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          engine_code?: string | null
          id?: string | null
          message?: string | null
          model?: string | null
          oem_code?: string | null
          part_name?: string | null
          photos?: string[] | null
          search_query?: string | null
          status?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_auth_lockout: { Args: { _identifier: string }; Returns: Json }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: Json
      }
      clear_auth_failures: { Args: { _identifier: string }; Returns: undefined }
      evaluate_part_stock: { Args: { _part_id: string }; Returns: Json }
      find_equivalent_parts: {
        Args: { _limit?: number; _part_id: string }
        Returns: {
          brand: string
          city: string
          condition: string
          id: string
          model: string
          oem_code: string
          oem_codes: string[]
          photos: string[]
          price: number
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          city: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          is_approved: boolean
          is_verified: boolean
          phone_verified_at: string
          updated_at: string
          verified_phone: string
          whatsapp: string
        }[]
      }
      get_oem_research: { Args: { _key: string }; Returns: Json }
      get_public_site_settings: {
        Args: never
        Returns: {
          contact_address: string
          contact_email: string
          contact_phone: string
          ga4_measurement_id: string
          gsc_verification_code: string
        }[]
      }
      get_urgent_request_for_supplier: {
        Args: { _id: string }
        Returns: {
          brand: string
          category: string
          city: string
          created_at: string
          id: string
          model: string
          notes: string
          oem_code: string
          part_name: string
          year: number
        }[]
      }
      get_vapid_public_key: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_urgent_requests_for_supplier: {
        Args: { _limit?: number }
        Returns: {
          brand: string
          category: string
          city: string
          created_at: string
          has_my_quote: boolean
          id: string
          model: string
          notes: string
          oem_code: string
          part_name: string
          year: number
        }[]
      }
      record_auth_failure: {
        Args: { _identifier: string; _kind: string }
        Returns: undefined
      }
      record_part_view: {
        Args: { _part_id: string; _viewer_key: string }
        Returns: number
      }
      request_center_stats: { Args: never; Returns: Json }
      save_oem_research: {
        Args: { _key: string; _query: string; _result: Json }
        Returns: undefined
      }
      search_parts_by_oem: {
        Args: { _limit?: number; _oem: string }
        Returns: {
          brand: string
          city: string
          condition: string
          id: string
          match_kind: string
          model: string
          oem_code: string
          oem_codes: string[]
          photos: string[]
          price: number
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      seller_demand_insights: {
        Args: { _range?: string }
        Returns: {
          active_requests: number
          alert_watchers: number
          brand: string
          model: string
          oem_codes: string[]
          part_id: string
          photos: string[]
          searches_30d: number
          searches_7d: number
          searches_today: number
          title: string
        }[]
      }
      stock_dashboard_stats: { Args: never; Returns: Json }
      top_demand_parts: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          oem: string
          request_count: number
          sample_brand: string
          sample_model: string
          sample_part_id: string
          sample_title: string
          search_count: number
        }[]
      }
      top_oem_searches: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          last_searched_at: string
          oem: string
          search_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
