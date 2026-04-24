/**
 * Hand-authored Database type to keep the app type-safe before
 * `pnpm db:types` generates `src/types/supabase.ts`.
 *
 * Shape mirrors what Supabase's type generator produces so @supabase/ssr
 * and @supabase/supabase-js can infer Table / RPC types correctly.
 *
 * After running `pnpm db:types`, replace the body of this file with:
 *   export type { Database, Json } from "./supabase";
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Ts = string;

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; created_at: Ts };
        Insert: { id?: string; name: string; created_at?: Ts };
        Update: { id?: string; name?: string; created_at?: Ts };
        Relationships: [];
      };
      memberships: {
        Row: { user_id: string; org_id: string; role: string };
        Insert: { user_id: string; org_id: string; role?: string };
        Update: { user_id?: string; org_id?: string; role?: string };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          icp_description: string | null;
          brand_voice: string | null;
          is_archived: boolean;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          slug: string;
          icp_description?: string | null;
          brand_voice?: string | null;
          is_archived?: boolean;
          created_at?: Ts;
          updated_at?: Ts;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          icp_description?: string | null;
          brand_voice?: string | null;
          is_archived?: boolean;
          created_at?: Ts;
          updated_at?: Ts;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          name: string;
          status: string;
          tier: number;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          name: string;
          status?: string;
          tier?: number;
          created_at?: Ts;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          name?: string;
          status?: string;
          tier?: number;
          created_at?: Ts;
        };
        Relationships: [];
      };
      people: {
        Row: {
          id: string;
          linkedin_url: string | null;
          linkedin_hash_id: string | null;
          public_identifier: string | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          headline: string | null;
          about: string | null;
          location: string | null;
          country: string | null;
          photo_url: string | null;
          current_company_id: string | null;
          current_title: string | null;
          connections_count: number | null;
          followers_count: number | null;
          dedup_key: string | null;
          data_json: Json;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          linkedin_url: string | null;
          domain: string | null;
          name: string | null;
          industry: string | null;
          employee_count: number | null;
          employee_range: string | null;
          website: string | null;
          hq_city: string | null;
          hq_country: string | null;
          description: string | null;
          logo_url: string | null;
          data_json: Json;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      audiences: {
        Row: {
          id: string;
          org_id: string;
          client_id: string | null;
          name: string;
          source: string;
          row_count: number;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id?: string | null;
          name: string;
          source?: string;
          row_count?: number;
          created_at?: Ts;
        };
        Update: Partial<{
          id: string;
          org_id: string;
          client_id: string | null;
          name: string;
          source: string;
          row_count: number;
          created_at: Ts;
        }>;
        Relationships: [];
      };
      people_in_campaign: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      enrichments: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      job_runs: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      replies: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      webhooks_log: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      table_views: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          entity: string;
          name: string;
          column_state: Json;
          filters: Json;
          sorts: Json;
          is_default: boolean;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          entity: string;
          name: string;
          column_state: Json;
          filters?: Json;
          sorts?: Json;
          is_default?: boolean;
          updated_at?: Ts;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          org_id: string;
          entity: string;
          name: string;
          column_state: Json;
          filters: Json;
          sorts: Json;
          is_default: boolean;
          updated_at: Ts;
        }>;
        Relationships: [];
      };
    };
    Views: {
      v_people_with_company: {
        Row: {
          id: string;
          linkedin_url: string | null;
          linkedin_hash_id: string | null;
          public_identifier: string | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          headline: string | null;
          about: string | null;
          location: string | null;
          country: string | null;
          photo_url: string | null;
          current_title: string | null;
          current_company_id: string | null;
          connections_count: number | null;
          followers_count: number | null;
          dedup_key: string | null;
          data_json: Json;
          created_at: Ts;
          updated_at: Ts;
          company_name: string | null;
          company_domain: string | null;
          company_industry: string | null;
          company_linkedin_url: string | null;
          company_logo_url: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      bootstrap_user_org: {
        Args: { p_org_name?: string };
        Returns: string;
      };
      bulk_upsert_companies: {
        Args: { p_rows: Json };
        Returns: { inserted: number; matched: number }[];
      };
      bulk_upsert_people: {
        Args: { p_rows: Json };
        Returns: { inserted: number; matched: number; linked_companies: number }[];
      };
      update_person_fields: {
        Args: {
          p_id: string;
          p_first_name?: string | null;
          p_last_name?: string | null;
          p_full_name?: string | null;
          p_current_title?: string | null;
          p_location?: string | null;
          p_country?: string | null;
        };
        Returns: Database["public"]["Tables"]["people"]["Row"];
      };
      enqueue_job: {
        Args: { p_type: string; p_payload: Json; p_org_id: string; p_delay?: number };
        Returns: number;
      };
      queue_health: {
        Args: Record<string, never>;
        Returns: { queue_name: string; queue_length: number; oldest_msg_age_sec: number }[];
      };
      replay_dlq: {
        Args: { p_msg_id: number };
        Returns: number;
      };
      list_dlq: {
        Args: { p_limit?: number };
        Returns: { msg_id: number; enqueued_at: string; read_ct: number; message: Json }[];
      };
      search_people: {
        Args: { p_text?: string | null; p_org_id?: string | null; p_limit?: number };
        Returns: Record<string, Json>[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
