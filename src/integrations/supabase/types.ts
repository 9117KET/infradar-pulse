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
          failure_count: number
          last_duration_ms: number | null
          last_run_at: string | null
          last_run_status: string | null
          success_count: number
          updated_at: string
        }
        Insert: {
          agent_type: string
          enabled?: boolean
          failure_count?: number
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_run_status?: string | null
          success_count?: number
          updated_at?: string
        }
        Update: {
          agent_type?: string
          enabled?: boolean
          failure_count?: number
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_run_status?: string | null
          success_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_health_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json
          detected_at: string
          failure_count: number
          id: string
          job_name: string | null
          notified_at: string | null
          resolved_at: string | null
          sample_message: string | null
          severity: string
          total_runs: number
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json
          detected_at?: string
          failure_count?: number
          id?: string
          job_name?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          sample_message?: string | null
          severity?: string
          total_runs?: number
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json
          detected_at?: string
          failure_count?: number
          id?: string
          job_name?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          sample_message?: string | null
          severity?: string
          total_runs?: number
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
      candidate_evidence_links: {
        Row: {
          candidate_id: string
          created_at: string
          evidence_id: string
          quote: string | null
          relevance_score: number
          supports_fields: string[]
        }
        Insert: {
          candidate_id: string
          created_at?: string
          evidence_id: string
          quote?: string | null
          relevance_score?: number
          supports_fields?: string[]
        }
        Update: {
          candidate_id?: string
          created_at?: string
          evidence_id?: string
          quote?: string | null
          relevance_score?: number
          supports_fields?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "candidate_evidence_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "project_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "raw_evidence"
            referencedColumns: ["id"]
          },
        ]
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
      dataset_snapshots: {
        Row: {
          created_at: string
          dataset_key: string
          generated_at: string
          generated_by: string
          id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          dataset_key: string
          generated_at?: string
          generated_by?: string
          id?: string
          payload?: Json
        }
        Update: {
          created_at?: string
          dataset_key?: string
          generated_at?: string
          generated_by?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      digests: {
        Row: {
          created_at: string
          id: string
          markdown: string | null
          payload: Json
          read_at: string | null
          rule_id: string | null
          status: string
          summary: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          markdown?: string | null
          payload?: Json
          read_at?: string | null
          rule_id?: string | null
          status?: string
          summary?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          markdown?: string | null
          payload?: Json
          read_at?: string | null
          rule_id?: string | null
          status?: string
          summary?: string | null
          title?: string
          user_id?: string
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
      feedback: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          page: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          type: Database["public"]["Enums"]["feedback_type"]
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          page?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          page?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          sources: Json
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
          sources?: Json
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
          sources?: Json
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
      no_card_trial_grants: {
        Row: {
          created_at: string
          email_normalized: string
          ends_at: string
          environment: string
          id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_normalized: string
          ends_at?: string
          environment?: string
          id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_normalized?: string
          ends_at?: string
          environment?: string
          id?: string
          starts_at?: string
          status?: string
          updated_at?: string
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
      pilot_access_config: {
        Row: {
          duration_days: number
          enabled: boolean
          environment: string
          max_seats: number
          updated_at: string
        }
        Insert: {
          duration_days?: number
          enabled?: boolean
          environment?: string
          max_seats?: number
          updated_at?: string
        }
        Update: {
          duration_days?: number
          enabled?: boolean
          environment?: string
          max_seats?: number
          updated_at?: string
        }
        Relationships: []
      }
      pilot_access_grants: {
        Row: {
          created_at: string
          email_normalized: string | null
          ends_at: string
          environment: string
          grant_source: string
          granted_by: string | null
          id: string
          seat_number: number | null
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_normalized?: string | null
          ends_at: string
          environment?: string
          grant_source?: string
          granted_by?: string | null
          id?: string
          seat_number?: number | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_normalized?: string | null
          ends_at?: string
          environment?: string
          grant_source?: string
          granted_by?: string | null
          id?: string
          seat_number?: number | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acq_campaign: string | null
          acq_content: string | null
          acq_medium: string | null
          acq_source: string | null
          acq_term: string | null
          company: string | null
          created_at: string | null
          critical_only: boolean
          display_name: string | null
          email_alerts: boolean
          id: string
          onboarded: boolean | null
          referred_by_code: string | null
          regions: string[] | null
          role: string | null
          sectors: string[] | null
          stages: string[] | null
          tour_completed: boolean | null
          updated_at: string | null
          weekly_digest: boolean
        }
        Insert: {
          acq_campaign?: string | null
          acq_content?: string | null
          acq_medium?: string | null
          acq_source?: string | null
          acq_term?: string | null
          company?: string | null
          created_at?: string | null
          critical_only?: boolean
          display_name?: string | null
          email_alerts?: boolean
          id: string
          onboarded?: boolean | null
          referred_by_code?: string | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          tour_completed?: boolean | null
          updated_at?: string | null
          weekly_digest?: boolean
        }
        Update: {
          acq_campaign?: string | null
          acq_content?: string | null
          acq_medium?: string | null
          acq_source?: string | null
          acq_term?: string | null
          company?: string | null
          created_at?: string | null
          critical_only?: boolean
          display_name?: string | null
          email_alerts?: boolean
          id?: string
          onboarded?: boolean | null
          referred_by_code?: string | null
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
      project_candidates: {
        Row: {
          canonical_project_id: string | null
          confidence: number
          country: string | null
          created_at: string
          description: string | null
          discovered_by: string
          duplicate_confidence: number | null
          duplicate_of: string | null
          extracted_claims: Json
          id: string
          lat: number | null
          lng: number | null
          name: string
          normalized_name: string
          pipeline_status: string
          region: string | null
          review_status: string
          risk_score: number
          sector: string | null
          source_url: string | null
          stage: string | null
          status: string | null
          timeline: string | null
          updated_at: string
          value_label: string | null
          value_usd: number | null
        }
        Insert: {
          canonical_project_id?: string | null
          confidence?: number
          country?: string | null
          created_at?: string
          description?: string | null
          discovered_by: string
          duplicate_confidence?: number | null
          duplicate_of?: string | null
          extracted_claims?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          normalized_name: string
          pipeline_status?: string
          region?: string | null
          review_status?: string
          risk_score?: number
          sector?: string | null
          source_url?: string | null
          stage?: string | null
          status?: string | null
          timeline?: string | null
          updated_at?: string
          value_label?: string | null
          value_usd?: number | null
        }
        Update: {
          canonical_project_id?: string | null
          confidence?: number
          country?: string | null
          created_at?: string
          description?: string | null
          discovered_by?: string
          duplicate_confidence?: number | null
          duplicate_of?: string | null
          extracted_claims?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          normalized_name?: string
          pipeline_status?: string
          region?: string | null
          review_status?: string
          risk_score?: number
          sector?: string | null
          source_url?: string | null
          stage?: string | null
          status?: string | null
          timeline?: string | null
          updated_at?: string
          value_label?: string | null
          value_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_candidates_canonical_project_id_fkey"
            columns: ["canonical_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_candidates_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "project_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_claims: {
        Row: {
          candidate_id: string
          confidence: number
          created_at: string
          evidence_id: string | null
          field_name: string
          field_value: string | null
          id: string
          quote: string | null
        }
        Insert: {
          candidate_id: string
          confidence?: number
          created_at?: string
          evidence_id?: string | null
          field_name: string
          field_value?: string | null
          id?: string
          quote?: string | null
        }
        Update: {
          candidate_id?: string
          confidence?: number
          created_at?: string
          evidence_id?: string | null
          field_name?: string
          field_value?: string | null
          id?: string
          quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_claims_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "project_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claims_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "raw_evidence"
            referencedColumns: ["id"]
          },
        ]
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
      project_recheck_findings: {
        Row: {
          confidence_snapshot: number | null
          contact_count: number | null
          created_at: string
          created_by: string
          finding_type: Database["public"]["Enums"]["project_recheck_finding_type"]
          id: string
          last_detected_at: string
          missing_fields: string[]
          notes: string
          project_id: string
          quality_score: number | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_reason: string | null
          risk_snapshot: number | null
          severity: Database["public"]["Enums"]["project_recheck_severity"]
          source_count: number | null
          status: Database["public"]["Enums"]["project_recheck_status"]
          updated_at: string
        }
        Insert: {
          confidence_snapshot?: number | null
          contact_count?: number | null
          created_at?: string
          created_by?: string
          finding_type: Database["public"]["Enums"]["project_recheck_finding_type"]
          id?: string
          last_detected_at?: string
          missing_fields?: string[]
          notes?: string
          project_id: string
          quality_score?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_reason?: string | null
          risk_snapshot?: number | null
          severity?: Database["public"]["Enums"]["project_recheck_severity"]
          source_count?: number | null
          status?: Database["public"]["Enums"]["project_recheck_status"]
          updated_at?: string
        }
        Update: {
          confidence_snapshot?: number | null
          contact_count?: number | null
          created_at?: string
          created_by?: string
          finding_type?: Database["public"]["Enums"]["project_recheck_finding_type"]
          id?: string
          last_detected_at?: string
          missing_fields?: string[]
          notes?: string
          project_id?: string
          quality_score?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_reason?: string | null
          risk_snapshot?: number | null
          severity?: Database["public"]["Enums"]["project_recheck_severity"]
          source_count?: number | null
          status?: Database["public"]["Enums"]["project_recheck_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_recheck_findings_project_id_fkey"
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
      quality_scores: {
        Row: {
          candidate_id: string
          completeness_score: number
          confidence_score: number
          created_at: string
          details: Json
          evidence_score: number
          flags: string[]
          freshness_score: number
          id: string
          missing_fields: string[]
          recommendation: string
          source_score: number
          total_score: number
        }
        Insert: {
          candidate_id: string
          completeness_score?: number
          confidence_score?: number
          created_at?: string
          details?: Json
          evidence_score?: number
          flags?: string[]
          freshness_score?: number
          id?: string
          missing_fields?: string[]
          recommendation?: string
          source_score?: number
          total_score?: number
        }
        Update: {
          candidate_id?: string
          completeness_score?: number
          confidence_score?: number
          created_at?: string
          details?: Json
          evidence_score?: number
          flags?: string[]
          freshness_score?: number
          id?: string
          missing_fields?: string[]
          recommendation?: string
          source_score?: number
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_scores_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "project_candidates"
            referencedColumns: ["id"]
          },
        ]
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
      raw_evidence: {
        Row: {
          canonical_url: string | null
          content_hash: string | null
          created_at: string
          extracted_text: string | null
          extraction_confidence: number | null
          fetch_status: string
          id: string
          kind: string
          metadata: Json
          published_at: string | null
          source_id: string | null
          source_key: string
          summary: string | null
          title: string | null
          url: string
        }
        Insert: {
          canonical_url?: string | null
          content_hash?: string | null
          created_at?: string
          extracted_text?: string | null
          extraction_confidence?: number | null
          fetch_status?: string
          id?: string
          kind?: string
          metadata?: Json
          published_at?: string | null
          source_id?: string | null
          source_key: string
          summary?: string | null
          title?: string | null
          url: string
        }
        Update: {
          canonical_url?: string | null
          content_hash?: string | null
          created_at?: string
          extracted_text?: string | null
          extraction_confidence?: number | null
          fetch_status?: string
          id?: string
          kind?: string
          metadata?: Json
          published_at?: string | null
          source_id?: string | null
          source_key?: string
          summary?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_events: {
        Row: {
          code: string
          conversion_environment: string | null
          conversion_plan_key: string | null
          conversion_price_id: string | null
          conversion_subscription_id: string | null
          converted_at: string | null
          converted_to_paid: boolean
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_status: string
        }
        Insert: {
          code: string
          conversion_environment?: string | null
          conversion_plan_key?: string | null
          conversion_price_id?: string | null
          conversion_subscription_id?: string | null
          converted_at?: string | null
          converted_to_paid?: boolean
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_status?: string
        }
        Update: {
          code?: string
          conversion_environment?: string | null
          conversion_plan_key?: string | null
          conversion_price_id?: string | null
          conversion_subscription_id?: string | null
          converted_at?: string | null
          converted_to_paid?: boolean
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_events_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_events_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          citations: Json
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          markdown: string | null
          parameters: Json
          report_type: string
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          citations?: Json
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          markdown?: string | null
          parameters?: Json
          report_type: string
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          citations?: Json
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          markdown?: string | null
          parameters?: Json
          report_type?: string
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      research_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: string | null
          error: string | null
          id: string
          query: string
          requested_by: string | null
          result: Json | null
          status: Database["public"]["Enums"]["research_task_status"]
          task_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error?: string | null
          id?: string
          query: string
          requested_by?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["research_task_status"]
          task_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error?: string | null
          id?: string
          query?: string
          requested_by?: string | null
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
      source_registry: {
        Row: {
          base_url: string | null
          crawl_frequency_minutes: number
          created_at: string
          id: string
          kind: string
          last_success_at: string | null
          name: string
          reliability_score: number
          source_key: string
          status: string
          supports_api: boolean
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          crawl_frequency_minutes?: number
          created_at?: string
          id?: string
          kind?: string
          last_success_at?: string | null
          name: string
          reliability_score?: number
          source_key: string
          status?: string
          supports_api?: boolean
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          crawl_frequency_minutes?: number
          created_at?: string
          id?: string
          kind?: string
          last_success_at?: string | null
          name?: string
          reliability_score?: number
          source_key?: string
          status?: string
          supports_api?: boolean
          updated_at?: string
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
          entitlement_plan_key: string | null
          entitlement_plan_until: string | null
          environment: string
          id: string
          notified_trial_ending_at: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_key: string
          price_id: string
          product_id: string
          scheduled_change_action: string | null
          scheduled_change_effective_at: string | null
          scheduled_plan_key: string | null
          scheduled_price_id: string | null
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
          entitlement_plan_key?: string | null
          entitlement_plan_until?: string | null
          environment?: string
          id?: string
          notified_trial_ending_at?: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_key?: string
          price_id: string
          product_id: string
          scheduled_change_action?: string | null
          scheduled_change_effective_at?: string | null
          scheduled_plan_key?: string | null
          scheduled_price_id?: string | null
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
          entitlement_plan_key?: string | null
          entitlement_plan_until?: string | null
          environment?: string
          id?: string
          notified_trial_ending_at?: string | null
          paddle_customer_id?: string
          paddle_subscription_id?: string
          plan_key?: string
          price_id?: string
          product_id?: string
          scheduled_change_action?: string | null
          scheduled_change_effective_at?: string | null
          scheduled_plan_key?: string | null
          scheduled_price_id?: string | null
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
      update_proposals: {
        Row: {
          confidence: number
          created_at: string
          field_changes: Json
          id: string
          impact: string | null
          project_id: string | null
          proposed_by_agent: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string | null
          status: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          field_changes?: Json
          id?: string
          impact?: string | null
          project_id?: string | null
          proposed_by_agent: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          field_changes?: Json
          id?: string
          impact?: string | null
          project_id?: string | null
          proposed_by_agent?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "update_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      user_events: {
        Row: {
          anonymous_id: string | null
          created_at: string
          event_category: string
          event_name: string
          id: string
          page_path: string | null
          plan_key: string | null
          properties: Json
          referrer: string | null
          roles: string[]
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          created_at?: string
          event_category?: string
          event_name: string
          id?: string
          page_path?: string | null
          plan_key?: string | null
          properties?: Json
          referrer?: string | null
          roles?: string[]
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          created_at?: string
          event_category?: string
          event_name?: string
          id?: string
          page_path?: string | null
          plan_key?: string | null
          properties?: Json
          referrer?: string | null
          roles?: string[]
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
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
      agent_health: {
        Row: {
          agent_type: string | null
          cron_active: boolean | null
          cron_schedule: string | null
          cron_scheduled: boolean | null
          enabled: boolean | null
          failure_count: number | null
          health_status: string | null
          last_duration_ms: number | null
          last_run_at: string | null
          last_run_status: string | null
          recent_failure_rate_pct: number | null
          recent_runs_24h: number | null
          success_count: number | null
          success_rate_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _agent_cron_auth_header: { Args: never; Returns: Json }
      admin_grant_pilot_access: {
        Args: { p_email?: string; p_environment?: string; p_user_id: string }
        Returns: Json
      }
      admin_list_user_emails: {
        Args: never
        Returns: {
          email: string
          email_confirmed_at: string
          user_id: string
        }[]
      }
      admin_revoke_pilot_access: {
        Args: { p_environment?: string; p_user_id: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      begin_agent_task: {
        Args: { p_query: string; p_requested_by?: string; p_task_type: string }
        Returns: Json
      }
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
      claim_own_pilot_access: {
        Args: { p_email?: string; p_environment?: string }
        Returns: Json
      }
      claim_referral_signup: { Args: { p_code: string }; Returns: boolean }
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
      detect_agent_auth_failures: { Args: { p_hours?: number }; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finish_agent_run: {
        Args: { p_agent_type: string; p_duration_ms?: number; p_status: string }
        Returns: undefined
      }
      get_agent_cron_health: {
        Args: { p_hours?: number }
        Returns: {
          auth_failures: number
          failed_runs: number
          failure_rate_pct: number
          job_name: string
          last_failure_at: string
          last_failure_message: string
          last_run_at: string
          suspected_auth_failure: boolean
          total_runs: number
        }[]
      }
      get_agent_monitoring_summary: {
        Args: { p_recent_limit?: number }
        Returns: Json
      }
      get_agent_scheduler_activity: {
        Args: never
        Returns: {
          last_scheduler_run: string
          scheduler_failures: number
          scheduler_runs: number
          task_type: string
        }[]
      }
      get_existing_project_recheck_summary: { Args: never; Returns: Json }
      get_paywall_dropoff: { Args: { p_days?: number }; Returns: Json }
      get_pilot_access_summary: {
        Args: { p_environment?: string }
        Returns: Json
      }
      get_product_analytics_summary: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_public_pilot_access_counter: {
        Args: { p_environment?: string }
        Returns: Json
      }
      get_signup_funnel: { Args: { p_days?: number }; Returns: Json }
      get_traction_stats: { Args: never; Returns: Json }
      has_active_pilot_access: {
        Args: { _user_id: string; check_env?: string }
        Returns: boolean
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_paid_or_staff_access:
        | { Args: { _user_id: string }; Returns: boolean }
        | { Args: { _user_id: string; check_env?: string }; Returns: boolean }
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
      list_admin_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
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
      reap_stuck_research_tasks: { Args: never; Returns: number }
      rebuild_agent_config_from_tasks: { Args: never; Returns: undefined }
      record_trial_started: {
        Args: {
          p_email: string
          p_environment: string
          p_paddle_customer_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      reset_stuck_agent_task: { Args: { p_agent_type: string }; Returns: Json }
      resolve_agent_auth_alerts: {
        Args: { p_job_name: string }
        Returns: number
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
      upsert_vault_secret: {
        Args: { p_name: string; p_secret: string }
        Returns: Json
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
      feedback_status:
        | "new"
        | "triaged"
        | "in_progress"
        | "resolved"
        | "wont_fix"
      feedback_type: "bug" | "idea" | "praise" | "other"
      project_recheck_finding_type:
        | "missing_source"
        | "missing_contact"
        | "low_confidence"
        | "stale_record"
        | "high_risk"
      project_recheck_severity: "low" | "medium" | "high" | "critical"
      project_recheck_status: "open" | "in_review" | "resolved" | "dismissed"
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
      feedback_status: [
        "new",
        "triaged",
        "in_progress",
        "resolved",
        "wont_fix",
      ],
      feedback_type: ["bug", "idea", "praise", "other"],
      project_recheck_finding_type: [
        "missing_source",
        "missing_contact",
        "low_confidence",
        "stale_record",
        "high_risk",
      ],
      project_recheck_severity: ["low", "medium", "high", "critical"],
      project_recheck_status: ["open", "in_review", "resolved", "dismissed"],
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
