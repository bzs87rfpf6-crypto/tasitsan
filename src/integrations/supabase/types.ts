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
      admin_notification_prefs: {
        Row: {
          email_recipients: string[]
          id: number
          sound_enabled: boolean
          updated_at: string
        }
        Insert: {
          email_recipients?: string[]
          id?: number
          sound_enabled?: boolean
          updated_at?: string
        }
        Update: {
          email_recipients?: string[]
          id?: number
          sound_enabled?: boolean
          updated_at?: string
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
      ai_content_cache: {
        Row: {
          content: Json
          expires_at: string | null
          generated_at: string
          id: string
          model: string | null
          quality_score: number
          scope: string
          scope_key: string
        }
        Insert: {
          content: Json
          expires_at?: string | null
          generated_at?: string
          id?: string
          model?: string | null
          quality_score?: number
          scope: string
          scope_key: string
        }
        Update: {
          content?: Json
          expires_at?: string | null
          generated_at?: string
          id?: string
          model?: string | null
          quality_score?: number
          scope?: string
          scope_key?: string
        }
        Relationships: []
      }
      ai_search_logs: {
        Row: {
          ai_model: string | null
          cache_hit: boolean
          candidate_oems: string[]
          clarification_shown: boolean
          clicked_part_id: string | null
          confidence: number
          confidence_tier: string
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          intent: Json
          is_favorite: boolean
          oem_refs_found: number
          parts_found: number
          purchase_completed: boolean
          query: string
          request_created: boolean
          session_id: string | null
          similar_oems_found: number
          stage_reached: string | null
          updated_at: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          ai_model?: string | null
          cache_hit?: boolean
          candidate_oems?: string[]
          clarification_shown?: boolean
          clicked_part_id?: string | null
          confidence?: number
          confidence_tier?: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          intent?: Json
          is_favorite?: boolean
          oem_refs_found?: number
          parts_found?: number
          purchase_completed?: boolean
          query: string
          request_created?: boolean
          session_id?: string | null
          similar_oems_found?: number
          stage_reached?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          ai_model?: string | null
          cache_hit?: boolean
          candidate_oems?: string[]
          clarification_shown?: boolean
          clicked_part_id?: string | null
          confidence?: number
          confidence_tier?: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          intent?: Json
          is_favorite?: boolean
          oem_refs_found?: number
          parts_found?: number
          purchase_completed?: boolean
          query?: string
          request_created?: boolean
          session_id?: string | null
          similar_oems_found?: number
          stage_reached?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          device: string | null
          duration_ms: number | null
          engagement: string | null
          event_type: string
          fingerprint: string | null
          id: string
          is_bot: boolean
          is_internal: boolean
          metadata: Json | null
          path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          visitor_id: string | null
          visitor_key: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type: string
          fingerprint?: string | null
          id?: string
          is_bot?: boolean
          is_internal?: boolean
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
          visitor_key?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type?: string
          fingerprint?: string | null
          id?: string
          is_bot?: boolean
          is_internal?: boolean
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
          visitor_key?: string | null
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
      demand_events: {
        Row: {
          city: string | null
          created_at: string
          id: string
          ip_hash: string | null
          results_count: number
          signal_id: string
          source: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          results_count?: number
          signal_id: string
          source?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          results_count?: number
          signal_id?: string
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_events_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "demand_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_signals: {
        Row: {
          ai_note: string | null
          brand: string | null
          category: string | null
          count_30d: number
          count_7d: number
          created_at: string
          dedupe_key: string
          first_seen_at: string
          fulfilled_at: string | null
          fulfilled_part_id: string | null
          id: string
          in_stock_count: number
          keyword: string | null
          keyword_key: string | null
          last_seen_at: string
          model: string | null
          oem_code: string | null
          oem_normalized: string | null
          part_name: string | null
          repeat_ratio: number
          score: number
          search_count: number
          status: string
          tier: string
          unique_users: number
          updated_at: string
          vehicle_class: string | null
          year: number | null
        }
        Insert: {
          ai_note?: string | null
          brand?: string | null
          category?: string | null
          count_30d?: number
          count_7d?: number
          created_at?: string
          dedupe_key: string
          first_seen_at?: string
          fulfilled_at?: string | null
          fulfilled_part_id?: string | null
          id?: string
          in_stock_count?: number
          keyword?: string | null
          keyword_key?: string | null
          last_seen_at?: string
          model?: string | null
          oem_code?: string | null
          oem_normalized?: string | null
          part_name?: string | null
          repeat_ratio?: number
          score?: number
          search_count?: number
          status?: string
          tier?: string
          unique_users?: number
          updated_at?: string
          vehicle_class?: string | null
          year?: number | null
        }
        Update: {
          ai_note?: string | null
          brand?: string | null
          category?: string | null
          count_30d?: number
          count_7d?: number
          created_at?: string
          dedupe_key?: string
          first_seen_at?: string
          fulfilled_at?: string | null
          fulfilled_part_id?: string | null
          id?: string
          in_stock_count?: number
          keyword?: string | null
          keyword_key?: string | null
          last_seen_at?: string
          model?: string | null
          oem_code?: string | null
          oem_normalized?: string | null
          part_name?: string | null
          repeat_ratio?: number
          score?: number
          search_count?: number
          status?: string
          tier?: string
          unique_users?: number
          updated_at?: string
          vehicle_class?: string | null
          year?: number | null
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
          {
            foreignKeyName: "favorites_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_deals: {
        Row: {
          created_at: string
          featured_date: string
          id: string
          is_active: boolean
          part_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          featured_date?: string
          id?: string
          is_active?: boolean
          part_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          featured_date?: string
          id?: string
          is_active?: boolean
          part_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "featured_deals_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_deals_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_items: {
        Row: {
          action: string
          batch_id: string
          created_at: string
          id: string
          part_id: string
          user_id: string
        }
        Insert: {
          action?: string
          batch_id: string
          created_at?: string
          id?: string
          part_id: string
          user_id: string
        }
        Update: {
          action?: string
          batch_id?: string
          created_at?: string
          id?: string
          part_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          fail_count: number
          file_name: string | null
          id: string
          mode: string
          source: string
          status: string
          success_count: number
          total_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          fail_count?: number
          file_name?: string | null
          id?: string
          mode?: string
          source?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          fail_count?: number
          file_name?: string | null
          id?: string
          mode?: string
          source?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      indexnow_queue: {
        Row: {
          attempts: number
          enqueued_at: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          url: string
        }
        Insert: {
          attempts?: number
          enqueued_at?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          url: string
        }
        Update: {
          attempts?: number
          enqueued_at?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          url?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "inquiries_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_registry: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          indexable: boolean
          kind: string
          last_scored_at: string
          listings_count: number
          model: string | null
          oem: string | null
          quality_score: number
          slug: string
          unique_oems: number
          unique_vehicles: number
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          indexable?: boolean
          kind: string
          last_scored_at?: string
          listings_count?: number
          model?: string | null
          oem?: string | null
          quality_score?: number
          slug: string
          unique_oems?: number
          unique_vehicles?: number
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          indexable?: boolean
          kind?: string
          last_scored_at?: string
          listings_count?: number
          model?: string | null
          oem?: string | null
          quality_score?: number
          slug?: string
          unique_oems?: number
          unique_vehicles?: number
        }
        Relationships: []
      }
      live_chat_conversations: {
        Row: {
          assigned_admin: string | null
          closed_at: string | null
          created_at: string
          device_meta: Json
          id: string
          initiated_by: string
          last_message_at: string
          last_message_preview: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["live_chat_status"]
          subject: string | null
          unread_admin: number
          unread_visitor: number
          updated_at: string
          user_id: string | null
          user_meta: Json
          visitor_id: string | null
        }
        Insert: {
          assigned_admin?: string | null
          closed_at?: string | null
          created_at?: string
          device_meta?: Json
          id?: string
          initiated_by?: string
          last_message_at?: string
          last_message_preview?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["live_chat_status"]
          subject?: string | null
          unread_admin?: number
          unread_visitor?: number
          updated_at?: string
          user_id?: string | null
          user_meta?: Json
          visitor_id?: string | null
        }
        Update: {
          assigned_admin?: string | null
          closed_at?: string | null
          created_at?: string
          device_meta?: Json
          id?: string
          initiated_by?: string
          last_message_at?: string
          last_message_preview?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["live_chat_status"]
          subject?: string | null
          unread_admin?: number
          unread_visitor?: number
          updated_at?: string
          user_id?: string | null
          user_meta?: Json
          visitor_id?: string | null
        }
        Relationships: []
      }
      live_chat_messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          conversation_id: string
          created_at: string
          id: string
          message: string | null
          seen_at: string | null
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["live_chat_sender"]
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          message?: string | null
          seen_at?: string | null
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["live_chat_sender"]
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          message?: string | null
          seen_at?: string | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["live_chat_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "live_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_notes: {
        Row: {
          admin_id: string
          conversation_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          admin_id: string
          conversation_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          admin_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "live_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_visitor_sessions: {
        Row: {
          created_at: string
          last_path: string | null
          last_seen_at: string
          session_id: string
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          last_path?: string | null
          last_seen_at?: string
          session_id: string
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          last_path?: string | null
          last_seen_at?: string
          session_id?: string
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      oem_catalog: {
        Row: {
          alternative_oems: string[]
          brand: string | null
          created_at: string
          id: string
          normalized_alternative_oems: string[]
          normalized_oem: string
          normalized_part_name: string
          oem_no: string
          part_name: string
          source_catalog: string
          updated_at: string
          vehicle_model: string | null
          vehicle_year: string | null
        }
        Insert: {
          alternative_oems?: string[]
          brand?: string | null
          created_at?: string
          id?: string
          normalized_alternative_oems?: string[]
          normalized_oem: string
          normalized_part_name: string
          oem_no: string
          part_name: string
          source_catalog?: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_year?: string | null
        }
        Update: {
          alternative_oems?: string[]
          brand?: string | null
          created_at?: string
          id?: string
          normalized_alternative_oems?: string[]
          normalized_oem?: string
          normalized_part_name?: string
          oem_no?: string
          part_name?: string
          source_catalog?: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_year?: string | null
        }
        Relationships: []
      }
      oem_cross_reference: {
        Row: {
          brand: string | null
          category: string | null
          confidence: number
          created_at: string
          equivalent_code: string
          equivalent_family: string | null
          equivalent_normalized: string
          id: string
          model: string | null
          oem_code: string
          oem_family: string | null
          oem_normalized: string
          product_name: string | null
          source: string
          source_url: string | null
          updated_at: string
          verified: boolean
          year_range: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          equivalent_code: string
          equivalent_family?: string | null
          equivalent_normalized: string
          id?: string
          model?: string | null
          oem_code: string
          oem_family?: string | null
          oem_normalized: string
          product_name?: string | null
          source?: string
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          year_range?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          equivalent_code?: string
          equivalent_family?: string | null
          equivalent_normalized?: string
          id?: string
          model?: string | null
          oem_code?: string
          oem_family?: string | null
          oem_normalized?: string
          product_name?: string | null
          source?: string
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          year_range?: string | null
        }
        Relationships: []
      }
      oem_failed_searches: {
        Row: {
          attempt_count: number
          brand: string | null
          created_at: string
          id: string
          last_attempt_at: string
          oem: string
          oem_normalized: string | null
          reason: string
          title: string | null
          tried_queries: Json | null
        }
        Insert: {
          attempt_count?: number
          brand?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string
          oem: string
          oem_normalized?: string | null
          reason: string
          title?: string | null
          tried_queries?: Json | null
        }
        Update: {
          attempt_count?: number
          brand?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string
          oem?: string
          oem_normalized?: string | null
          reason?: string
          title?: string | null
          tried_queries?: Json | null
        }
        Relationships: []
      }
      oem_image_library: {
        Row: {
          brand: string | null
          bytes: number | null
          confidence: number
          created_at: string
          height: number | null
          id: string
          image_hash: string | null
          image_url: string
          is_primary: boolean
          last_used_at: string | null
          oem: string
          oem_family: string | null
          oem_normalized: string | null
          quality_score: number | null
          reject_reason: string | null
          source_name: string | null
          source_part_id: string | null
          source_query: string | null
          source_type: string
          updated_at: string
          uploaded_by: string | null
          use_count: number
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          width: number | null
        }
        Insert: {
          brand?: string | null
          bytes?: number | null
          confidence?: number
          created_at?: string
          height?: number | null
          id?: string
          image_hash?: string | null
          image_url: string
          is_primary?: boolean
          last_used_at?: string | null
          oem: string
          oem_family?: string | null
          oem_normalized?: string | null
          quality_score?: number | null
          reject_reason?: string | null
          source_name?: string | null
          source_part_id?: string | null
          source_query?: string | null
          source_type: string
          updated_at?: string
          uploaded_by?: string | null
          use_count?: number
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          width?: number | null
        }
        Update: {
          brand?: string | null
          bytes?: number | null
          confidence?: number
          created_at?: string
          height?: number | null
          id?: string
          image_hash?: string | null
          image_url?: string
          is_primary?: boolean
          last_used_at?: string | null
          oem?: string
          oem_family?: string | null
          oem_normalized?: string | null
          quality_score?: number | null
          reject_reason?: string | null
          source_name?: string | null
          source_part_id?: string | null
          source_query?: string | null
          source_type?: string
          updated_at?: string
          uploaded_by?: string | null
          use_count?: number
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      oem_image_rejections: {
        Row: {
          created_at: string
          id: string
          image_url: string
          oem_normalized: string
          reason: string | null
          rejected_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          oem_normalized: string
          reason?: string | null
          rejected_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          oem_normalized?: string
          reason?: string | null
          rejected_by?: string | null
        }
        Relationships: []
      }
      oem_image_update_log: {
        Row: {
          brand_part: string | null
          brand_source: string | null
          created_at: string
          created_by: string | null
          extra_images: string[]
          id: string
          new_image_url: string | null
          oem: string
          oem_normalized: string | null
          old_image_url: string | null
          part_id: string | null
          reason: string | null
          similarity: number | null
          source_type: string
          source_url: string | null
          status: string
          title_part: string | null
          title_source: string | null
        }
        Insert: {
          brand_part?: string | null
          brand_source?: string | null
          created_at?: string
          created_by?: string | null
          extra_images?: string[]
          id?: string
          new_image_url?: string | null
          oem: string
          oem_normalized?: string | null
          old_image_url?: string | null
          part_id?: string | null
          reason?: string | null
          similarity?: number | null
          source_type?: string
          source_url?: string | null
          status: string
          title_part?: string | null
          title_source?: string | null
        }
        Update: {
          brand_part?: string | null
          brand_source?: string | null
          created_at?: string
          created_by?: string | null
          extra_images?: string[]
          id?: string
          new_image_url?: string | null
          oem?: string
          oem_normalized?: string | null
          old_image_url?: string | null
          part_id?: string | null
          reason?: string | null
          similarity?: number | null
          source_type?: string
          source_url?: string | null
          status?: string
          title_part?: string | null
          title_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oem_image_update_log_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oem_image_update_log_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      oem_reference: {
        Row: {
          alternative_oems: string[]
          brand: string | null
          category: string | null
          compatible_oems: string[]
          confidence: number
          created_at: string
          created_by: string | null
          cross_reference: string[]
          engine_code: string | null
          fuel: string | null
          id: string
          model: string | null
          notes: string | null
          oem: string
          oem_raw: string | null
          part_name: string | null
          source: string
          transmission: string | null
          updated_at: string
          verified: boolean
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          alternative_oems?: string[]
          brand?: string | null
          category?: string | null
          compatible_oems?: string[]
          confidence?: number
          created_at?: string
          created_by?: string | null
          cross_reference?: string[]
          engine_code?: string | null
          fuel?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          oem: string
          oem_raw?: string | null
          part_name?: string | null
          source?: string
          transmission?: string | null
          updated_at?: string
          verified?: boolean
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          alternative_oems?: string[]
          brand?: string | null
          category?: string | null
          compatible_oems?: string[]
          confidence?: number
          created_at?: string
          created_by?: string | null
          cross_reference?: string[]
          engine_code?: string | null
          fuel?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          oem?: string
          oem_raw?: string | null
          part_name?: string | null
          source?: string
          transmission?: string | null
          updated_at?: string
          verified?: boolean
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      oem_research_cache: {
        Row: {
          cache_key: string
          cache_type: string | null
          created_at: string
          expires_at: string | null
          hit_count: number
          id: string
          last_hit_at: string | null
          query_text: string
          result: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          cache_type?: string | null
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          query_text: string
          result: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          cache_type?: string | null
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          query_text?: string
          result?: Json
          updated_at?: string
        }
        Relationships: []
      }
      oem_research_results: {
        Row: {
          brand: string | null
          confidence: number
          created_at: string
          id: string
          model: string | null
          normalized_oem: string
          oem_code: string
          part_category: string | null
          position: string | null
          query: string
          source_name: string | null
          source_url: string | null
          verification_status: string
        }
        Insert: {
          brand?: string | null
          confidence?: number
          created_at?: string
          id?: string
          model?: string | null
          normalized_oem: string
          oem_code: string
          part_category?: string | null
          position?: string | null
          query: string
          source_name?: string | null
          source_url?: string | null
          verification_status?: string
        }
        Update: {
          brand?: string | null
          confidence?: number
          created_at?: string
          id?: string
          model?: string | null
          normalized_oem?: string
          oem_code?: string
          part_category?: string | null
          position?: string | null
          query?: string
          source_name?: string | null
          source_url?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      oem_scan_queue: {
        Row: {
          attempts: number
          brand: string | null
          completed_at: string | null
          created_at: string
          debug_log: Json | null
          found_urls: number | null
          id: string
          last_error: string | null
          oem: string
          part_id: string | null
          result_count: number | null
          scheduled_at: string
          scope: string
          started_at: string | null
          status: string
          title: string | null
        }
        Insert: {
          attempts?: number
          brand?: string | null
          completed_at?: string | null
          created_at?: string
          debug_log?: Json | null
          found_urls?: number | null
          id?: string
          last_error?: string | null
          oem: string
          part_id?: string | null
          result_count?: number | null
          scheduled_at?: string
          scope: string
          started_at?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          attempts?: number
          brand?: string | null
          completed_at?: string | null
          created_at?: string
          debug_log?: Json | null
          found_urls?: number | null
          id?: string
          last_error?: string | null
          oem?: string
          part_id?: string | null
          result_count?: number | null
          scheduled_at?: string
          scope?: string
          started_at?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oem_scan_queue_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oem_scan_queue_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
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
      oem_zip_jobs: {
        Row: {
          added: number
          completed_at: string | null
          created_at: string
          cursor_index: number
          db_failed: number
          db_inserted: number
          default_brand: string | null
          error_message: string | null
          errors: Json
          failed: number
          files_parsed: number
          files_seen: number
          id: string
          skipped: number
          source_name: string | null
          source_type: string
          status: string
          storage_failed: number
          storage_path: string
          storage_uploaded: number
          total_entries: number | null
          updated_at: string
          user_id: string
          zip_size_bytes: number | null
        }
        Insert: {
          added?: number
          completed_at?: string | null
          created_at?: string
          cursor_index?: number
          db_failed?: number
          db_inserted?: number
          default_brand?: string | null
          error_message?: string | null
          errors?: Json
          failed?: number
          files_parsed?: number
          files_seen?: number
          id?: string
          skipped?: number
          source_name?: string | null
          source_type?: string
          status?: string
          storage_failed?: number
          storage_path: string
          storage_uploaded?: number
          total_entries?: number | null
          updated_at?: string
          user_id: string
          zip_size_bytes?: number | null
        }
        Update: {
          added?: number
          completed_at?: string | null
          created_at?: string
          cursor_index?: number
          db_failed?: number
          db_inserted?: number
          default_brand?: string | null
          error_message?: string | null
          errors?: Json
          failed?: number
          files_parsed?: number
          files_seen?: number
          id?: string
          skipped?: number
          source_name?: string | null
          source_type?: string
          status?: string
          storage_failed?: number
          storage_path?: string
          storage_uploaded?: number
          total_entries?: number | null
          updated_at?: string
          user_id?: string
          zip_size_bytes?: number | null
        }
        Relationships: []
      }
      order_item_supply: {
        Row: {
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          source_type: string
          supplier_cost_price: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_note: string | null
          supplier_product_id: string | null
          supplier_sale_price: number | null
          supply_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          source_type?: string
          supplier_cost_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_note?: string | null
          supplier_product_id?: string | null
          supplier_sale_price?: number | null
          supply_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          source_type?: string
          supplier_cost_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_note?: string | null
          supplier_product_id?: string | null
          supplier_sale_price?: number | null
          supply_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_supply_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supply_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supply_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          is_quote: boolean
          line_total: number | null
          oem_code: string | null
          order_id: string
          part_id: string | null
          photo: string | null
          procurement_days: number | null
          product_code: string | null
          quantity: number
          seller_id: string | null
          seller_name: string | null
          source_type: string
          supplier_name: string | null
          supplier_stock: boolean
          title: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_quote?: boolean
          line_total?: number | null
          oem_code?: string | null
          order_id: string
          part_id?: string | null
          photo?: string | null
          procurement_days?: number | null
          product_code?: string | null
          quantity?: number
          seller_id?: string | null
          seller_name?: string | null
          source_type?: string
          supplier_name?: string | null
          supplier_stock?: boolean
          title: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_quote?: boolean
          line_total?: number | null
          oem_code?: string | null
          order_id?: string
          part_id?: string | null
          photo?: string | null
          procurement_days?: number | null
          product_code?: string | null
          quantity?: number
          seller_id?: string | null
          seller_name?: string | null
          source_type?: string
          supplier_name?: string | null
          supplier_stock?: boolean
          title?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          billing_company: string | null
          billing_type: string
          city: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string
          has_quote_items: boolean
          has_supplier_items: boolean
          id: string
          is_urgent: boolean
          item_count: number
          note: string | null
          order_number: string
          phone: string
          shipping: number
          shipping_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          tax_number: string | null
          tax_office: string | null
          total: number
          tracking_carrier: string | null
          tracking_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          billing_company?: string | null
          billing_type?: string
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          has_quote_items?: boolean
          has_supplier_items?: boolean
          id?: string
          is_urgent?: boolean
          item_count?: number
          note?: string | null
          order_number?: string
          phone: string
          shipping?: number
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          tax_number?: string | null
          tax_office?: string | null
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          billing_company?: string | null
          billing_type?: string
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          has_quote_items?: boolean
          has_supplier_items?: boolean
          id?: string
          is_urgent?: boolean
          item_count?: number
          note?: string | null
          order_number?: string
          phone?: string
          shipping?: number
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          tax_number?: string | null
          tax_office?: string | null
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      page_seo_scores: {
        Row: {
          alt_coverage: number
          body_words: number
          canonical_ok: boolean
          desc_ok: boolean
          duplicate_flag: boolean
          id: string
          internal_links: number
          jsonld_ok: boolean
          notes: Json | null
          page_key: string
          page_type: string
          scanned_at: string
          score: number
          title_ok: boolean
          url: string
        }
        Insert: {
          alt_coverage?: number
          body_words?: number
          canonical_ok?: boolean
          desc_ok?: boolean
          duplicate_flag?: boolean
          id?: string
          internal_links?: number
          jsonld_ok?: boolean
          notes?: Json | null
          page_key: string
          page_type: string
          scanned_at?: string
          score?: number
          title_ok?: boolean
          url: string
        }
        Update: {
          alt_coverage?: number
          body_words?: number
          canonical_ok?: boolean
          desc_ok?: boolean
          duplicate_flag?: boolean
          id?: string
          internal_links?: number
          jsonld_ok?: boolean
          notes?: Json | null
          page_key?: string
          page_type?: string
          scanned_at?: string
          score?: number
          title_ok?: boolean
          url?: string
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
      part_delete_log: {
        Row: {
          actor_id: string
          actor_is_admin: boolean
          batch_id: string | null
          created_at: string
          deleted_count: number
          details: Json
          failed_count: number
          id: string
          operation: string
          owner_user_ids: string[]
          requested_count: number
        }
        Insert: {
          actor_id: string
          actor_is_admin?: boolean
          batch_id?: string | null
          created_at?: string
          deleted_count?: number
          details?: Json
          failed_count?: number
          id?: string
          operation?: string
          owner_user_ids?: string[]
          requested_count?: number
        }
        Update: {
          actor_id?: string
          actor_is_admin?: boolean
          batch_id?: string | null
          created_at?: string
          deleted_count?: number
          details?: Json
          failed_count?: number
          id?: string
          operation?: string
          owner_user_ids?: string[]
          requested_count?: number
        }
        Relationships: []
      }
      part_image_jobs: {
        Row: {
          attempts: number
          confidence: number | null
          confidence_band: string | null
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          image_url: string | null
          last_error: string | null
          oem_code: string
          part_id: string
          priority: number
          rejected: boolean
          rejection_reason: string | null
          score_breakdown: Json | null
          source: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          confidence?: number | null
          confidence_band?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          oem_code: string
          part_id: string
          priority?: number
          rejected?: boolean
          rejection_reason?: string | null
          score_breakdown?: Json | null
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          confidence?: number | null
          confidence_band?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          oem_code?: string
          part_id?: string
          priority?: number
          rejected?: boolean
          rejection_reason?: string | null
          score_breakdown?: Json | null
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_image_jobs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_image_jobs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      part_requests: {
        Row: {
          admin_notes: string | null
          brand: string | null
          buyer_id: string | null
          category: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email: string | null
          engine_code: string | null
          full_name: string
          id: string
          is_active: boolean
          is_urgent: boolean
          machine_subcategory: string | null
          message: string
          model: string | null
          notes: string | null
          notified_at: string | null
          oem_code: string | null
          part_name: string | null
          phone: string
          photos: string[]
          quantity: number
          search_query: string | null
          source_part_id: string | null
          status: string
          updated_at: string
          vehicle_class: string
          year: number | null
        }
        Insert: {
          admin_notes?: string | null
          brand?: string | null
          buyer_id?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          engine_code?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          is_urgent?: boolean
          machine_subcategory?: string | null
          message: string
          model?: string | null
          notes?: string | null
          notified_at?: string | null
          oem_code?: string | null
          part_name?: string | null
          phone: string
          photos?: string[]
          quantity?: number
          search_query?: string | null
          source_part_id?: string | null
          status?: string
          updated_at?: string
          vehicle_class?: string
          year?: number | null
        }
        Update: {
          admin_notes?: string | null
          brand?: string | null
          buyer_id?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          engine_code?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_urgent?: boolean
          machine_subcategory?: string | null
          message?: string
          model?: string | null
          notes?: string | null
          notified_at?: string | null
          oem_code?: string | null
          part_name?: string | null
          phone?: string
          photos?: string[]
          quantity?: number
          search_query?: string | null
          source_part_id?: string | null
          status?: string
          updated_at?: string
          vehicle_class?: string
          year?: number | null
        }
        Relationships: []
      }
      part_supplier_costs: {
        Row: {
          created_at: string
          margin_percent: number | null
          part_id: string
          sale_price: number | null
          supplier_cost_price: number | null
          supplier_id: string | null
          supplier_last_checked_at: string | null
          supplier_name: string
          supplier_product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          margin_percent?: number | null
          part_id: string
          sale_price?: number | null
          supplier_cost_price?: number | null
          supplier_id?: string | null
          supplier_last_checked_at?: string | null
          supplier_name: string
          supplier_product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          margin_percent?: number | null
          part_id?: string
          sale_price?: number | null
          supplier_cost_price?: number | null
          supplier_id?: string | null
          supplier_last_checked_at?: string | null
          supplier_name?: string
          supplier_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_supplier_costs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_costs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "part_views_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      part_watches: {
        Row: {
          base_price: number | null
          created_at: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          notify_back_in_stock: boolean
          notify_cheaper_alternative: boolean
          notify_count: number
          notify_new_seller: boolean
          notify_original_found: boolean
          notify_photo_added: boolean
          notify_price_drop: boolean
          notify_special_price: boolean
          part_id: string
          target_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          notify_back_in_stock?: boolean
          notify_cheaper_alternative?: boolean
          notify_count?: number
          notify_new_seller?: boolean
          notify_original_found?: boolean
          notify_photo_added?: boolean
          notify_price_drop?: boolean
          notify_special_price?: boolean
          part_id: string
          target_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          notify_back_in_stock?: boolean
          notify_cheaper_alternative?: boolean
          notify_count?: number
          notify_new_seller?: boolean
          notify_original_found?: boolean
          notify_photo_added?: boolean
          notify_price_drop?: boolean
          notify_special_price?: boolean
          part_id?: string
          target_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_watches_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_watches_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          admin_notes: string | null
          auto_description: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string
          created_at: string
          delivery_options: string[]
          description: string | null
          embedding: string | null
          embedding_source_hash: string | null
          embedding_updated_at: string | null
          engine_code: string | null
          external_sku: string | null
          gtin: string | null
          has_photos: boolean | null
          id: string
          import_batch_id: string | null
          is_sold: boolean
          last_synced_at: string | null
          machine_subcategory: string | null
          materialized_at: string | null
          materialized_by_user_id: string | null
          materialized_source: string | null
          minimum_order_amount: number | null
          model: string | null
          oem_code: string | null
          oem_codes: string[]
          oem_families: string[] | null
          oem_family: string | null
          oem_norm: string[] | null
          part_type: string | null
          photos: string[]
          price: number | null
          procurement_days: number | null
          product_quality: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_doc: string | null
          seller_id: string
          seo_slug: string | null
          single_shipment_allowed: boolean
          sold_at: string | null
          source_feed_id: string | null
          source_type: string
          status: string
          stock_quantity: number
          stock_status: string | null
          supplier_id: string | null
          supplier_last_checked_at: string | null
          supplier_name: string | null
          supplier_oem: string | null
          supplier_product_code: string | null
          supplier_product_id: string | null
          supplier_stock: boolean
          supplier_stock_status: string | null
          supplier_url: string | null
          title: string
          updated_at: string
          urgent_delivery: boolean
          vehicle_class: string
          whatsapp: string
          year: number | null
        }
        Insert: {
          admin_notes?: string | null
          auto_description?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          delivery_options?: string[]
          description?: string | null
          embedding?: string | null
          embedding_source_hash?: string | null
          embedding_updated_at?: string | null
          engine_code?: string | null
          external_sku?: string | null
          gtin?: string | null
          has_photos?: boolean | null
          id?: string
          import_batch_id?: string | null
          is_sold?: boolean
          last_synced_at?: string | null
          machine_subcategory?: string | null
          materialized_at?: string | null
          materialized_by_user_id?: string | null
          materialized_source?: string | null
          minimum_order_amount?: number | null
          model?: string | null
          oem_code?: string | null
          oem_codes?: string[]
          oem_families?: string[] | null
          oem_family?: string | null
          oem_norm?: string[] | null
          part_type?: string | null
          photos?: string[]
          price?: number | null
          procurement_days?: number | null
          product_quality?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_doc?: string | null
          seller_id: string
          seo_slug?: string | null
          single_shipment_allowed?: boolean
          sold_at?: string | null
          source_feed_id?: string | null
          source_type?: string
          status?: string
          stock_quantity?: number
          stock_status?: string | null
          supplier_id?: string | null
          supplier_last_checked_at?: string | null
          supplier_name?: string | null
          supplier_oem?: string | null
          supplier_product_code?: string | null
          supplier_product_id?: string | null
          supplier_stock?: boolean
          supplier_stock_status?: string | null
          supplier_url?: string | null
          title: string
          updated_at?: string
          urgent_delivery?: boolean
          vehicle_class?: string
          whatsapp: string
          year?: number | null
        }
        Update: {
          admin_notes?: string | null
          auto_description?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          delivery_options?: string[]
          description?: string | null
          embedding?: string | null
          embedding_source_hash?: string | null
          embedding_updated_at?: string | null
          engine_code?: string | null
          external_sku?: string | null
          gtin?: string | null
          has_photos?: boolean | null
          id?: string
          import_batch_id?: string | null
          is_sold?: boolean
          last_synced_at?: string | null
          machine_subcategory?: string | null
          materialized_at?: string | null
          materialized_by_user_id?: string | null
          materialized_source?: string | null
          minimum_order_amount?: number | null
          model?: string | null
          oem_code?: string | null
          oem_codes?: string[]
          oem_families?: string[] | null
          oem_family?: string | null
          oem_norm?: string[] | null
          part_type?: string | null
          photos?: string[]
          price?: number | null
          procurement_days?: number | null
          product_quality?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_doc?: string | null
          seller_id?: string
          seo_slug?: string | null
          single_shipment_allowed?: boolean
          sold_at?: string | null
          source_feed_id?: string | null
          source_type?: string
          status?: string
          stock_quantity?: number
          stock_status?: string | null
          supplier_id?: string | null
          supplier_last_checked_at?: string | null
          supplier_name?: string | null
          supplier_oem?: string | null
          supplier_product_code?: string | null
          supplier_product_id?: string | null
          supplier_stock?: boolean
          supplier_stock_status?: string | null
          supplier_url?: string | null
          title?: string
          updated_at?: string
          urgent_delivery?: boolean
          vehicle_class?: string
          whatsapp?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_source_feed_id_fkey"
            columns: ["source_feed_id"]
            isOneToOne: false
            referencedRelation: "xml_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_slug_history: {
        Row: {
          part_id: string
          replaced_at: string
          slug: string
        }
        Insert: {
          part_id: string
          replaced_at?: string
          slug: string
        }
        Update: {
          part_id?: string
          replaced_at?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_slug_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_slug_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
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
      price_bulk_operation_items: {
        Row: {
          created_at: string
          id: number
          new_price: number
          old_price: number
          operation_id: string
          part_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          new_price: number
          old_price: number
          operation_id: string
          part_id: string
        }
        Update: {
          created_at?: string
          id?: number
          new_price?: number
          old_price?: number
          operation_id?: string
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_bulk_operation_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "price_bulk_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_bulk_operations: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          affected_count: number
          brand: string
          created_at: string
          diff_total: number
          error_message: string | null
          filters: Json
          id: string
          new_total: number
          old_total: number
          operation_type: string
          percent: number
          reverted_at: string | null
          reverted_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          affected_count?: number
          brand: string
          created_at?: string
          diff_total?: number
          error_message?: string | null
          filters?: Json
          id?: string
          new_total?: number
          old_total?: number
          operation_type: string
          percent: number
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          affected_count?: number
          brand?: string
          created_at?: string
          diff_total?: number
          error_message?: string | null
          filters?: Json
          id?: string
          new_total?: number
          old_total?: number
          operation_type?: string
          percent?: number
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_seo_meta: {
        Row: {
          ai_faqs: Json | null
          alt_texts: Json
          attributes: Json
          boost_notes: Json
          boosted_at: string | null
          content_hash: string
          description: string
          enriched_at: string | null
          generated_at: string
          gsc_checked_at: string | null
          in_boost_queue: boolean
          index_state: string
          index_verdict: string | null
          internal_links: Json
          issues: Json
          last_backfill_run_id: string | null
          last_crawl_at: string | null
          manually_edited: boolean
          needs_rewrite: boolean
          part_id: string
          score: number
          score_breakdown: Json
          title: string
          title_variant: number
          updated_at: string
        }
        Insert: {
          ai_faqs?: Json | null
          alt_texts?: Json
          attributes?: Json
          boost_notes?: Json
          boosted_at?: string | null
          content_hash: string
          description: string
          enriched_at?: string | null
          generated_at?: string
          gsc_checked_at?: string | null
          in_boost_queue?: boolean
          index_state?: string
          index_verdict?: string | null
          internal_links?: Json
          issues?: Json
          last_backfill_run_id?: string | null
          last_crawl_at?: string | null
          manually_edited?: boolean
          needs_rewrite?: boolean
          part_id: string
          score?: number
          score_breakdown?: Json
          title: string
          title_variant?: number
          updated_at?: string
        }
        Update: {
          ai_faqs?: Json | null
          alt_texts?: Json
          attributes?: Json
          boost_notes?: Json
          boosted_at?: string | null
          content_hash?: string
          description?: string
          enriched_at?: string | null
          generated_at?: string
          gsc_checked_at?: string | null
          in_boost_queue?: boolean
          index_state?: string
          index_verdict?: string | null
          internal_links?: Json
          issues?: Json
          last_backfill_run_id?: string | null
          last_crawl_at?: string | null
          manually_edited?: boolean
          needs_rewrite?: boolean
          part_id?: string
          score?: number
          score_breakdown?: Json
          title?: string
          title_variant?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_seo_meta_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_seo_meta_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          company_name: string | null
          created_at: string
          display_name: string | null
          district: string | null
          email: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          is_verified: boolean
          last_sign_in_at: string | null
          latitude: number | null
          location_source: string | null
          location_updated_at: string | null
          longitude: number | null
          phone_verified_at: string | null
          seller_badges: string[]
          seller_verified: boolean
          suspended_at: string | null
          trusted_seller: boolean
          updated_at: string
          user_badges: string[]
          user_verified: boolean
          verification_documents: Json
          verification_notes: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          verified_phone: string | null
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          district?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          is_approved?: boolean
          is_verified?: boolean
          last_sign_in_at?: string | null
          latitude?: number | null
          location_source?: string | null
          location_updated_at?: string | null
          longitude?: number | null
          phone_verified_at?: string | null
          seller_badges?: string[]
          seller_verified?: boolean
          suspended_at?: string | null
          trusted_seller?: boolean
          updated_at?: string
          user_badges?: string[]
          user_verified?: boolean
          verification_documents?: Json
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_phone?: string | null
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          district?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          is_verified?: boolean
          last_sign_in_at?: string | null
          latitude?: number | null
          location_source?: string | null
          location_updated_at?: string | null
          longitude?: number | null
          phone_verified_at?: string | null
          seller_badges?: string[]
          seller_verified?: boolean
          suspended_at?: string | null
          trusted_seller?: boolean
          updated_at?: string
          user_badges?: string[]
          user_verified?: boolean
          verification_documents?: Json
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
          delivery_time: string | null
          id: string
          is_active: boolean
          note: string | null
          price: number
          request_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          stock_quantity: number | null
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          admin_notes?: string | null
          condition?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_time?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          price: number
          request_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          stock_quantity?: number | null
          updated_at?: string
          vehicle_class?: string
        }
        Update: {
          admin_notes?: string | null
          condition?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_time?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          price?: number
          request_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          stock_quantity?: number | null
          updated_at?: string
          vehicle_class?: string
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
      review_helpful: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "seller_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          review_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          review_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "seller_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          brand: string | null
          category: string | null
          city: string | null
          clicked_part_id: string | null
          created_at: string
          id: string
          model: string | null
          oem: string | null
          part_type: string | null
          query: string | null
          results_count: number
          user_id: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          city?: string | null
          clicked_part_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          oem?: string | null
          part_type?: string | null
          query?: string | null
          results_count?: number
          user_id?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          city?: string | null
          clicked_part_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          oem?: string | null
          part_type?: string | null
          query?: string | null
          results_count?: number
          user_id?: string | null
        }
        Relationships: []
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
      seller_reviews: {
        Row: {
          admin_notes: string | null
          buyer_id: string
          comment: string | null
          communication_rating: number | null
          created_at: string
          helpful_count: number
          id: string
          images: string[]
          matches_description: boolean | null
          part_id: string
          price_rating: number | null
          quality_rating: number | null
          rating: number
          recommend: boolean | null
          sale_id: string | null
          seller_id: string
          shipping_rating: number | null
          status: string
          title: string | null
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          admin_notes?: string | null
          buyer_id: string
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          helpful_count?: number
          id?: string
          images?: string[]
          matches_description?: boolean | null
          part_id: string
          price_rating?: number | null
          quality_rating?: number | null
          rating: number
          recommend?: boolean | null
          sale_id?: string | null
          seller_id: string
          shipping_rating?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          admin_notes?: string | null
          buyer_id?: string
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          helpful_count?: number
          id?: string
          images?: string[]
          matches_description?: boolean | null
          part_id?: string
          price_rating?: number | null
          quality_rating?: number | null
          rating?: number
          recommend?: boolean | null
          sale_id?: string | null
          seller_id?: string
          shipping_rating?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "seller_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_sales: {
        Row: {
          buyer_id: string
          confirmed_at: string
          created_at: string
          id: string
          note: string | null
          part_id: string
          seller_id: string
        }
        Insert: {
          buyer_id: string
          confirmed_at?: string
          created_at?: string
          id?: string
          note?: string | null
          part_id: string
          seller_id: string
        }
        Update: {
          buyer_id?: string
          confirmed_at?: string
          created_at?: string
          id?: string
          note?: string | null
          part_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_sales_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_sales_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_needing_embedding"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_scores: {
        Row: {
          average_rating: number
          badge: string | null
          completed_sales: number
          recommendation_rate: number
          response_rate: number
          response_time_minutes: number
          review_count: number
          seller_id: string
          trust_score: number
          updated_at: string
        }
        Insert: {
          average_rating?: number
          badge?: string | null
          completed_sales?: number
          recommendation_rate?: number
          response_rate?: number
          response_time_minutes?: number
          review_count?: number
          seller_id: string
          trust_score?: number
          updated_at?: string
        }
        Update: {
          average_rating?: number
          badge?: string | null
          completed_sales?: number
          recommendation_rate?: number
          response_rate?: number
          response_time_minutes?: number
          review_count?: number
          seller_id?: string
          trust_score?: number
          updated_at?: string
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
      seo_backfill_runs: {
        Row: {
          avg_desc_length_after: number | null
          avg_desc_length_before: number | null
          avg_title_length_after: number | null
          avg_title_length_before: number | null
          batch_size: number
          candidates_total: number
          created_at: string
          duplicate_groups_after: number | null
          duplicate_groups_before: number | null
          failed_count: number
          faq_generated_count: number
          finished_at: string | null
          id: string
          last_error: string | null
          notes: Json | null
          processed_count: number
          rewritten_count: number
          skipped_count: number
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avg_desc_length_after?: number | null
          avg_desc_length_before?: number | null
          avg_title_length_after?: number | null
          avg_title_length_before?: number | null
          batch_size?: number
          candidates_total?: number
          created_at?: string
          duplicate_groups_after?: number | null
          duplicate_groups_before?: number | null
          failed_count?: number
          faq_generated_count?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          notes?: Json | null
          processed_count?: number
          rewritten_count?: number
          skipped_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avg_desc_length_after?: number | null
          avg_desc_length_before?: number | null
          avg_title_length_after?: number | null
          avg_title_length_before?: number | null
          batch_size?: number
          candidates_total?: number
          created_at?: string
          duplicate_groups_after?: number | null
          duplicate_groups_before?: number | null
          failed_count?: number
          faq_generated_count?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          notes?: Json | null
          processed_count?: number
          rewritten_count?: number
          skipped_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_category_landing: {
        Row: {
          category_name: string
          category_slug: string
          distinct_brands: number
          distinct_oems: number
          indexable: boolean
          listings_count: number
          quality_score: number
          updated_at: string
        }
        Insert: {
          category_name: string
          category_slug: string
          distinct_brands?: number
          distinct_oems?: number
          indexable?: boolean
          listings_count?: number
          quality_score?: number
          updated_at?: string
        }
        Update: {
          category_name?: string
          category_slug?: string
          distinct_brands?: number
          distinct_oems?: number
          indexable?: boolean
          listings_count?: number
          quality_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      signup_failures: {
        Row: {
          admin_notes: string | null
          attempt_count: number
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          created_user_id: string | null
          display_name: string | null
          email: string | null
          error_code: string | null
          error_message: string | null
          form_data: Json
          id: string
          ip: string | null
          notified: boolean
          phone: string | null
          region: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["signup_failure_status"]
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_notes?: string | null
          attempt_count?: number
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_user_id?: string | null
          display_name?: string | null
          email?: string | null
          error_code?: string | null
          error_message?: string | null
          form_data?: Json
          id?: string
          ip?: string | null
          notified?: boolean
          phone?: string | null
          region?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["signup_failure_status"]
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_notes?: string | null
          attempt_count?: number
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_user_id?: string | null
          display_name?: string | null
          email?: string | null
          error_code?: string | null
          error_message?: string | null
          form_data?: Json
          id?: string
          ip?: string | null
          notified?: boolean
          phone?: string | null
          region?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["signup_failure_status"]
          updated_at?: string
          user_agent?: string | null
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
          indexnow_key: string | null
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
          indexnow_key?: string | null
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
          indexnow_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      smart_oem_research_cache: {
        Row: {
          brand: string | null
          created_at: string
          expires_at: string
          id: string
          model: string | null
          normalized_query: string
          oem_results: Json
          part_category: string | null
          position: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          model?: string | null
          normalized_query: string
          oem_results?: Json
          part_category?: string | null
          position?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          model?: string | null
          normalized_query?: string
          oem_results?: Json
          part_category?: string | null
          position?: string | null
        }
        Relationships: []
      }
      stats_cache: {
        Row: {
          computed_at: string
          key: string
          payload: Json
        }
        Insert: {
          computed_at?: string
          key: string
          payload: Json
        }
        Update: {
          computed_at?: string
          key?: string
          payload?: Json
        }
        Relationships: []
      }
      stok_listings: {
        Row: {
          admin_note: string | null
          city: string | null
          created_at: string
          description: string | null
          estimated_item_count: number | null
          estimated_oem_count: number | null
          expected_price: number | null
          expert_completed: boolean
          expert_requested: boolean
          files: Json
          id: string
          images: Json
          seller_id: string
          status: Database["public"]["Enums"]["stok_listing_status"]
          title: string
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          admin_note?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_item_count?: number | null
          estimated_oem_count?: number | null
          expected_price?: number | null
          expert_completed?: boolean
          expert_requested?: boolean
          files?: Json
          id?: string
          images?: Json
          seller_id: string
          status?: Database["public"]["Enums"]["stok_listing_status"]
          title: string
          updated_at?: string
          vehicle_class?: string
        }
        Update: {
          admin_note?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_item_count?: number | null
          estimated_oem_count?: number | null
          expected_price?: number | null
          expert_completed?: boolean
          expert_requested?: boolean
          files?: Json
          id?: string
          images?: Json
          seller_id?: string
          status?: Database["public"]["Enums"]["stok_listing_status"]
          title?: string
          updated_at?: string
          vehicle_class?: string
        }
        Relationships: []
      }
      stok_offers: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          note: string | null
          offer_amount: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          note?: string | null
          offer_amount: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          note?: string | null
          offer_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stok_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "stok_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_scan_errors: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          error_type: string
          id: string
          job_id: string | null
          oem: string | null
          supplier_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          error_type?: string
          id?: string
          job_id?: string | null
          oem?: string | null
          supplier_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          error_type?: string
          id?: string
          job_id?: string | null
          oem?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_scan_errors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "supplier_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_scan_errors_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_scan_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_count: number
          found_count: number
          id: string
          in_stock_count: number
          margin: number
          min_stock: number
          not_found_count: number
          note: string | null
          out_of_stock_count: number
          processed_count: number
          started_at: string
          status: string
          supplier_id: string
          total_oems: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          found_count?: number
          id?: string
          in_stock_count?: number
          margin?: number
          min_stock?: number
          not_found_count?: number
          note?: string | null
          out_of_stock_count?: number
          processed_count?: number
          started_at?: string
          status?: string
          supplier_id: string
          total_oems?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          found_count?: number
          id?: string
          in_stock_count?: number
          margin?: number
          min_stock?: number
          not_found_count?: number
          note?: string | null
          out_of_stock_count?: number
          processed_count?: number
          started_at?: string
          status?: string
          supplier_id?: string
          total_oems?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_scan_jobs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_scan_results: {
        Row: {
          brand: string | null
          created_at: string
          error_message: string | null
          gtin: string | null
          id: string
          image_url: string | null
          imported_part_id: string | null
          job_id: string
          oem: string
          oem_norm: string
          product_name: string | null
          product_url: string | null
          sale_price: number | null
          scanned_at: string
          status: string
          stock_quantity: number | null
          supplier_id: string
          supplier_price: number | null
          supplier_product_code: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          error_message?: string | null
          gtin?: string | null
          id?: string
          image_url?: string | null
          imported_part_id?: string | null
          job_id: string
          oem: string
          oem_norm: string
          product_name?: string | null
          product_url?: string | null
          sale_price?: number | null
          scanned_at?: string
          status: string
          stock_quantity?: number | null
          supplier_id: string
          supplier_price?: number | null
          supplier_product_code?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          error_message?: string | null
          gtin?: string | null
          id?: string
          image_url?: string | null
          imported_part_id?: string | null
          job_id?: string
          oem?: string
          oem_norm?: string
          product_name?: string | null
          product_url?: string | null
          sale_price?: number | null
          scanned_at?: string
          status?: string
          stock_quantity?: number | null
          supplier_id?: string
          supplier_price?: number | null
          supplier_product_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_scan_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "supplier_scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_scan_results_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          cache_ttl_minutes: number
          created_at: string
          default_margin: number
          id: string
          last_connected_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_scan_at: string | null
          last_success_at: string | null
          last_sync_at: string | null
          login_url: string | null
          min_stock: number
          name: string
          password_secret_key: string | null
          product_type: string
          search_url_template: string | null
          supplier_type: string
          system_seller_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          active?: boolean
          cache_ttl_minutes?: number
          created_at?: string
          default_margin?: number
          id?: string
          last_connected_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_scan_at?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          login_url?: string | null
          min_stock?: number
          name: string
          password_secret_key?: string | null
          product_type?: string
          search_url_template?: string | null
          supplier_type?: string
          system_seller_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          cache_ttl_minutes?: number
          created_at?: string
          default_margin?: number
          id?: string
          last_connected_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_scan_at?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          login_url?: string | null
          min_stock?: number
          name?: string
          password_secret_key?: string | null
          product_type?: string
          search_url_template?: string | null
          supplier_type?: string
          system_seller_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      support_chats: {
        Row: {
          ai_analysis: Json | null
          ai_rating: number | null
          created_at: string
          id: string
          is_spam: boolean
          last_user_message: string | null
          live_requested: boolean
          message_count: number
          messages: Json
          resolved: boolean
          satisfaction: number | null
          session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          ai_rating?: number | null
          created_at?: string
          id?: string
          is_spam?: boolean
          last_user_message?: string | null
          live_requested?: boolean
          message_count?: number
          messages?: Json
          resolved?: boolean
          satisfaction?: number | null
          session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          ai_rating?: number | null
          created_at?: string
          id?: string
          is_spam?: boolean
          last_user_message?: string | null
          live_requested?: boolean
          message_count?: number
          messages?: Json
          resolved?: boolean
          satisfaction?: number | null
          session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_live_requests: {
        Row: {
          admin_notes: string | null
          chat_id: string | null
          contact: string
          created_at: string
          id: string
          message: string
          name: string | null
          session_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          chat_id?: string | null
          contact: string
          created_at?: string
          id?: string
          message: string
          name?: string | null
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          chat_id?: string | null
          contact?: string
          created_at?: string
          id?: string
          message?: string
          name?: string | null
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_live_requests_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "support_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          related_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title?: string
          user_id?: string
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
      user_vehicles: {
        Row: {
          brand: string
          created_at: string
          engine: string | null
          fuel: string | null
          id: string
          is_default: boolean
          label: string | null
          model: string
          transmission: string | null
          updated_at: string
          user_id: string
          variant: string | null
          year: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          engine?: string | null
          fuel?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          model: string
          transmission?: string | null
          updated_at?: string
          user_id: string
          variant?: string | null
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          engine?: string | null
          fuel?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          model?: string
          transmission?: string | null
          updated_at?: string
          user_id?: string
          variant?: string | null
          year?: number | null
        }
        Relationships: []
      }
      visitor_days: {
        Row: {
          day: string
          first_seen: string
          hits: number
          is_bot: boolean
          is_internal: boolean
          last_seen: string
          visitor_key: string
        }
        Insert: {
          day: string
          first_seen?: string
          hits?: number
          is_bot?: boolean
          is_internal?: boolean
          last_seen?: string
          visitor_key: string
        }
        Update: {
          day?: string
          first_seen?: string
          hits?: number
          is_bot?: boolean
          is_internal?: boolean
          last_seen?: string
          visitor_key?: string
        }
        Relationships: []
      }
      visitor_presence: {
        Row: {
          city: string | null
          country: string | null
          device: string | null
          ended_at: string | null
          first_seen: string
          is_bot: boolean
          is_internal: boolean
          last_seen: string
          path: string | null
          session_id: string | null
          tab_id: string
          user_agent: string | null
          user_id: string | null
          visitor_key: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          device?: string | null
          ended_at?: string | null
          first_seen?: string
          is_bot?: boolean
          is_internal?: boolean
          last_seen?: string
          path?: string | null
          session_id?: string | null
          tab_id: string
          user_agent?: string | null
          user_id?: string | null
          visitor_key: string
        }
        Update: {
          city?: string | null
          country?: string | null
          device?: string | null
          ended_at?: string | null
          first_seen?: string
          is_bot?: boolean
          is_internal?: boolean
          last_seen?: string
          path?: string | null
          session_id?: string | null
          tab_id?: string
          user_agent?: string | null
          user_id?: string | null
          visitor_key?: string
        }
        Relationships: []
      }
      xml_feeds: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_import_images: boolean
          consecutive_failures: number
          created_at: string
          id: string
          last_error: string | null
          last_status: string | null
          last_sync_at: string | null
          missing_item_action: string
          name: string
          next_sync_at: string | null
          notes: string | null
          rejection_reason: string | null
          seller_id: string
          source_type: string
          status: string
          sync_interval: string
          template: string
          total_products: number
          updated_at: string
          uploaded_path: string | null
          url: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_import_images?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_status?: string | null
          last_sync_at?: string | null
          missing_item_action?: string
          name: string
          next_sync_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          seller_id: string
          source_type?: string
          status?: string
          sync_interval?: string
          template?: string
          total_products?: number
          updated_at?: string
          uploaded_path?: string | null
          url?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_import_images?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_status?: string | null
          last_sync_at?: string | null
          missing_item_action?: string
          name?: string
          next_sync_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          seller_id?: string
          source_type?: string
          status?: string
          sync_interval?: string
          template?: string
          total_products?: number
          updated_at?: string
          uploaded_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xml_feeds_seller_profile_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xml_sync_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          errors: Json
          feed_id: string
          finished_at: string | null
          id: string
          items_added: number
          items_deactivated: number
          items_failed: number
          items_total: number
          items_updated: number
          seller_id: string
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          errors?: Json
          feed_id: string
          finished_at?: string | null
          id?: string
          items_added?: number
          items_deactivated?: number
          items_failed?: number
          items_total?: number
          items_updated?: number
          seller_id: string
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          errors?: Json
          feed_id?: string
          finished_at?: string | null
          id?: string
          items_added?: number
          items_deactivated?: number
          items_failed?: number
          items_total?: number
          items_updated?: number
          seller_id?: string
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "xml_sync_runs_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "xml_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_events_bot: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device: string | null
          duration_ms: number | null
          engagement: string | null
          event_type: string | null
          fingerprint: string | null
          id: string | null
          is_bot: boolean | null
          metadata: Json | null
          path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type?: string | null
          fingerprint?: string | null
          id?: string | null
          is_bot?: boolean | null
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type?: string | null
          fingerprint?: string | null
          id?: string | null
          is_bot?: boolean | null
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      analytics_events_human: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device: string | null
          duration_ms: number | null
          engagement: string | null
          event_type: string | null
          fingerprint: string | null
          id: string | null
          is_bot: boolean | null
          is_internal: boolean | null
          metadata: Json | null
          path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type?: string | null
          fingerprint?: string | null
          id?: string | null
          is_bot?: boolean | null
          is_internal?: boolean | null
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          duration_ms?: number | null
          engagement?: string | null
          event_type?: string | null
          fingerprint?: string | null
          id?: string | null
          is_bot?: boolean | null
          is_internal?: boolean | null
          metadata?: Json | null
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      open_part_requests: {
        Row: {
          brand: string | null
          category: string | null
          city: string | null
          created_at: string | null
          description: string | null
          engine_code: string | null
          id: string | null
          is_urgent: boolean | null
          machine_subcategory: string | null
          message: string | null
          model: string | null
          oem_code: string | null
          part_name: string | null
          photos: string[] | null
          search_query: string | null
          status: string | null
          vehicle_class: string | null
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
          is_urgent?: boolean | null
          machine_subcategory?: string | null
          message?: string | null
          model?: string | null
          oem_code?: string | null
          part_name?: string | null
          photos?: string[] | null
          search_query?: string | null
          status?: string | null
          vehicle_class?: string | null
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
          is_urgent?: boolean | null
          machine_subcategory?: string | null
          message?: string | null
          model?: string | null
          oem_code?: string | null
          part_name?: string | null
          photos?: string[] | null
          search_query?: string | null
          status?: string | null
          vehicle_class?: string | null
          year?: number | null
        }
        Relationships: []
      }
      parts_needing_embedding: {
        Row: {
          brand: string | null
          category: string | null
          embedding_updated_at: string | null
          id: string | null
          model: string | null
          oem_code: string | null
          title: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          embedding_updated_at?: string | null
          id?: string | null
          model?: string | null
          oem_code?: string | null
          title?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          embedding_updated_at?: string | null
          id?: string | null
          model?: string | null
          oem_code?: string | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _seo_slugify: { Args: { input: string }; Returns: string }
      admin_analytics_overview: { Args: never; Returns: Json }
      admin_conversion_analytics: { Args: never; Returns: Json }
      admin_dashboard_overview: { Args: never; Returns: Json }
      admin_demand_analytics: { Args: { _days?: number }; Returns: Json }
      admin_edit_record: {
        Args: { _id: string; _patch: Json; _table: string }
        Returns: Json
      }
      admin_live_traffic: { Args: { _exclude_admins?: boolean }; Returns: Json }
      admin_moderate_record: {
        Args: { _action: string; _id: string; _table: string }
        Returns: undefined
      }
      admin_moderation_stats: { Args: never; Returns: Json }
      admin_pending_part_requests: {
        Args: never
        Returns: {
          brand: string
          first_request_at: string
          last_request_at: string
          model: string
          notified_count: number
          oem_code: string
          part_name: string
          request_count: number
          total_quantity: number
        }[]
      }
      admin_presence_snapshot: {
        Args: { _timeout_seconds?: number }
        Returns: Json
      }
      admin_price_brand_stats: {
        Args: { _actor: string }
        Returns: {
          avg_price: number
          brand: string
          last_price_update: string
          priced_products: number
          stock_value: number
          total_products: number
        }[]
      }
      admin_price_bulk_apply: {
        Args: {
          _actor: string
          _actor_email: string
          _brand: string
          _filters?: Json
          _operation: string
          _percent: number
        }
        Returns: Json
      }
      admin_price_bulk_preview: {
        Args: {
          _actor: string
          _brand: string
          _filters?: Json
          _operation: string
          _percent: number
          _sample_limit?: number
        }
        Returns: Json
      }
      admin_price_bulk_undo: {
        Args: { _actor: string; _operation_id: string }
        Returns: Json
      }
      admin_product_reports: { Args: never; Returns: Json }
      admin_set_trusted_seller: {
        Args: { _trusted: boolean; _user_id: string }
        Returns: boolean
      }
      admin_support_stats: { Args: never; Returns: Json }
      admin_today_metrics: { Args: never; Returns: Json }
      admin_update_part: {
        Args: { _id: string; _patch: Json }
        Returns: {
          admin_notes: string | null
          auto_description: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string
          created_at: string
          delivery_options: string[]
          description: string | null
          embedding: string | null
          embedding_source_hash: string | null
          embedding_updated_at: string | null
          engine_code: string | null
          external_sku: string | null
          gtin: string | null
          has_photos: boolean | null
          id: string
          import_batch_id: string | null
          is_sold: boolean
          last_synced_at: string | null
          machine_subcategory: string | null
          materialized_at: string | null
          materialized_by_user_id: string | null
          materialized_source: string | null
          minimum_order_amount: number | null
          model: string | null
          oem_code: string | null
          oem_codes: string[]
          oem_families: string[] | null
          oem_family: string | null
          oem_norm: string[] | null
          part_type: string | null
          photos: string[]
          price: number | null
          procurement_days: number | null
          product_quality: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_doc: string | null
          seller_id: string
          seo_slug: string | null
          single_shipment_allowed: boolean
          sold_at: string | null
          source_feed_id: string | null
          source_type: string
          status: string
          stock_quantity: number
          stock_status: string | null
          supplier_id: string | null
          supplier_last_checked_at: string | null
          supplier_name: string | null
          supplier_oem: string | null
          supplier_product_code: string | null
          supplier_product_id: string | null
          supplier_stock: boolean
          supplier_stock_status: string | null
          supplier_url: string | null
          title: string
          updated_at: string
          urgent_delivery: boolean
          vehicle_class: string
          whatsapp: string
          year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "parts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_visitor_report: { Args: { _days?: number }; Returns: Json }
      ai_search_stats: {
        Args: { _days?: number }
        Returns: {
          avg_confidence: number
          avg_response_ms: number
          cache_hit_rate: number
          clarification_rate: number
          click_through: number
          conversion_rate: number
          ctr: number
          no_results: number
          purchases: number
          requests_created: number
          sales_from_ai: number
          semantic_match_rate: number
          success_rate: number
          successful: number
          total_searches: number
        }[]
      }
      bot_ua_pattern: { Args: never; Returns: string }
      brand_slug: { Args: { _brand: string }; Returns: string }
      bulk_delete_parts: {
        Args: { p_batch_id?: string; p_part_ids?: string[] }
        Returns: Json
      }
      catalog_normalize_name: { Args: { _s: string }; Returns: string }
      catalog_normalize_oem: { Args: { _s: string }; Returns: string }
      catalog_search: {
        Args: { _limit?: number; _q: string; _tokens?: string[] }
        Returns: {
          alternative_oems: string[]
          brand: string
          id: string
          normalized_oem: string
          oem_no: string
          part_name: string
          score: number
          source_catalog: string
          vehicle_model: string
          vehicle_year: string
        }[]
      }
      catalog_stats: { Args: never; Returns: Json }
      category_landing: {
        Args: { _category: string; _limit?: number }
        Returns: Json
      }
      check_auth_lockout: { Args: { _identifier: string }; Returns: Json }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: Json
      }
      claim_oem_scan_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          brand: string | null
          completed_at: string | null
          created_at: string
          debug_log: Json | null
          found_urls: number | null
          id: string
          last_error: string | null
          oem: string
          part_id: string | null
          result_count: number | null
          scheduled_at: string
          scope: string
          started_at: string | null
          status: string
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "oem_scan_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_part_image_jobs: {
        Args: { _batch?: number }
        Returns: {
          attempts: number
          confidence: number | null
          confidence_band: string | null
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          image_url: string | null
          last_error: string | null
          oem_code: string
          part_id: string
          priority: number
          rejected: boolean
          rejection_reason: string | null
          score_breakdown: Json | null
          source: string | null
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "part_image_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_auth_failures: { Args: { _identifier: string }; Returns: undefined }
      complete_oem_scan_job: {
        Args: {
          _debug?: Json
          _error?: string
          _found_urls?: number
          _id: string
          _result_count?: number
          _status: string
        }
        Returns: undefined
      }
      count_distinct_oem_library: { Args: never; Returns: number }
      count_distinct_oems: { Args: never; Returns: number }
      count_parts_matching_oem_library: { Args: never; Returns: number }
      count_pending_requests_for_oem: {
        Args: { _oem: string }
        Returns: number
      }
      cross_sell_for_part: {
        Args: { _limit?: number; _part_id: string }
        Returns: {
          brand: string
          category: string
          city: string
          id: string
          model: string
          oem_code: string
          oem_codes: string[]
          photos: string[]
          price: number
          reason: string
          score: number
          seller_id: string
          seo_slug: string
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      demand_compute_score: {
        Args: {
          _c30: number
          _c7: number
          _in_stock: number
          _repeat: number
          _search_count: number
          _unique_users: number
        }
        Returns: number
      }
      demand_opportunities: {
        Args: { _limit?: number; _only_missing?: boolean; _search?: string }
        Returns: {
          brand: string
          category: string
          count_30d: number
          count_7d: number
          id: string
          in_stock_count: number
          keyword: string
          last_seen_at: string
          model: string
          oem_code: string
          part_name: string
          score: number
          search_count: number
          status: string
          tier: string
          unique_users: number
          vehicle_class: string
          year: number
        }[]
      }
      demand_tier: { Args: { _score: number }; Returns: string }
      end_visitor_presence: { Args: { _tab_id: string }; Returns: undefined }
      enqueue_missing_part_images: {
        Args: { _limit?: number }
        Returns: number
      }
      enqueue_oem_scan: {
        Args: {
          _brand?: string
          _limit?: number
          _oem?: string
          _scope: string
        }
        Returns: number
      }
      evaluate_part_stock: { Args: { _part_id: string }; Returns: Json }
      filtered_bots_today: { Args: never; Returns: Json }
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
      find_oem_equivalents: {
        Args: { _oem_normalized: string }
        Returns: {
          brand: string
          category: string
          confidence: number
          equivalent_code: string
          equivalent_normalized: string
          model: string
          product_name: string
          source: string
          year_range: string
        }[]
      }
      fuzzy_word_hit: { Args: { _doc: string; _t: string }; Returns: boolean }
      generate_part_seo_slug: { Args: { _id: string }; Returns: string }
      get_indexable_landing_pages: {
        Args: { _limit?: number }
        Returns: {
          kind: string
          last_scored_at: string
          quality_score: number
          slug: string
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
      get_oem_cache_stats: { Args: never; Returns: Json }
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
      get_seo_growth_snapshot: {
        Args: never
        Returns: {
          avg_quality: number
          indexable_pages: number
          kind: string
          total_pages: number
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
      guest_welcome_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      home_activity_feed: { Args: { _limit?: number }; Returns: Json }
      home_feed_mix: {
        Args: {
          _limit?: number
          _offset?: number
          _seed: string
          _vehicle_class: string
        }
        Returns: {
          brand: string
          category: string
          city: string
          condition: string
          created_at: string
          id: string
          model: string
          oem_code: string
          part_type: string
          photos: string[]
          price: number
          seller_id: string
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      home_feed_random: {
        Args: {
          _exclude?: string[]
          _limit?: number
          _offset?: number
          _seed: string
          _vehicle_class: string
        }
        Returns: {
          brand: string
          category: string
          city: string
          condition: string
          created_at: string
          id: string
          is_sold: boolean
          model: string
          oem_code: string
          part_type: string
          photos: string[]
          price: number
          seller_id: string
          seo_slug: string
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      home_new_feed: {
        Args: { _limit?: number; _offset?: number; _vehicle_class?: string }
        Returns: Json
      }
      home_new_pool: {
        Args: { _pool?: number; _vehicle_class?: string }
        Returns: Json
      }
      home_showcase: {
        Args: { _limit?: number; _seed?: string; _vehicle_class?: string }
        Returns: Json
      }
      indexnow_stats: { Args: never; Returns: Json }
      invalidate_oem_research: { Args: { _prefix: string }; Returns: number }
      is_bot_ua: { Args: { _ua: string }; Returns: boolean }
      is_excluded_actor:
        | { Args: { _path: string; _user_id: string }; Returns: boolean }
        | {
            Args: { _is_internal: boolean; _path: string; _user_id: string }
            Returns: boolean
          }
      is_js_visitor: {
        Args: { _fingerprint: string; _session_id: string; _visitor_id: string }
        Returns: boolean
      }
      is_meaningful_query: { Args: { _q: string }; Returns: boolean }
      is_staff_user: { Args: { _user_id: string }; Returns: boolean }
      list_distinct_oems: {
        Args: { _limit: number; _offset: number }
        Returns: {
          last_updated: string
          listing_count: number
          oem: string
        }[]
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
      log_search_click: {
        Args: { _log_id: string; _part_id: string }
        Returns: undefined
      }
      log_signup_failure: {
        Args: {
          _company_name: string
          _display_name: string
          _email: string
          _error_code: string
          _error_message: string
          _form_data: Json
          _ip?: string
          _phone: string
          _user_agent: string
        }
        Returns: string
      }
      lookup_oem_images: {
        Args: { _limit?: number; _oem: string }
        Returns: {
          brand: string
          confidence: number
          id: string
          image_url: string
          is_primary: boolean
          oem: string
          source_type: string
          verified: boolean
        }[]
      }
      lookup_oem_reference: {
        Args: { _limit?: number; _oem: string }
        Returns: {
          alternative_oems: string[]
          brand: string | null
          category: string | null
          compatible_oems: string[]
          confidence: number
          created_at: string
          created_by: string | null
          cross_reference: string[]
          engine_code: string | null
          fuel: string | null
          id: string
          model: string | null
          notes: string | null
          oem: string
          oem_raw: string | null
          part_name: string | null
          source: string
          transmission: string | null
          updated_at: string
          verified: boolean
          year_from: number | null
          year_to: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "oem_reference"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lookup_shared_oem_part_photos: {
        Args: { _limit?: number; _oem: string }
        Returns: {
          image_url: string
          part_id: string
        }[]
      }
      match_parts_semantic: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          brand: string
          category: string
          city: string
          condition: string
          id: string
          model: string
          oem_code: string
          oem_codes: string[]
          part_type: string
          photos: string[]
          price: number
          seo_slug: string
          similarity: number
          title: string
          year: number
        }[]
      }
      normalize_demand_key: { Args: { _raw: string }; Returns: string }
      normalize_oem: { Args: { _raw: string }; Returns: string }
      normalize_oem_code: { Args: { _raw: string }; Returns: string }
      normalize_oem_family: { Args: { _raw: string }; Returns: string }
      normalize_oem_strict: { Args: { _raw: string }; Returns: string }
      notify_pending_requests_for_part: {
        Args: { _part_id: string }
        Returns: number
      }
      oem_knowledge_card: { Args: { _oem: string }; Returns: Json }
      oem_landing_extras: { Args: { _oem: string }; Returns: Json }
      oem_library_missing: {
        Args: { _limit?: number }
        Returns: {
          brand: string
          oem: string
          part_count: number
        }[]
      }
      oem_library_stats: { Args: never; Returns: Json }
      oem_listing_page: { Args: { _oem: string }; Returns: Json }
      oem_scanner_stats: { Args: never; Returns: Json }
      oem_seo_audit: { Args: never; Returns: Json }
      onlineparca_brand_stats: { Args: never; Returns: Json }
      part_image_jobs_progress: { Args: never; Returns: Json }
      parts_missing_oem_images: {
        Args: { _limit?: number }
        Returns: {
          oem_family: string
          part_count: number
          sample_brand: string
          sample_title: string
        }[]
      }
      parts_oem_image_coverage: {
        Args: never
        Returns: {
          coverage_pct: number
          matched_in_library: number
          total_parts: number
          unmatched: number
          with_oem: number
          with_photo: number
        }[]
      }
      parts_popular_related: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          view_count: number
          year: number
        }[]
      }
      parts_same_brand: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      parts_same_category: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      parts_same_oem: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      parts_same_oem_family: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      parts_same_vehicle: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          has_photos: boolean
          id: string
          model: string
          oem_code: string
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      platform_stats: { Args: never; Returns: Json }
      purge_expired_oem_research: { Args: never; Returns: number }
      recent_oem_scan_jobs: {
        Args: { _limit?: number }
        Returns: {
          brand: string
          completed_at: string
          debug_log: Json
          found_urls: number
          id: string
          last_error: string
          oem: string
          result_count: number
          scheduled_at: string
          status: string
          title: string
        }[]
      }
      recompute_seller_score: { Args: { _seller: string }; Returns: undefined }
      record_auth_failure: {
        Args: { _identifier: string; _kind: string }
        Returns: undefined
      }
      record_demand_signal: {
        Args: {
          _brand?: string
          _category?: string
          _city?: string
          _ip_hash?: string
          _is_internal?: boolean
          _model?: string
          _oem?: string
          _part_name?: string
          _query?: string
          _results_count?: number
          _source?: string
          _vehicle_class?: string
          _year?: number
        }
        Returns: string
      }
      record_part_view: {
        Args: { _part_id: string; _viewer_key: string }
        Returns: number
      }
      record_visitor_presence: {
        Args: {
          _city?: string
          _country?: string
          _device?: string
          _is_bot?: boolean
          _is_internal?: boolean
          _path?: string
          _session_id?: string
          _tab_id: string
          _user_agent?: string
          _user_id?: string
          _visitor_key: string
        }
        Returns: undefined
      }
      refresh_demand_scores: { Args: never; Returns: number }
      reindex_parts_oem_families: { Args: never; Returns: number }
      related_parts_for: {
        Args: { _id: string; _limit?: number }
        Returns: {
          brand: string
          city: string
          id: string
          model: string
          oem_code: string
          photos: string[]
          price: number
          seo_slug: string
          title: string
          year: number
        }[]
      }
      request_center_stats: { Args: never; Returns: Json }
      resolve_part_slug: {
        Args: { _input: string }
        Returns: {
          current_slug: string
          part_id: string
          redirected: boolean
        }[]
      }
      retry_failed_part_images: {
        Args: { _max_attempts?: number }
        Returns: number
      }
      save_oem_research: {
        Args: {
          _key: string
          _query: string
          _result: Json
          _ttl_seconds?: number
        }
        Returns: undefined
      }
      search_conversion_stats: {
        Args: { _range?: string }
        Returns: {
          conversion_pct: number
          total_clicks: number
          total_searches: number
          zero_result_count: number
        }[]
      }
      search_my_parts: {
        Args: { _limit?: number; _offset?: number; _q?: string }
        Returns: {
          admin_notes: string | null
          auto_description: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string
          created_at: string
          delivery_options: string[]
          description: string | null
          embedding: string | null
          embedding_source_hash: string | null
          embedding_updated_at: string | null
          engine_code: string | null
          external_sku: string | null
          gtin: string | null
          has_photos: boolean | null
          id: string
          import_batch_id: string | null
          is_sold: boolean
          last_synced_at: string | null
          machine_subcategory: string | null
          materialized_at: string | null
          materialized_by_user_id: string | null
          materialized_source: string | null
          minimum_order_amount: number | null
          model: string | null
          oem_code: string | null
          oem_codes: string[]
          oem_families: string[] | null
          oem_family: string | null
          oem_norm: string[] | null
          part_type: string | null
          photos: string[]
          price: number | null
          procurement_days: number | null
          product_quality: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_doc: string | null
          seller_id: string
          seo_slug: string | null
          single_shipment_allowed: boolean
          sold_at: string | null
          source_feed_id: string | null
          source_type: string
          status: string
          stock_quantity: number
          stock_status: string | null
          supplier_id: string | null
          supplier_last_checked_at: string | null
          supplier_name: string | null
          supplier_oem: string | null
          supplier_product_code: string | null
          supplier_product_id: string | null
          supplier_stock: boolean
          supplier_stock_status: string | null
          supplier_url: string | null
          title: string
          updated_at: string
          urgent_delivery: boolean
          vehicle_class: string
          whatsapp: string
          year: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "parts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_parts_by_oem:
        | {
            Args: { _oem: string }
            Returns: {
              admin_notes: string | null
              auto_description: string | null
              brand: string | null
              category: string | null
              city: string | null
              condition: string
              created_at: string
              delivery_options: string[]
              description: string | null
              embedding: string | null
              embedding_source_hash: string | null
              embedding_updated_at: string | null
              engine_code: string | null
              external_sku: string | null
              gtin: string | null
              has_photos: boolean | null
              id: string
              import_batch_id: string | null
              is_sold: boolean
              last_synced_at: string | null
              machine_subcategory: string | null
              materialized_at: string | null
              materialized_by_user_id: string | null
              materialized_source: string | null
              minimum_order_amount: number | null
              model: string | null
              oem_code: string | null
              oem_codes: string[]
              oem_families: string[] | null
              oem_family: string | null
              oem_norm: string[] | null
              part_type: string | null
              photos: string[]
              price: number | null
              procurement_days: number | null
              product_quality: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              search_doc: string | null
              seller_id: string
              seo_slug: string | null
              single_shipment_allowed: boolean
              sold_at: string | null
              source_feed_id: string | null
              source_type: string
              status: string
              stock_quantity: number
              stock_status: string | null
              supplier_id: string | null
              supplier_last_checked_at: string | null
              supplier_name: string | null
              supplier_oem: string | null
              supplier_product_code: string | null
              supplier_product_id: string | null
              supplier_stock: boolean
              supplier_stock_status: string | null
              supplier_url: string | null
              title: string
              updated_at: string
              urgent_delivery: boolean
              vehicle_class: string
              whatsapp: string
              year: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "parts"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
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
      search_parts_family: {
        Args: {
          _brand?: string
          _city?: string
          _condition?: string
          _in_stock?: boolean
          _limit?: number
          _max_price?: number
          _min_price?: number
          _offset?: number
          _q?: string
          _tokens?: string[]
          _with_photo?: boolean
        }
        Returns: {
          brand: string
          city: string
          condition: string
          created_at: string
          has_photos: boolean
          id: string
          is_sold: boolean
          match_kind: string
          minimum_order_amount: number
          model: string
          oem_code: string
          oem_codes: string[]
          part_type: string
          photos: string[]
          price: number
          procurement_days: number
          score: number
          seo_slug: string
          single_shipment_allowed: boolean
          stock_quantity: number
          supplier_stock: boolean
          title: string
          total_count: number
          year: number
        }[]
      }
      search_parts_ranked:
        | {
            Args: {
              _brand?: string
              _category?: string
              _limit?: number
              _max_price?: number
              _min_price?: number
              _model?: string
              _oem?: string
              _offset?: number
              _part_type?: string
              _q: string
              _year?: number
            }
            Returns: {
              brand: string
              category: string
              city: string
              condition: string
              id: string
              model: string
              oem_code: string
              part_type: string
              photos: string[]
              price: number
              score: number
              seller_id: string
              stock_quantity: number
              title: string
              year: number
            }[]
          }
        | {
            Args: {
              _brand?: string
              _category?: string
              _limit?: number
              _max_price?: number
              _min_price?: number
              _model?: string
              _oem?: string
              _offset?: number
              _part_type?: string
              _q: string
              _vehicle_class?: string
              _year?: number
            }
            Returns: {
              brand: string
              category: string
              city: string
              condition: string
              id: string
              model: string
              oem_code: string
              part_type: string
              photos: string[]
              price: number
              score: number
              seller_id: string
              stock_quantity: number
              title: string
              year: number
            }[]
          }
      search_parts_smart:
        | {
            Args: {
              _brand?: string
              _category?: string
              _city?: string
              _limit?: number
              _max_price?: number
              _min_price?: number
              _model?: string
              _offset?: number
              _part_type?: string
              _q?: string
              _year?: number
            }
            Returns: {
              brand: string
              category: string
              city: string
              condition: string
              created_at: string
              id: string
              match_kind: string
              model: string
              oem_code: string
              oem_codes: string[]
              part_type: string
              photos: string[]
              price: number
              score: number
              seller_id: string
              stock_quantity: number
              title: string
              total_count: number
              year: number
            }[]
          }
        | {
            Args: {
              _brand?: string
              _category?: string
              _city?: string
              _condition?: string
              _in_stock?: boolean
              _limit?: number
              _max_price?: number
              _min_price?: number
              _model?: string
              _offset?: number
              _part_type?: string
              _q?: string
              _with_photo?: boolean
              _year?: number
            }
            Returns: {
              brand: string
              category: string
              city: string
              condition: string
              created_at: string
              id: string
              match_kind: string
              model: string
              oem_code: string
              oem_codes: string[]
              part_type: string
              photos: string[]
              price: number
              score: number
              seller_id: string
              stock_quantity: number
              title: string
              total_count: number
              year: number
            }[]
          }
      search_suggest: {
        Args: { _limit?: number; _q: string }
        Returns: {
          hint: string
          kind: string
          label: string
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
          seo_slug: string
          title: string
        }[]
      }
      seo_boost_candidates: {
        Args: { _limit?: number }
        Returns: {
          has_meta: boolean
          part_id: string
          score: number
        }[]
      }
      seo_boost_overview: { Args: never; Returns: Json }
      seo_brand_index: {
        Args: { _min_count?: number }
        Returns: {
          brand: string
          last_updated: string
          slug: string
          total: number
          with_photo: number
        }[]
      }
      seo_brand_landing: {
        Args: { _brand: string; _limit?: number }
        Returns: Json
      }
      seo_duplicate_titles: {
        Args: { _limit?: number }
        Returns: {
          count: number
          title: string
        }[]
      }
      seo_health_overview: { Args: never; Returns: Json }
      seo_index_pending: {
        Args: { _filter?: string; _limit?: number; _offset?: number }
        Returns: {
          alt_texts_count: number
          boosted_at: string
          canonical_ok: boolean
          gsc_checked_at: string
          has_meta: boolean
          in_boost_queue: boolean
          index_state: string
          index_verdict: string
          internal_links_count: number
          issues: Json
          last_crawl_at: string
          part_id: string
          schema_ok: boolean
          score: number
          seo_slug: string
          title: string
          total_count: number
          url: string
        }[]
      }
      seo_pending_index_pages: {
        Args: { _limit?: number }
        Returns: {
          description_length: number
          oem_code: string
          part_id: string
          photo_count: number
          score: number
          seo_slug: string
          title: string
          updated_at: string
        }[]
      }
      seo_progress_report: { Args: never; Returns: Json }
      seo_quality_score: { Args: { _id: string }; Returns: number }
      seo_thin_content: {
        Args: { _limit?: number }
        Returns: {
          description_length: number
          part_id: string
          seo_slug: string
          title: string
        }[]
      }
      seo_url_conflicts: {
        Args: { _limit?: number }
        Returns: {
          part_ids: string[]
          slug: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      signup_conversion_report: { Args: { _days?: number }; Returns: Json }
      signup_failures_critical_alerts: {
        Args: never
        Returns: {
          error_code: string
          last_at: string
          occurrences: number
        }[]
      }
      signup_failures_stats: { Args: never; Returns: Json }
      signup_funnel_stats: { Args: { _days?: number }; Returns: Json }
      stock_dashboard_stats: { Args: never; Returns: Json }
      suggest_alternatives: {
        Args: { _limit?: number; _q: string }
        Returns: {
          brand: string
          city: string
          condition: string
          id: string
          model: string
          oem_code: string
          photos: string[]
          price: number
          reason: string
          stock_quantity: number
          title: string
          year: number
        }[]
      }
      top_demand_parts: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          oem: string
          request_count: number
          sample_brand: string
          sample_model: string
          sample_part_id: string
          sample_seo_slug: string
          sample_title: string
          search_count: number
        }[]
      }
      top_demand_today: {
        Args: { _limit?: number }
        Returns: {
          brand: string
          category: string
          label: string
          oem_code: string
          score: number
          search_count: number
          tier: string
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
      top_search_brand_model: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          brand: string
          last_searched_at: string
          model: string
          search_count: number
        }[]
      }
      top_search_cities: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          city: string
          last_searched_at: string
          search_count: number
        }[]
      }
      top_search_queries: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          last_searched_at: string
          query: string
          search_count: number
        }[]
      }
      touch_oem_image: { Args: { _id: string }; Returns: undefined }
      tr_city_normalize: { Args: { _raw: string }; Returns: string }
      tr_city_slug: { Args: { _city: string }; Returns: string }
      tr_lower_ascii: { Args: { _t: string }; Returns: string }
      tr_normalize_city: { Args: { _city: string }; Returns: string }
      tr_query_stem: { Args: { _q: string }; Returns: string }
      trust_apply_action: {
        Args: {
          _action: string
          _badge?: string
          _notes?: string
          _user_id: string
        }
        Returns: undefined
      }
      trust_counts: { Args: never; Returns: Json }
      trust_list_users: {
        Args: { _filter?: string }
        Returns: {
          avatar_url: string
          city: string
          company_name: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_admin: boolean
          is_seller: boolean
          last_sign_in_at: string
          parts_count: number
          phone_verified_at: string
          reviews_count: number
          seller_badges: string[]
          seller_verified: boolean
          sv_account_type: string
          sv_contact_person: string
          sv_id: string
          sv_notes: string
          sv_phone: string
          sv_tax_number: string
          trust_score: number
          user_badges: string[]
          user_verified: boolean
          verification_documents: Json
          verification_notes: string
          verification_status: string
          verified_phone: string
        }[]
      }
      unique_visitors_today: { Args: never; Returns: number }
      vehicle_suggest: {
        Args: { _limit?: number; _q: string }
        Returns: {
          brand: string
          label: string
          listings: number
          model: string
          score: number
        }[]
      }
      visits_today_deduped: { Args: never; Returns: number }
      xml_admin_overview: { Args: never; Returns: Json }
      xml_feed_increment_failures: {
        Args: { _feed_id: string }
        Returns: undefined
      }
      xml_feeds_due_for_sync: {
        Args: { _limit?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_import_images: boolean
          consecutive_failures: number
          created_at: string
          id: string
          last_error: string | null
          last_status: string | null
          last_sync_at: string | null
          missing_item_action: string
          name: string
          next_sync_at: string | null
          notes: string | null
          rejection_reason: string | null
          seller_id: string
          source_type: string
          status: string
          sync_interval: string
          template: string
          total_products: number
          updated_at: string
          uploaded_path: string | null
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "xml_feeds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      zero_result_searches: {
        Args: { _limit?: number; _range?: string }
        Returns: {
          last_searched_at: string
          oem: string
          query: string
          search_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "seller" | "super_admin"
      live_chat_sender: "visitor" | "admin" | "system"
      live_chat_status: "waiting" | "active" | "closed"
      order_status:
        | "yeni"
        | "hazirlaniyor"
        | "teklif_bekliyor"
        | "odeme_bekliyor"
        | "kargoda"
        | "tamamlandi"
        | "iptal"
        | "bekliyor"
        | "odeme_alindi"
        | "teslim_edildi"
        | "arsivlendi"
      signup_failure_status: "pending" | "resolved" | "converted" | "dismissed"
      stok_listing_status:
        | "draft"
        | "pending_review"
        | "active"
        | "offer_collecting"
        | "sold"
        | "cancelled"
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
      app_role: ["admin", "user", "seller", "super_admin"],
      live_chat_sender: ["visitor", "admin", "system"],
      live_chat_status: ["waiting", "active", "closed"],
      order_status: [
        "yeni",
        "hazirlaniyor",
        "teklif_bekliyor",
        "odeme_bekliyor",
        "kargoda",
        "tamamlandi",
        "iptal",
        "bekliyor",
        "odeme_alindi",
        "teslim_edildi",
        "arsivlendi",
      ],
      signup_failure_status: ["pending", "resolved", "converted", "dismissed"],
      stok_listing_status: [
        "draft",
        "pending_review",
        "active",
        "offer_collecting",
        "sold",
        "cancelled",
      ],
    },
  },
} as const
