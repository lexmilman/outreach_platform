/**
 * Hand-authored minimal Database type to keep the app type-safe
 * before `pnpm db:types` generates `src/types/supabase.ts`.
 *
 * After running `pnpm db:types`, re-export from the generated file:
 *   export type { Database } from "./supabase";
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      memberships: {
        Row: { user_id: string; org_id: string; role: "owner" | "admin" | "member" };
        Insert: { user_id: string; org_id: string; role?: "owner" | "admin" | "member" };
        Update: { user_id?: string; org_id?: string; role?: "owner" | "admin" | "member" };
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          slug: string;
          icp_description?: string | null;
          brand_voice?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          icp_description?: string | null;
          brand_voice?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          name: string;
          status?: string;
          tier?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          name?: string;
          status?: string;
          tier?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
