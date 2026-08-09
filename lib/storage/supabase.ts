import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Hand-authored to match supabase/migrations/0001_init.sql exactly. Once a
 * live project is linked, prefer regenerating this with the Supabase CLI
 * (`supabase gen types typescript`) and reconciling any drift.
 *
 * `status` and `review_status` are typed as `string` here rather than a union
 * — Phase 4's types/status.ts is the single source of truth for those enums
 * and nowhere else may redefine them.
 */
interface StatusHistoryEntry {
  status: string;
  at: string;
  message?: string;
}

export interface Database {
  public: {
    Tables: {
      documents: {
        Relationships: [];
        Row: {
          id: string;
          filename: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          status: string;
          status_history: StatusHistoryEntry[];
          error_reason: string | null;
          processing_confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          status?: string;
          status_history?: StatusHistoryEntry[];
          error_reason?: string | null;
          processing_confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };
      document_extractions: {
        Relationships: [
          {
            foreignKeyName: 'document_extractions_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
        ];
        Row: {
          id: string;
          document_id: string;
          review_status: string;
          vendor_name: string | null;
          document_number: string | null;
          document_date: string | null;
          currency: string | null;
          subtotal_amount: number | null;
          tax_amount: number | null;
          total_amount: number | null;
          raw_text: string | null;
          extracted_data: Record<string, unknown> | null;
          field_confidence: Record<string, number> | null;
          ocr_quality_score: number | null;
          schema_valid: boolean | null;
          missing_fields: string[] | null;
          overall_confidence: number | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          review_status?: string;
          vendor_name?: string | null;
          document_number?: string | null;
          document_date?: string | null;
          currency?: string | null;
          subtotal_amount?: number | null;
          tax_amount?: number | null;
          total_amount?: number | null;
          raw_text?: string | null;
          extracted_data?: Record<string, unknown> | null;
          field_confidence?: Record<string, number> | null;
          ocr_quality_score?: number | null;
          schema_valid?: boolean | null;
          missing_fields?: string[] | null;
          overall_confidence?: number | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['document_extractions']['Insert']>;
      };
      line_items: {
        Relationships: [];
        Row: {
          id: string;
          draft_id: string;
          description: string | null;
          quantity: number | null;
          unit_price: number | null;
          amount: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          draft_id: string;
          description?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          amount?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['line_items']['Insert']>;
      };
      exports: {
        Relationships: [];
        Row: {
          id: string;
          format: string;
          filters: Record<string, unknown>;
          record_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          format: string;
          filters?: Record<string, unknown>;
          record_count?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exports']['Insert']>;
      };
      processing_logs: {
        Relationships: [];
        Row: {
          id: string;
          document_id: string;
          step: string;
          status: string;
          duration_ms: number | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          step: string;
          status: string;
          duration_ms?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['processing_logs']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export const DOCUMENTS_BUCKET = 'documents';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let adminClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses Row Level Security — server-side only
 * (API routes, jobs). Never import this into client components.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (!adminClient) {
    adminClient = createClient<Database>(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );
  }
  return adminClient;
}

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Anon-key client, safe to use in the browser. Subject to Row Level Security.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createClient<Database>(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    );
  }
  return browserClient;
}
