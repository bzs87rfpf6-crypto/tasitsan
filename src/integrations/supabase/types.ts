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
          message: string
          model: string | null
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
          message: string
          model?: string | null
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
          message?: string
          model?: string | null
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      request_quotes: {
        Row: {
          admin_notes: string | null
          condition: string
          created_at: string
          delivery_time: string
          id: string
          note: string | null
          price: number
          request_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          condition: string
          created_at?: string
          delivery_time: string
          id?: string
          note?: string | null
          price: number
          request_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          condition?: string
          created_at?: string
          delivery_time?: string
          id?: string
          note?: string | null
          price?: number
          request_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_part_view: {
        Args: { _part_id: string; _viewer_key: string }
        Returns: number
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
