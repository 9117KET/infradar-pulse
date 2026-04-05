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
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_type: string
          enabled?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_type?: string
          enabled?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
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
          critical_only: boolean | null
          display_name: string | null
          email_alerts: boolean | null
          id: string
          onboarded: boolean | null
          regions: string[] | null
          role: string | null
          sectors: string[] | null
          stages: string[] | null
          tour_completed: boolean | null
          updated_at: string | null
          weekly_digest: boolean | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          critical_only?: boolean | null
          display_name?: string | null
          email_alerts?: boolean | null
          id: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          tour_completed?: boolean | null
          updated_at?: string | null
          weekly_digest?: boolean | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          critical_only?: boolean | null
          display_name?: string | null
          email_alerts?: boolean | null
          id?: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          tour_completed?: boolean | null
          updated_at?: string | null
          weekly_digest?: boolean | null
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
          created_by: string | null
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
          research_saved_by: string | null
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
          created_by?: string | null
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
          research_saved_by?: string | null
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
          created_by?: string | null
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
          research_saved_by?: string | null
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
      research_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
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
      stripe_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          id: string
          plan_key: string
          price_id: string | null
          status: string
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          id?: string
          plan_key?: string
          price_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          id?: string
          plan_key?: string
          price_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          metric: string
          period_start: string
          user_id: string
        }
        Insert: {
          count?: number
          metric: string
          period_start: string
          user_id: string
        }
        Update: {
          count?: number
          metric?: string
          period_start?: string
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
      admin_list_user_emails: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          email: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: {
        Args: {
          _user_id: string
        }
        Returns: boolean
      }
      increment_usage_metric: {
        Args: { p_metric: string }
        Returns: Json
      }
      increment_usage_for_user: {
        Args: { p_metric: string; p_user_id: string }
        Returns: undefined
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
        | "AI Infrastructure"
        | "Building Construction"
        | "Chemical"
        | "Data Centers"
        | "Digital Infrastructure"
        | "Energy"
        | "Industrial"
        | "Infrastructure"
        | "Mining"
        | "Oil & Gas"
        | "Renewable Energy"
        | "Transport"
        | "Urban Development"
        | "Water"
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
        "AI Infrastructure",
        "Building Construction",
        "Chemical",
        "Data Centers",
        "Digital Infrastructure",
        "Energy",
        "Industrial",
        "Infrastructure",
        "Mining",
        "Oil & Gas",
        "Renewable Energy",
        "Transport",
        "Urban Development",
        "Water",
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
