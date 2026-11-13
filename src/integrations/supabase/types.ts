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
      catalog_products: {
        Row: {
          description: string
          featured: boolean
          illustrative: boolean
          image_url: string | null
          product_id: string
          published: boolean
          sort: number
          updated_at: string
        }
        Insert: {
          description?: string
          featured?: boolean
          illustrative?: boolean
          image_url?: string | null
          product_id: string
          published?: boolean
          sort?: number
          updated_at?: string
        }
        Update: {
          description?: string
          featured?: boolean
          illustrative?: boolean
          image_url?: string | null
          product_id?: string
          published?: boolean
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalog_settings: {
        Row: {
          config: Json
          id: number
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_identity_changes: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          customer_id: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          customer_id: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          customer_id?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_identity_changes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pdv_customers"
            referencedColumns: ["id"]
          },
        ]
      }
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
          assigned_courier_id: string | null
          cash_for: number
          created_at: string
          customer: string
          customer_id: string | null
          delivered_at: string | null
          departed_at: string | null
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
          assigned_courier_id?: string | null
          cash_for?: number
          created_at?: string
          customer?: string
          customer_id?: string | null
          delivered_at?: string | null
          departed_at?: string | null
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
          assigned_courier_id?: string | null
          cash_for?: number
          created_at?: string
          customer?: string
          customer_id?: string | null
          delivered_at?: string | null
          departed_at?: string | null
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
            foreignKeyName: "delivery_orders_assigned_courier_id_fkey"
            columns: ["assigned_courier_id"]
            isOneToOne: false
            referencedRelation: "delivery_couriers"
            referencedColumns: ["id"]
          },
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
      payment_receipt_events: {
        Row: {
          action: string
          actor: string | null
          actor_name: string
          created_at: string
          id: string
          reason: string
          receipt_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          reason?: string
          receipt_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          reason?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipt_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          evidence: Json
          file_hash: string | null
          id: string
          message_id: string
          order_id: string | null
          phone: string
          reason: string
          received_at: string
          request_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string
          storage_path: string | null
          transaction_id: string | null
        }
        Insert: {
          amount?: number
          evidence?: Json
          file_hash?: string | null
          id?: string
          message_id: string
          order_id?: string | null
          phone: string
          reason?: string
          received_at?: string
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          storage_path?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          evidence?: Json
          file_hash?: string | null
          id?: string
          message_id?: string
          order_id?: string | null
          phone?: string
          reason?: string
          received_at?: string
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          storage_path?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_order_requests"
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
          contact_external_id: string | null
          contact_sync_attempts: number
          contact_sync_error: string | null
          contact_sync_status: string
          created_at: string
          id: string
          name: string
          name_status: string
          phone: string | null
          profile_name: string | null
          promotion_consent: boolean
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          consent_at?: string | null
          contact_external_id?: string | null
          contact_sync_attempts?: number
          contact_sync_error?: string | null
          contact_sync_status?: string
          created_at?: string
          id?: string
          name?: string
          name_status?: string
          phone?: string | null
          profile_name?: string | null
          promotion_consent?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          consent_at?: string | null
          contact_external_id?: string | null
          contact_sync_attempts?: number
          contact_sync_error?: string | null
          contact_sync_status?: string
          created_at?: string
          id?: string
          name?: string
          name_status?: string
          phone?: string | null
          profile_name?: string | null
          promotion_consent?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
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
      whatsapp_conversations: {
        Row: {
          assigned_name: string | null
          assigned_to: string | null
          attendance_status: string
          automation_paused: boolean
          awaiting_since: string | null
          created_at: string
          customer_id: string | null
          draft: Json
          draft_version: number
          last_auto_reply_at: string | null
          last_inbound_at: string | null
          last_message: string | null
          last_message_at: string
          last_read_at: string | null
          name: string | null
          phone: string
          unread: number
        }
        Insert: {
          assigned_name?: string | null
          assigned_to?: string | null
          attendance_status?: string
          automation_paused?: boolean
          awaiting_since?: string | null
          created_at?: string
          customer_id?: string | null
          draft?: Json
          draft_version?: number
          last_auto_reply_at?: string | null
          last_inbound_at?: string | null
          last_message?: string | null
          last_message_at?: string
          last_read_at?: string | null
          name?: string | null
          phone: string
          unread?: number
        }
        Update: {
          assigned_name?: string | null
          assigned_to?: string | null
          attendance_status?: string
          automation_paused?: boolean
          awaiting_since?: string | null
          created_at?: string
          customer_id?: string | null
          draft?: Json
          draft_version?: number
          last_auto_reply_at?: string | null
          last_inbound_at?: string | null
          last_message?: string | null
          last_message_at?: string
          last_read_at?: string | null
          name?: string | null
          phone?: string
          unread?: number
        }
        Relationships: []
      }
      whatsapp_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          dedup_key: string
          id: string
          kind: string
          lease_until: string | null
          next_attempt_at: string
          payload: Json
          phone: string
          processing_error: string | null
          provider_id: string | null
          state: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedup_key: string
          id?: string
          kind: string
          lease_until?: string | null
          next_attempt_at?: string
          payload: Json
          phone: string
          processing_error?: string | null
          provider_id?: string | null
          state?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedup_key?: string
          id?: string
          kind?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json
          phone?: string
          processing_error?: string | null
          provider_id?: string | null
          state?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error: string | null
          failed_at: string | null
          id: string
          kind: string
          media_id: string | null
          order_id: string | null
          phone: string
          provider_at: string
          read_at: string | null
          reply_to: string | null
          sent_at: string | null
          sent_by: string | null
          sent_by_name: string | null
          source: string
          status: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          error?: string | null
          failed_at?: string | null
          id?: string
          kind?: string
          media_id?: string | null
          order_id?: string | null
          phone: string
          provider_at?: string
          read_at?: string | null
          reply_to?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          source?: string
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          kind?: string
          media_id?: string | null
          order_id?: string | null
          phone?: string
          provider_at?: string
          read_at?: string | null
          reply_to?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          source?: string
          status?: string
          wa_message_id?: string | null
        }
        Relationships: []
      }
      whatsapp_notes: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          created_at: string
          id: string
          phone: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          phone: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notes_phone_fkey"
            columns: ["phone"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["phone"]
          },
        ]
      }
      whatsapp_order_requests: {
        Row: {
          accepted_by: string | null
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          closed_reason: string | null
          created_at: string
          id: string
          inbound_id: string
          order_id: string | null
          order_number: number | null
          phone: string
          public_code: string | null
          quoted_total: number
          request: Json
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          inbound_id: string
          order_id?: string | null
          order_number?: number | null
          phone: string
          public_code?: string | null
          quoted_total: number
          request: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          inbound_id?: string
          order_id?: string | null
          order_number?: number | null
          phone?: string
          public_code?: string | null
          quoted_total?: number
          request?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_order_requests_phone_fkey"
            columns: ["phone"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["phone"]
          },
        ]
      }
      whatsapp_pending_statuses: {
        Row: {
          errors: Json | null
          id: string
          provider_at: string
          status: string
          wa_message_id: string
        }
        Insert: {
          errors?: Json | null
          id?: string
          provider_at: string
          status: string
          wa_message_id: string
        }
        Update: {
          errors?: Json | null
          id?: string
          provider_at?: string
          status?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          account_event: string | null
          account_state: string
          auto_reply_enabled: boolean
          auto_reply_text: string
          business: Json
          id: number
          quick_replies: Json
          updated_at: string
        }
        Insert: {
          account_event?: string | null
          account_state?: string
          auto_reply_enabled?: boolean
          auto_reply_text?: string
          business?: Json
          id?: number
          quick_replies?: Json
          updated_at?: string
        }
        Update: {
          account_event?: string | null
          account_state?: string
          auto_reply_enabled?: boolean
          auto_reply_text?: string
          business?: Json
          id?: number
          quick_replies?: Json
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          lease_until: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_pdv_cashier_items: {
        Args: { items: Json; order_id: string }
        Returns: undefined
      }
      advance_pdv_cashier_order: {
        Args: { new_status: string; order_id: string }
        Returns: undefined
      }
      cancel_pdv_cashier_order: {
        Args: { order_id: string }
        Returns: undefined
      }
      catalog_place_order: {
        Args: { _client_key: string; _order: Json }
        Returns: Json
      }
      claim_pdv_admin: { Args: never; Returns: boolean }
      close_pdv_order: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      close_whatsapp_request: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      confirm_receipt_payment: {
        Args: { _id: string; _method?: string }
        Returns: Json
      }
      delivery_staff: { Args: never; Returns: boolean }
      depart_delivery: {
        Args: { _courier?: string; _order: string }
        Returns: undefined
      }
      finish_delivery_route: {
        Args: { new_status: string; route_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      link_payment_receipt: {
        Args: { _id: string; _request: string }
        Returns: undefined
      }
      lookup_delivery_addresses: {
        Args: { phone_query: string }
        Returns: Json
      }
      mark_receipt_for_request: {
        Args: { _id: string; _request: string }
        Returns: undefined
      }
      mark_receipt_received: {
        Args: { _id: string; _order: string }
        Returns: undefined
      }
      normalize_phone: { Args: { _raw: string }; Returns: string }
      open_pdv_cash: { Args: { _initial?: number }; Returns: undefined }
      pay_pdv_cashier: {
        Args: { order_id: string; payment_method: string }
        Returns: undefined
      }
      read_delivery_board: { Args: never; Returns: Json }
      read_pdv_cashier: { Args: never; Returns: Json }
      read_pdv_operator: { Args: never; Returns: Json }
      read_public_catalog: { Args: never; Returns: Json }
      record_payment_receipt: {
        Args: {
          _compatible: boolean
          _evidence: Json
          _hash: string
          _message: string
          _path: string
          _reason: string
          _request: string
        }
        Returns: string
      }
      record_payment_receipt_input: { Args: { _input: Json }; Returns: string }
      register_staff_receipt: {
        Args: { _message: string; _order: string; _path: string }
        Returns: string
      }
      review_payment_receipt: {
        Args: { _confirm: boolean; _id: string; _reason: string }
        Returns: undefined
      }
      revoke_pdv_access: { Args: { target: string }; Returns: undefined }
      save_catalog_product: {
        Args: {
          _description: string
          _featured: boolean
          _illustrative: boolean
          _image_url: string
          _product_id: string
          _published: boolean
          _sort: number
        }
        Returns: undefined
      }
      save_customer_delivery_address: {
        Args: { address_id?: string; customer: string; input?: Json }
        Returns: undefined
      }
      save_delivery_courier: {
        Args: {
          account_id?: string
          courier_id?: string
          courier_name?: string
          courier_phone?: string
        }
        Returns: string
      }
      save_delivery_route: {
        Args: {
          courier?: string
          origin_address?: string
          route_id?: string
          route_name?: string
          stops?: string[]
        }
        Returns: string
      }
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
      start_delivery_route: { Args: { route_id: string }; Returns: undefined }
      submit_pdv_operator: { Args: { request: Json }; Returns: Json }
      submit_pdv_operator_with_contact: {
        Args: { request: Json }
        Returns: Json
      }
      update_customer_identity: {
        Args: { _id: string; _name: string; _phone: string }
        Returns: undefined
      }
      update_delivery_address: {
        Args: { delivery_id: string; input: Json }
        Returns: undefined
      }
      update_delivery_status: {
        Args: { delivery_id: string; issue?: string; new_status: string }
        Returns: undefined
      }
      valid_person_name: { Args: { _n: string }; Returns: boolean }
      validate_delivery_input: { Args: { input: Json }; Returns: undefined }
      wa_accept_request: { Args: { _id: string }; Returns: Json }
      wa_apply_status: {
        Args: { _at: string; _errors: Json; _id: string; _status: string }
        Returns: boolean
      }
      wa_auto_accept_request: { Args: { _id: string }; Returns: Json }
      wa_claim_job: {
        Args: never
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          dedup_key: string
          id: string
          kind: string
          lease_until: string | null
          next_attempt_at: string
          payload: Json
          phone: string
          processing_error: string | null
          provider_id: string | null
          state: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wa_confirm_request: {
        Args: {
          _inbound_id: string
          _phone: string
          _request: Json
          _total: number
          _version: number
        }
        Returns: string
      }
      wa_conversation_action: {
        Args: { _action: string; _body?: string; _phone: string }
        Returns: undefined
      }
      wa_customer_card: { Args: { _phone: string }; Returns: Json }
      wa_reconcile: { Args: { _id: string }; Returns: undefined }
      wa_reject_request: { Args: { _id: string }; Returns: undefined }
      wa_staff: { Args: never; Returns: boolean }
      wa_staff_list: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      wa_store_inbound: { Args: { _message: Json }; Returns: boolean }
      wa_touch_inbound: {
        Args: { _at: string; _body: string; _name: string; _phone: string }
        Returns: undefined
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
