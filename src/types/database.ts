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
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      };
      companies: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
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
    };
    Views: Record<never, never>;
    Functions: {
      bootstrap_user_org: {
        Args: { p_org_name?: string };
        Returns: string;
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
      search_people: {
        Args: { p_text?: string | null; p_org_id?: string | null; p_limit?: number };
        Returns: Record<string, Json>[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
