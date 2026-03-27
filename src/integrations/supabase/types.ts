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
      alerts: {
        Row: {
          created_at: string
          id: string
          message: string
          project_id: string | null
          project_name: string
          read: boolean
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          project_id?: string | null
          project_name: string
          read?: boolean
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          project_id?: string | null
          project_name?: string
          read?: boolean
          severity?: Database["public"]["Enums"]["alert_severity"]
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
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string | null
          display_name: string | null
          id: string
          onboarded: boolean | null
          regions: string[] | null
          role: string | null
          sectors: string[] | null
          stages: string[] | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          onboarded?: boolean | null
          regions?: string[] | null
          role?: string | null
          sectors?: string[] | null
          stages?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
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
      [_ in never]: never
    }
    Enums: {
      alert_severity: "critical" | "high" | "medium" | "low"
      evidence_type: "Satellite" | "Filing" | "News" | "Registry" | "Partner"
      project_region: "MENA" | "East Africa" | "West Africa"
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
      alert_severity: ["critical", "high", "medium", "low"],
      evidence_type: ["Satellite", "Filing", "News", "Registry", "Partner"],
      project_region: ["MENA", "East Africa", "West Africa"],
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
