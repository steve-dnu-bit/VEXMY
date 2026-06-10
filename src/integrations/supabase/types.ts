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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          artist_id: string
          booking_type: string
          service_category: string
          client_email: string | null
          client_name: string
          client_phone: string | null
          company_id: string | null
          created_at: string
          deposit_amount: number | null
          deposit_link_sent: boolean | null
          deposit_paid: boolean | null
          client_user_id: string | null
          deposit_payment_id: string | null
          ends_at: string
          id: string
          notes: string | null
          organization_id: string | null
          reference_image_url: string | null
          starts_at: string
          status: string
          tattoo_placement: string | null
          tattoo_size: string | null
          tattoo_style: string | null
          updated_at: string
          vip_client: boolean
        }
        Insert: {
          artist_id: string
          booking_type?: string
          service_category?: string
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_user_id?: string | null
          company_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_link_sent?: boolean | null
          deposit_paid?: boolean | null
          deposit_payment_id?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          reference_image_url?: string | null
          starts_at: string
          status?: string
          tattoo_placement?: string | null
          tattoo_size?: string | null
          tattoo_style?: string | null
          updated_at?: string
          vip_client?: boolean
        }
        Update: {
          artist_id?: string
          booking_type?: string
          service_category?: string
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_user_id?: string | null
          company_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_link_sent?: boolean | null
          deposit_paid?: boolean | null
          deposit_payment_id?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          reference_image_url?: string | null
          starts_at?: string
          status?: string
          tattoo_placement?: string | null
          tattoo_size?: string | null
          tattoo_style?: string | null
          updated_at?: string
          vip_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          channel: string
          created_at: string
          credentials: Json
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: string
          legal_name: string
          name: string
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_name: string
          name: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_name?: string
          name?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consent_signatures: {
        Row: {
          id: string
          full_name: string
          email: string | null
          phone: string | null
          signature_image: string | null
          agreement_version: string
          client_acknowledged: boolean
          booking_id: string | null
          artist_id: string | null
          reference_image_url: string | null
          consent_pdf_url: string | null
          consent_fields: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email?: string | null
          phone?: string | null
          signature_image?: string | null
          agreement_version?: string
          client_acknowledged?: boolean
          booking_id?: string | null
          artist_id?: string | null
          reference_image_url?: string | null
          consent_pdf_url?: string | null
          consent_fields?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string | null
          phone?: string | null
          signature_image?: string | null
          agreement_version?: string
          client_acknowledged?: boolean
          booking_id?: string | null
          artist_id?: string | null
          reference_image_url?: string | null
          consent_pdf_url?: string | null
          consent_fields?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          booking_id: string | null
          client_email: string | null
          client_name: string
          company_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          invoice_number: string
          items: Json
          notes: string | null
          paid_at: string | null
          payment_method: string
          payment_term: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          client_email?: string | null
          client_name: string
          company_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          invoice_number: string
          items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_term?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          client_email?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_term?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_role_defaults: {
        Row: {
          role_template: string
          feature: string
          granted: boolean
        }
        Insert: {
          role_template: string
          feature: string
          granted?: boolean
        }
        Update: {
          role_template?: string
          feature?: string
          granted?: boolean
        }
        Relationships: []
      }
      messages: {
        Row: {
          assigned_to: string | null
          channel: string
          created_at: string
          direction: string
          id: string
          is_read: boolean | null
          message_text: string
          metadata: Json | null
          sender_id: string | null
          sender_name: string
        }
        Insert: {
          assigned_to?: string | null
          channel: string
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          message_text: string
          metadata?: Json | null
          sender_id?: string | null
          sender_name: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          message_text?: string
          metadata?: Json | null
          sender_id?: string | null
          sender_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          customer_profile_completed: boolean
          id: string
          phone: string | null
          portal_bg_color: string | null
          portal_bg_image_url: string | null
          portal_public_bio: string | null
          public_contact_email: string | null
          public_contact_phone: string | null
          public_instagram: string | null
          public_profile_completed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id?: string
          phone?: string | null
          customer_profile_completed?: boolean
          portal_bg_color?: string | null
          portal_bg_image_url?: string | null
          portal_public_bio?: string | null
          public_contact_email?: string | null
          public_contact_phone?: string | null
          public_instagram?: string | null
          public_profile_completed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          phone?: string | null
          customer_profile_completed?: boolean
          portal_bg_color?: string | null
          portal_bg_image_url?: string | null
          portal_public_bio?: string | null
          public_contact_email?: string | null
          public_contact_phone?: string | null
          public_instagram?: string | null
          public_profile_completed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          booking_type: string
          color: string
          created_at: string
          created_by: string
          duration: number
          id: string
          is_active: boolean
          name: string
          price: number | null
          service_category: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          booking_type?: string
          color?: string
          created_at?: string
          created_by: string
          duration?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number | null
          service_category?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          booking_type?: string
          color?: string
          created_at?: string
          created_by?: string
          duration?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number | null
          service_category?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      stencils: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          original_image_url: string
          prompt: string | null
          status: string
          stencil_image_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          original_image_url: string
          prompt?: string | null
          status?: string
          stencil_image_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          original_image_url?: string
          prompt?: string | null
          status?: string
          stencil_image_url?: string | null
        }
        Relationships: []
      }
      stencil_usage: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          unit: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          unit?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          unit?: string
        }
        Relationships: []
      }
      stock_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          quantity: number
          requested_by: string
          reviewed_by: string | null
          status: string
          stock_item_id: string
          supplier_name: string | null
          supplier_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          requested_by: string
          reviewed_by?: string | null
          status?: string
          stock_item_id: string
          supplier_name?: string | null
          supplier_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          requested_by?: string
          reviewed_by?: string | null
          status?: string
          stock_item_id?: string
          supplier_name?: string | null
          supplier_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_supplier_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          stock_item_id: string
          supplier_name: string | null
          supplier_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          stock_item_id: string
          supplier_name?: string | null
          supplier_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          stock_item_id?: string
          supplier_name?: string | null
          supplier_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_supplier_links_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          feature: string
          granted: boolean
          id: string
          user_id: string
        }
        Insert: {
          feature: string
          granted?: boolean
          id?: string
          user_id: string
        }
        Update: {
          feature?: string
          granted?: boolean
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          description: string | null
          price_gbp_monthly: number | null
          stripe_price_id: string | null
          max_artist_seats: number | null
          trial_days: number
          features: Json
          sort_order: number
          is_active: boolean
          is_self_serve: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          price_gbp_monthly?: number | null
          stripe_price_id?: string | null
          max_artist_seats?: number | null
          trial_days?: number
          features?: Json
          sort_order?: number
          is_active?: boolean
          is_self_serve?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price_gbp_monthly?: number | null
          stripe_price_id?: string | null
          max_artist_seats?: number | null
          trial_days?: number
          features?: Json
          sort_order?: number
          is_active?: boolean
          is_self_serve?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          owner_user_id: string | null
          stripe_customer_id: string | null
          stripe_connect_account_id: string | null
          stripe_connect_charges_enabled: boolean
          stripe_connect_payouts_enabled: boolean
          stripe_connect_details_submitted: boolean
          stripe_connect_onboarded_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_user_id?: string | null
          stripe_customer_id?: string | null
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_onboarded_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_user_id?: string | null
          stripe_customer_id?: string | null
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_onboarded_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          invited_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          invited_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          invited_by?: string | null
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          plan_id?: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          id: string
          organization_id: string | null
          stripe_event_id: string | null
          event_type: string
          payload: Json
          processed_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          stripe_event_id?: string | null
          event_type: string
          payload?: Json
          processed_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          stripe_event_id?: string | null
          event_type?: string
          payload?: Json
          processed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      staff_delete_booking: {
        Args: { p_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
      }
      staff_insert_booking: {
        Args: {
          p_artist_id: string
          p_booking_type: string
          p_client_email: string | null
          p_client_name: string
          p_client_phone: string | null
          p_client_user_id: string | null
          p_deposit_paid: boolean
          p_deposit_amount?: number | null
          p_ends_at: string
          p_notes: string | null
          p_service_category?: string
          p_starts_at: string
          p_status: string
          p_tattoo_placement: string | null
          p_tattoo_size: string | null
          p_tattoo_style: string | null
        }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
      }
      staff_update_booking: {
        Args: { p_id: string; p_patch: Json }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
      }
      get_user_organization_id: {
        Args: { _user_id?: string }
        Returns: string
      }
      org_has_active_subscription: {
        Args: { _org_id: string }
        Returns: boolean
      }
      org_plan_has_feature: {
        Args: { _org_id: string; _feature: string }
        Returns: boolean
      }
      get_org_seat_usage: {
        Args: { _user_id?: string }
        Returns: Json
      }
      org_can_add_artist_seat: {
        Args: { _org_id: string }
        Returns: boolean
      }
      org_artist_seat_count: {
        Args: { _org_id: string }
        Returns: number
      }
      stencil_quota_status: {
        Args: { _user_id?: string }
        Returns: Json
      }
      claim_stencil_quota: {
        Args: { _user_id?: string }
        Returns: Json
      }
      refund_stencil_quota: {
        Args: { _usage_id: string; _user_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "artist" | "assistant" | "customer"
      org_member_role: "owner" | "admin" | "member"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "paused"
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
      app_role: ["admin", "artist", "assistant", "customer"],
    },
  },
} as const
