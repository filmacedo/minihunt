export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      fid_week_earnings: {
        Row: {
          created_at: string;
          earning_amount: string | null;
          fid: string;
          id: string;
          paid_amount: string | null;
          week_id: string | null;
        };
        Insert: {
          created_at?: string;
          earning_amount?: string | null;
          fid: string;
          id?: string;
          paid_amount?: string | null;
          week_id?: string | null;
        };
        Update: {
          created_at?: string;
          earning_amount?: string | null;
          fid?: string;
          id?: string;
          paid_amount?: string | null;
          week_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fid_week_earnings_week_id_fkey";
            columns: ["week_id"];
            referencedRelation: "weeks";
            referencedColumns: ["id"];
            isOneToOne: false;
          }
        ];
      };
      mini_apps: {
        Row: {
          created_at: string;
          description: string | null;
          frame_signature: string;
          frame_url: string;
          icon_url: string | null;
          id: string;
          image_url: string | null;
          name: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          frame_signature: string;
          frame_url: string;
          icon_url?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          frame_signature?: string;
          frame_url?: string;
          icon_url?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
      week_votes: {
        Row: {
          created_at: string;
          fid: string;
          id: string;
          mini_app_id: string;
          paid_amount: string | null;
          transaction_hash: string;
          week_id: string;
        };
        Insert: {
          created_at?: string;
          fid: string;
          id?: string;
          mini_app_id: string;
          paid_amount?: string | null;
          transaction_hash: string;
          week_id: string;
        };
        Update: {
          created_at?: string;
          fid?: string;
          id?: string;
          mini_app_id?: string;
          paid_amount?: string | null;
          transaction_hash?: string;
          week_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "week_votes_mini_app_id_fkey";
            columns: ["mini_app_id"];
            referencedRelation: "mini_apps";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
          {
            foreignKeyName: "week_votes_week_id_fkey";
            columns: ["week_id"];
            referencedRelation: "weeks";
            referencedColumns: ["id"];
            isOneToOne: false;
          }
        ];
      };
      users: {
        Row: {
          id: string;
          created_at: string;
          name: string | null;
          bio: string | null;
          profile_image_url: string | null;
        };
        Insert: {
          id?: string | number;
          created_at?: string;
          name?: string | null;
          bio?: string | null;
          profile_image_url?: string | null;
        };
        Update: {
          id?: string | number;
          created_at?: string;
          name?: string | null;
          bio?: string | null;
          profile_image_url?: string | null;
        };
        Relationships: [];
      };
      weeks: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          prize_pool: string | null;
          start_time: string;
          total_unique_voters: string | null;
          total_voters: string | null;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          prize_pool?: string | null;
          start_time: string;
          total_unique_voters?: string | null;
          total_voters?: string | null;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          prize_pool?: string | null;
          start_time?: string;
          total_unique_voters?: string | null;
          total_voters?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

