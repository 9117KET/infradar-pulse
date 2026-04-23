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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          agent_type: string
          enabled: boolean
          updated_at: string
        }
        Insert: {
          agent_type: string
          enabled?: boolean
          updated_at?: string
        }
        Update: {
          agent_type?: string
          enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          filters?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          category: Database["public"]["Enums"]["alert_category"]
          created_at: string
          id: string
          message: string
          project_id: string | null
          project_name: string
          read: boolean
          severity: Database["public"]["Enums"]["alert_severity"]
          source_url: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["alert_category"]
          created_at?: string
          id?: string
          message: string
          project_id?: string | null
          project_name: string
          read?: boolean
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_url?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["alert_category"]
          created_at?: string
          id?: string
          message?: string
          project_id?: string | null
          project_name?: string
          read?: boolean
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          environment: string
          event_type: string
          id: string
          occurred_at: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          payload: Json | null
          plan_key: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          environment?: string
          event_type: string
          id?: string
          occurred_at?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          payload?: Json | null
          plan_key?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          occurred_at?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          payload?: Json | null
          plan_key?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          message: string
          name: string
          status: string
          subject: string
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          message: string
          name: string
          status?: string
          subject: string
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          message?: string
          name?: string
          status?: string
          subject?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      evidence_sources: {
        Row: {
          added_by: string | null
          date: string
          description: string | null
          id: string
          project_id: string
          source: string
          title: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          url: string
          verified: boolean
        }
        Insert: {
          added_by?: string | null
          date: string
          description?: string | null
          id?: string
          project_id: string
          source: string
          title?: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          url?: string
          verified?: boolean
        }
        Update: {
          added_by?: string | null
          date?: string
          description?: string | null
          id?: string
          project_id?: string
          source?: string
          title?: string | null
          type?: Database["public"]["Enums"]["evidence_type"]
          url?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evidence_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          ai_generated: boolean
          author: string
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string
          id: string
          published: boolean
          reading_time_min: number
          related_project_ids: string[] | null
          slug: string
          source_url: string | null
          tag: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          author?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          reading_time_min?: number
          related_project_ids?: string[] | null
          slug: string
          source_url?: string | null
          tag?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          author?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          reading_time_min?: number
          related_project_ids?: string[] | null
          slug?: string
          source_url?: string | null
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lifetime_grants: {
        Row: {
          environment: string
          granted_at: string
          id: string
          paddle_customer_id: string | null
          paddle_transaction_id: string | null
          seat_number: number | null
          user_id: string
        }
        Insert: {
          environment?: string
          granted_at?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_transaction_id?: string | null
          seat_number?: number | null
          user_id: string
        }
        Update: {
          environment?: string
          granted_at?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_transaction_id?: string | null
          seat_number?: number | null
          user_id?: string
        }
        Relationships: []
      }
      pending_role_assignments: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string | null
          critical_only: boolean
          display_name: string | null
          email_alerts: boolean
          id: string
          onboarded: boolean | null
          regions: string[] | null
          role: string | null
          sectors: string[] | null
          stages: string[] | null
          tour_completed: boolean | null
          updated_at: string | null
          weekly_digest: boolean
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          critical_only?: boolean
          display_name?: string | null
          email_alerts?: boolean
          id: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          tour_completed?: boolean | null
          updated_at?: string | null
          weekly_digest?: boolean
        }
        Update: {
          company?: string | null
          created_at?: string | null
          critical_only?: boolean
          display_name?: string | null
          email_alerts?: boolean
          id?: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          tour_completed?: boolean | null
          updated_at?: string | null
          weekly_digest?: boolean
        }
        Relationships: []
      }
      project_contacts: {
        Row: {
          added_by: string
          contact_type: string
          created_at: string
          email: string | null
          id: string
          name: string
          organization: string
          phone: string | null
          project_id: string
          role: string
          source: string
          source_url: string | null
          verified: boolean
        }
        Insert: {
          added_by?: string
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization?: string
          phone?: string | null
          project_id: string
          role?: string
          source?: string
          source_url?: string | null
          verified?: boolean
        }
        Update: {
          added_by?: string
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization?: string
          phone?: string | null
          project_id?: string
          role?: string
          source?: string
          source_url?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed: boolean
          date: string
          id: string
          project_id: string
          title: string
        }
        Insert: {
          completed?: boolean
          date: string
          id?: string
          project_id: string
          title: string
        }
        Update: {
          completed?: boolean
          date?: string
          id?: string
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stakeholders: {
        Row: {
          id: string
          name: string
          project_id: string
        }
        Insert: {
          id?: string
          name: string
          project_id: string
        }
        Update: {
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stakeholders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          created_at: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id: string
          source?: string | null
        }
        Update: {
          created_at?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_verification_log: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string | null
          project_id: string
          reason: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by?: string | null
          project_id: string
          reason?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          project_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_verification_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ai_generated: boolean
          approved: boolean
          confidence: number
          country: string
          created_at: string
          description: string
          detailed_analysis: string | null
          environmental_impact: string | null
          funding_sources: string | null
          id: string
          key_risks: string | null
          last_updated: string
          lat: number
          lng: number
          name: string
          political_context: string | null
          region: Database["public"]["Enums"]["project_region"]
          risk_score: number
          sector: Database["public"]["Enums"]["project_sector"]
          slug: string
          source_url: string | null
          stage: Database["public"]["Enums"]["project_stage"]
          status: Database["public"]["Enums"]["project_status"]
          timeline: string | null
          value_label: string
          value_usd: number
        }
        Insert: {
          ai_generated?: boolean
          approved?: boolean
          confidence?: number
          country: string
          created_at?: string
          description?: string
          detailed_analysis?: string | null
          environmental_impact?: string | null
          funding_sources?: string | null
          id?: string
          key_risks?: string | null
          last_updated?: string
          lat: number
          lng: number
          name: string
          political_context?: string | null
          region: Database["public"]["Enums"]["project_region"]
          risk_score?: number
          sector: Database["public"]["Enums"]["project_sector"]
          slug: string
          source_url?: string | null
          stage?: Database["public"]["Enums"]["project_stage"]
          status?: Database["public"]["Enums"]["project_status"]
          timeline?: string | null
          value_label?: string
          value_usd?: number
        }
        Update: {
          ai_generated?: boolean
          approved?: boolean
          confidence?: number
          country?: string
          created_at?: string
          description?: string
          detailed_analysis?: string | null
          environmental_impact?: string | null
          funding_sources?: string | null
          id?: string
          key_risks?: string | null
          last_updated?: string
          lat?: number
          lng?: number
          name?: string
          political_context?: string | null
          region?: Database["public"]["Enums"]["project_region"]
          risk_score?: number
          sector?: Database["public"]["Enums"]["project_sector"]
          slug?: string
          source_url?: string | null
          stage?: Database["public"]["Enums"]["project_stage"]
          status?: Database["public"]["Enums"]["project_status"]
          timeline?: string | null
          value_label?: string
          value_usd?: number
        }
        Relationships: []
      }
      quota_requests: {
        Row: {
          created_at: string
          current_plan: string
          id: string
          metric: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_plan: string
          id?: string
          metric: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_plan?: string
          id?: string
          metric?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      research_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          query: string
          result: Json | null
          status: Database["public"]["Enums"]["research_task_status"]
          task_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          query: string
          result?: Json | null
          status?: Database["public"]["Enums"]["research_task_status"]
          task_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          query?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["research_task_status"]
          task_type?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          notify_email: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          notify_email?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          notify_email?: boolean
          user_id?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          preferences: Json | null
          type: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          preferences?: Json | null
          type?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          preferences?: Json | null
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          notified_trial_ending_at: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_key: string
          price_id: string
          product_id: string
          status: string
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          notified_trial_ending_at?: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_key?: string
          price_id: string
          product_id: string
          status?: string
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          notified_trial_ending_at?: string | null
          paddle_customer_id?: string
          paddle_subscription_id?: string
          plan_key?: string
          price_id?: string
          product_id?: string
          status?: string
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tracked_projects: {
        Row: {
          created_at: string
          id: string
          notes: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_history: {
        Row: {
          created_at: string
          email_normalized: string
          environment: string
          id: string
          paddle_customer_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_normalized: string
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_normalized?: string
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          id: string
          metric: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          id?: string
          metric: string
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          id?: string
          metric?: string
          period_start?: string
          updated_at?: string
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
      waitlist: {
        Row: {
          challenge: string | null
          company: string | null
          company_size: string | null
          created_at: string
          email: string
          id: string
          interest: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          challenge?: string | null
          company?: string | null
          company_size?: string | null
          created_at?: string
          email: string
          id?: string
          interest?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          challenge?: string | null
          company?: string | null
          company_size?: string | null
          created_at?: string
          email?: string
          id?: string
          interest?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_trial_eligible: {
        Args: {
          p_email: string
          p_environment: string
          p_paddle_customer_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      claim_lifetime_seat: {
        Args: {
          p_environment: string
          p_max_seats?: number
          p_paddle_customer_id: string
          p_paddle_transaction_id: string
          p_user_id: string
        }
        Returns: number
      }
      consume_quota: {
        Args: {
          p_daily_cap: number
          p_hourly_cap: number
          p_metric: string
          p_user_id: string
        }
        Returns: {
          ok: boolean
          reason: string
          used_day: number
          used_hour: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_usage_for_user: {
        Args: { p_metric: string; p_user_id: string }
        Returns: undefined
      }
      increment_usage_metric: {
        Args: { metric_name: string; user_uuid: string }
        Returns: undefined
      }
      lifetime_seats_taken: {
        Args: { p_environment?: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_email: { Args: { p_email: string }; Returns: string }
      prune_old_usage_counters: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_trial_started: {
        Args: {
          p_email: string
          p_environment: string
          p_paddle_customer_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      try_consume_quota: {
        Args: {
          p_daily_cap: number
          p_hourly_cap: number
          p_metric: string
          p_user_id: string
        }
        Returns: {
          ok: boolean
          reason: string
          used_day: number
          used_hour: number
        }[]
      }
    }
    Enums: {
      alert_category:
        | "political"
        | "financial"
        | "regulatory"
        | "supply_chain"
        | "environmental"
        | "construction"
        | "stakeholder"
        | "market"
        | "security"
      alert_severity: "critical" | "high" | "medium" | "low"
      app_role: "user" | "researcher" | "admin"
      evidence_type: "Satellite" | "Filing" | "News" | "Registry" | "Partner"
      project_region:
        | "MENA"
        | "East Africa"
        | "West Africa"
        | "Southern Africa"
        | "Central Africa"
        | "North America"
        | "South America"
        | "Europe"
        | "Central Asia"
        | "South Asia"
        | "East Asia"
        | "Southeast Asia"
        | "Oceania"
        | "Caribbean"
      project_sector:
        | "Urban Development"
        | "Digital Infrastructure"
        | "Renewable Energy"
        | "Transport"
        | "Water"
        | "Energy"
      project_stage:
        | "Planned"
        | "Tender"
        | "Awarded"
        | "Financing"
        | "Construction"
        | "Completed"
        | "Cancelled"
        | "Stopped"
      project_status: "Verified" | "Stable" | "Pending" | "At Risk"
      research_task_status: "pending" | "running" | "completed" | "failed"
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
      alert_category: [
        "political",
        "financial",
        "regulatory",
        "supply_chain",
        "environmental",
        "construction",
        "stakeholder",
        "market",
        "security",
      ],
      alert_severity: ["critical", "high", "medium", "low"],
      app_role: ["user", "researcher", "admin"],
      evidence_type: ["Satellite", "Filing", "News", "Registry", "Partner"],
      project_region: [
        "MENA",
        "East Africa",
        "West Africa",
        "Southern Africa",
        "Central Africa",
        "North America",
        "South America",
        "Europe",
        "Central Asia",
        "South Asia",
        "East Asia",
        "Southeast Asia",
        "Oceania",
        "Caribbean",
      ],
      project_sector: [
        "Urban Development",
        "Digital Infrastructure",
        "Renewable Energy",
        "Transport",
        "Water",
        "Energy",
      ],
      project_stage: [
        "Planned",
        "Tender",
        "Awarded",
        "Financing",
        "Construction",
        "Completed",
        "Cancelled",
        "Stopped",
      ],
      project_status: ["Verified", "Stable", "Pending", "At Risk"],
      research_task_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
