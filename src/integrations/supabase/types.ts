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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      delivery_addresses: {
        Row: {
          address: Json
          created_at: string
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          address: Json
          created_at?: string
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          address?: Json
          created_at?: string
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_couriers: {
        Row: {
          active: boolean
          id: string
          name: string
          phone: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          phone?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          phone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      delivery_orders: {
        Row: {
          address: Json
          cash_for: number
          created_at: string
          customer: string
          customer_id: string | null
          delivered_at: string | null
          id: string
          order_id: string
          payment_method: string
          phone: string
          position: number
          problem: string | null
          route_id: string | null
          status: string
        }
        Insert: {
          address?: Json
          cash_for?: number
          created_at?: string
          customer?: string
          customer_id?: string | null
          delivered_at?: string | null
          id?: string
          order_id: string
          payment_method?: string
          phone?: string
          position?: number
          problem?: string | null
          route_id?: string | null
          status?: string
        }
        Update: {
          address?: Json
          cash_for?: number
          created_at?: string
          customer?: string
          customer_id?: string | null
          delivered_at?: string | null
          id?: string
          order_id?: string
          payment_method?: string
          phone?: string
          position?: number
          problem?: string | null
          route_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "delivery_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_routes: {
        Row: {
          courier_id: string | null
          created_at: string
          created_by: string | null
          distance_meters: number | null
          duration_seconds: number | null
          id: string
          name: string
          origin: string
        }
        Insert: {
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          id?: string
          name: string
          origin?: string
        }
        Update: {
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          id?: string
          name?: string
          origin?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_routes_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "delivery_couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_customer_visits: {
        Row: {
          created_at: string
          customer_id: string
          order_id: string
          seller_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          order_id: string
          seller_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          order_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_customer_visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_customers: {
        Row: {
          consent_at: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          promotion_consent: boolean
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          promotion_consent?: boolean
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          promotion_consent?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pdv_state: {
        Row: {
          data: Json
          id: number
          revision: number
          updated_at: string
        }
        Insert: {
          data: Json
          id?: number
          revision?: number
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: number
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          display_name: string
          id: string
        }
        Insert: {
          display_name?: string
          id: string
        }
        Update: {
          display_name?: string
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_pdv_cashier_order: {
        Args: { new_status: string; order_id: string }
        Returns: undefined
      }
      cancel_pdv_cashier_order: {
        Args: { order_id: string }
        Returns: undefined
      }
      claim_pdv_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pay_pdv_cashier: {
        Args: { order_id: string; payment_method: string }
        Returns: undefined
      }
      read_pdv_cashier: { Args: never; Returns: Json }
      read_pdv_operator: { Args: never; Returns: Json }
      revoke_pdv_access: { Args: { target: string }; Returns: undefined }
      save_pdv_cashier_product: {
        Args: {
          product_category: string
          product_id: string
          product_name: string
          product_price: number
          product_stock: number
        }
        Returns: undefined
      }
      save_pdv_state: {
        Args: { expected_revision: number; payload: Json }
        Returns: {
          data: Json
          id: number
          revision: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pdv_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_pdv_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target: string
        }
        Returns: undefined
      }
      submit_pdv_operator: { Args: { request: Json }; Returns: Json }
      submit_pdv_operator_with_contact: {
        Args: { request: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "cashier" | "courier"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "operator", "cashier", "courier"],
    },
  },
} as const
